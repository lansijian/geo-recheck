from __future__ import annotations

import json
import logging
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app import config
from app.models import AIReview, AIReviewItem, Inspection, MonitorPoint
from app.schemas.ai_review import AIFieldReview
from app.services.inspection import last_confirmed_inspection
from app.services.stepfun_observer import StepFunReviewError, run_field_review


DECISION_STATES = {"accepted", "rejected", "edited"}
LOGGER = logging.getLogger(__name__)


@dataclass(frozen=True)
class ReviewImages:
    context: Path      # 图1 site overview: a constant reference, not a change input
    previous: Path      # 图2 last confirmed close-up
    current: Path      # 图3 this capture


def _case_paths(case_id: str) -> ReviewImages:
    if not case_id.startswith("case_") or any(token in case_id for token in ("/", "\\", "..")):
        raise ValueError("Demo Case 编号无效。")
    case_root = (config.DEMO_CASES_ROOT / case_id).resolve()
    if case_root.parent != config.DEMO_CASES_ROOT.resolve() or not case_root.is_dir():
        raise ValueError("Demo Case 不存在。")
    return ReviewImages(
        case_root / "context.jpg",
        case_root / "previous_close.jpg",
        case_root / "current_close.jpg",
    )


def resolve_review_images(
    session: Session, inspection: Inspection, case_id: str | None
) -> ReviewImages:
    if case_id:
        return _case_paths(case_id)
    if inspection.capture_mode == "baseline":
        raise ValueError("首次建档没有可比较的上次近景，基线采集不提供 AI 现场复核。")
    point = session.get(MonitorPoint, inspection.monitor_point_id)
    if point is None or not point.context_photo_path:
        raise ValueError("该监测点尚未上传现场全景，无法进行 AI 现场复核。")
    previous = last_confirmed_inspection(
        session, inspection.monitor_point_id, before=inspection.capture_time
    )
    if previous is None:
        raise ValueError("该监测点没有上一次已确认记录，无法比较。")
    context = config.EVIDENCE_ROOT / "points" / point.monitor_point_id / "context.jpg"
    if not context.exists():
        raise ValueError("该监测点的现场全景文件缺失，请重新上传。")
    return ReviewImages(
        context,
        config.EVIDENCE_ROOT / previous.id / "original.png",
        config.EVIDENCE_ROOT / inspection.id / "original.png",
    )


def latest_ai_review(session: Session, inspection_id: str) -> AIReview | None:
    stale_before = datetime.utcnow() - timedelta(
        seconds=max(config.STEPFUN_TIMEOUT_SECONDS + 15, 195)
    )
    stale_reviews = session.scalars(
        select(AIReview).where(
            AIReview.inspection_id == inspection_id,
            AIReview.status == "running",
            AIReview.created_at < stale_before,
        )
    ).all()
    if stale_reviews:
        for stale_review in stale_reviews:
            stale_review.status = "failed"
            stale_review.error_code = "interrupted"
            stale_review.error_message = (
                "AI 复核在服务中断后未完成，请重新运行。"
            )
        session.commit()
    return session.scalar(
        select(AIReview)
        .where(AIReview.inspection_id == inspection_id)
        .order_by(desc(AIReview.created_at), desc(AIReview.id))
    )


def ai_review_to_dict(session: Session, review: AIReview) -> dict[str, Any]:
    items = session.scalars(
        select(AIReviewItem)
        .where(AIReviewItem.review_id == review.id)
        .order_by(AIReviewItem.item_index)
    ).all()
    parsed = json.loads(review.parsed_json) if review.parsed_json else None
    return {
        "id": review.id,
        "inspection_id": review.inspection_id,
        "provider": review.provider,
        "model": review.model,
        "status": review.status,
        "parsed": parsed,
        "created_at": review.created_at.isoformat(),
        "latency_ms": review.latency_ms,
        "attempts": review.attempts,
        "error_code": review.error_code,
        "error_message": review.error_message,
        "items": [
            {
                "id": item.id,
                "type": item.observation_type,
                "state": item.observation_state,
                "evidence": item.evidence,
                "confidence": item.confidence,
                "requires_human_check": item.requires_human_check,
                "human_status": item.human_status,
                "edited_evidence": item.edited_evidence,
            }
            for item in items
        ],
    }


