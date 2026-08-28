from __future__ import annotations

import json
import uuid
from pathlib import Path

import pytest
from pydantic import ValidationError
from sqlalchemy import delete

from app.db.session import Base, SessionLocal, engine
from app.models import AIReview, AIReviewItem, Inspection
from app.schemas.ai_review import AIFieldReview
from app.services.ai_review import (
    build_confirmed_record_text,
    decide_ai_review_item,
    run_and_persist_ai_review,
)
from app.services.stepfun_observer import StepFunReviewError, ai_status, parse_review_response


FIXTURE = Path(__file__).parent / "fixtures" / "stepfun_response.json"


def test_parser_extracts_first_valid_json_and_validates_schema() -> None:
    raw = FIXTURE.read_text(encoding="utf-8")
    parsed = parse_review_response(f"以下是结果：\n```json\n{raw}\n```\n请人工确认。")
    assert parsed.scene_consistency == "same_location"
    assert parsed.observations[0].type == "seepage_or_water_stain"
    assert all(item.requires_human_check for item in parsed.observations)


def test_schema_rejects_non_human_and_decision_language() -> None:
    payload = json.loads(FIXTURE.read_text(encoding="utf-8"))
    payload["observations"][0]["requires_human_check"] = False
    with pytest.raises(ValidationError):
        AIFieldReview.model_validate(payload)

    payload = json.loads(FIXTURE.read_text(encoding="utf-8"))
    payload["record_draft"] = "该处属于高风险，应立即撤离。"
    with pytest.raises(ValidationError):
        AIFieldReview.model_validate(payload)


def test_ai_status_never_returns_key() -> None:
    status = ai_status()
    assert set(status) == {"enabled", "provider", "model", "configured"}
    assert "key" not in json.dumps(status).lower()


def test_human_decisions_control_final_record() -> None:
    Base.metadata.create_all(bind=engine)
    inspection_id = str(uuid.uuid4())
    review_id = str(uuid.uuid4())
    with SessionLocal() as session:
        inspection = Inspection(
            id=inspection_id,
            monitor_point_id="MP-03",
            crack_id="CRACK-W01",
            opening_delta_mm=4.8,
            measurement_status="pending",
            quality_score=0.9,
        )
        session.add(inspection)
        session.add(
            AIReview(
                id=review_id,
                inspection_id=inspection_id,
                provider="stepfun",
                model="step-3.7-flash",
                status="completed",
                parsed_json=FIXTURE.read_text(encoding="utf-8"),
                attempts=1,
            )
        )
        session.flush()
        seepage = AIReviewItem(
            review_id=review_id,
            inspection_id=inspection_id,
            item_index=0,
            observation_type="seepage_or_water_stain",
            observation_state="new",
            evidence="疑似新增水迹。",
            confidence="medium",
            requires_human_check=True,
            human_status="pending",
        )
        peeling = AIReviewItem(
            review_id=review_id,
            inspection_id=inspection_id,
            item_index=1,
            observation_type="spalling_or_peeling",
            observation_state="uncertain",
            evidence="疑似局部剥落。",
            confidence="low",
            requires_human_check=True,
            human_status="pending",
        )
        session.add_all([seepage, peeling])
        session.commit()
        assert "水迹" not in build_confirmed_record_text(session, inspection)

        decide_ai_review_item(session, inspection_id, seepage.id, "edited", "裂缝右下侧存在新增水迹。")
        decide_ai_review_item(session, inspection_id, peeling.id, "rejected")
        record = build_confirmed_record_text(session, inspection)
        assert "张开 4.8 mm" in record
        assert "裂缝右下侧存在新增水迹" in record
        assert "已由监测员人工确认" in record
        assert "剥落" not in record

        session.execute(delete(AIReviewItem).where(AIReviewItem.inspection_id == inspection_id))
        session.execute(delete(AIReview).where(AIReview.inspection_id == inspection_id))
        session.delete(inspection)
        session.commit()


def test_provider_failure_is_persisted_without_changing_geometry(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    Base.metadata.create_all(bind=engine)
    inspection_id = str(uuid.uuid4())

    def fail_review(*_args, **_kwargs):  # type: ignore[no-untyped-def]
        raise StepFunReviewError("quota", "StepFun 配额暂不可用。")

    monkeypatch.setattr("app.services.ai_review.run_field_review", fail_review)

    with SessionLocal() as session:
        inspection = Inspection(
            id=inspection_id,
            monitor_point_id="MP-03",
            crack_id="CRACK-W01",
            opening_delta_mm=4.8,
            measurement_status="pending",
            quality_score=0.9,
        )
        session.add(inspection)
        session.commit()

        result = run_and_persist_ai_review(session, inspection, "case_03_seepage")

        assert result["status"] == "failed"
        assert result["error_code"] == "quota"
        assert result["items"] == []
        session.refresh(inspection)
        assert inspection.opening_delta_mm == 4.8
        assert inspection.measurement_status == "pending"

        session.execute(delete(AIReviewItem).where(AIReviewItem.inspection_id == inspection_id))
        session.execute(delete(AIReview).where(AIReview.inspection_id == inspection_id))
        session.delete(inspection)
        session.commit()