def run_and_persist_ai_review(
    session: Session,
    inspection: Inspection,
    case_id: str | None = None,
) -> dict[str, Any]:
    images = resolve_review_images(session, inspection, case_id)
    review = AIReview(
        id=str(uuid.uuid4()),
        inspection_id=inspection.id,
        provider="stepfun",
        model=config.STEPFUN_MODEL,
        status="running",
        attempts=0,
    )
    if case_id:
        inspection.demo_case_id = case_id
    inspection.context_photo_used = str(images.context)
    session.add(review)
    session.commit()
    try:
        parsed, latency_ms, attempts = run_field_review(
            images.context,
            images.previous,
            images.current,
            {
                "crack_id": inspection.crack_id or "CRACK-W01",
                "opening_delta_mm": (
                    inspection.opening_delta_mm
                    if inspection.measurement_status != "rejected"
                    else None
                ),
                "measurement_status": inspection.measurement_status,
            },
        )
    except StepFunReviewError as error:
        review.status = "failed"
        review.error_code = error.code
        review.error_message = str(error)
        session.commit()
        return ai_review_to_dict(session, review)
    except Exception:
        LOGGER.exception("Unexpected StepFun field-review failure")
        review.status = "failed"
        review.error_code = "internal_error"
        review.error_message = "AI 复核发生内部异常，请重新运行。"
        session.commit()
        return ai_review_to_dict(session, review)

    review.status = "completed"
    review.parsed_json = parsed.model_dump_json()
    review.latency_ms = latency_ms
    review.attempts = attempts
    for index, observation in enumerate(parsed.observations):
        session.add(
            AIReviewItem(
                review_id=review.id,
                inspection_id=inspection.id,
                item_index=index,
                observation_type=observation.type,
                observation_state=observation.state,
                evidence=observation.evidence,
                confidence=observation.confidence,
                requires_human_check=True,
                human_status="pending",
            )
        )
    session.commit()
    return ai_review_to_dict(session, review)


def persist_replayed_ai_review(
    session: Session,
    inspection: Inspection,
    case_id: str,
) -> dict[str, Any]:
    """Persist one audited StepFun response without making a network call."""
    _case_paths(case_id)
    showcase_path = config.DEMO_CASES_ROOT / case_id / "showcase.json"
    if not showcase_path.is_file():
        raise ValueError("该案例没有生成 Showcase 单一数据源。")
    showcase = json.loads(showcase_path.read_text(encoding="utf-8"))
    replay = showcase.get("ai_replay") or {}
    if replay.get("source_artifact") != "artifacts/ai_validation_v04/responses.jsonl":
        raise ValueError("AI 回放来源不是已审计的真实验证 artifact。")
    parsed = AIFieldReview.model_validate(replay.get("parsed"))
    review = AIReview(
        id=str(uuid.uuid4()),
        inspection_id=inspection.id,
        provider="stepfun",
        model=str(replay.get("model") or "step-3.7-flash"),
        status="completed",
        parsed_json=parsed.model_dump_json(),
        latency_ms=int(replay["original_latency_ms"]),
        attempts=int(replay.get("attempts") or 1),
    )
    inspection.demo_case_id = case_id
    session.add(review)
    for index, observation in enumerate(parsed.observations):
        session.add(
            AIReviewItem(
                review_id=review.id,
                inspection_id=inspection.id,
                item_index=index,
                observation_type=observation.type,
                observation_state=observation.state,
                evidence=observation.evidence,
                confidence=observation.confidence,
                requires_human_check=True,
                human_status="pending",
            )
        )
    session.commit()
    return ai_review_to_dict(session, review)


def decide_ai_review_item(
    session: Session,
    inspection_id: str,
    item_id: int,
    decision: str,
    edited_evidence: str | None = None,
) -> dict[str, Any]:
    if decision not in DECISION_STATES:
        raise ValueError("人工处理状态必须为 accepted、rejected 或 edited。")
    item = session.get(AIReviewItem, item_id)
    if item is None or item.inspection_id != inspection_id:
        raise LookupError("AI 观察项不存在。")
    if decision == "edited" and not (edited_evidence or "").strip():
        raise ValueError("编辑采纳时必须填写人工修改后的观察。")
    item.human_status = decision
    item.edited_evidence = edited_evidence.strip() if edited_evidence else None
    item.updated_at = datetime.utcnow()
    session.commit()
    review = session.get(AIReview, item.review_id)
    return ai_review_to_dict(session, review)


def build_confirmed_record_text(session: Session, inspection: Inspection) -> str:
    if inspection.capture_mode == "baseline":
        parts = ["本条记录用于建立该监测点的复测基线，不代表一次测得的变化。"]
    elif inspection.opening_delta_mm is None:
        parts = ["本次几何测量未通过质量门控，未形成毫米结果。"]
    else:
        parts = [f"本次裂缝较上期张开 {inspection.opening_delta_mm:.1f} mm"]
        if inspection.opening_since_baseline_mm is not None:
            parts.append(f"，自首次建档累计张开 {inspection.opening_since_baseline_mm:.1f} mm")
        parts.append("。")
    review = latest_ai_review(session, inspection.id)
    accepted: list[str] = []
    if review and review.status == "completed":
        items = session.scalars(
            select(AIReviewItem)
            .where(
                AIReviewItem.review_id == review.id,
                AIReviewItem.human_status.in_(("accepted", "edited")),
                AIReviewItem.observation_type != "none",
            )
            .order_by(AIReviewItem.item_index)
        ).all()
        accepted = [
            (item.edited_evidence if item.human_status == "edited" else item.evidence)
            for item in items
        ]
    if accepted:
        parts.extend(f"{text}，已由监测员人工确认。" for text in accepted)
    else:
        parts.append("未纳入其他 AI 可见变化观察。")
    parts.append("本记录不构成地质灾害风险判断。")
    return "".join(parts)
