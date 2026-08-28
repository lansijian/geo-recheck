from __future__ import annotations

import argparse
import json
import sys
import uuid
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.db.session import SessionLocal  # noqa: E402
from app.models import AIReview, AIReviewItem, Inspection  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description="为浏览器回归写入一份确定性的真实点位 AI 结果。")
    parser.add_argument("--inspection", required=True)
    args = parser.parse_args()
    with SessionLocal() as session:
        inspection = session.get(Inspection, args.inspection)
        if inspection is None or inspection.demo_case_id is not None:
            raise SystemExit("只允许为已存在的真实点位复测写入测试复核。")
        review = AIReview(
            id=str(uuid.uuid4()), inspection_id=inspection.id, provider="stepfun",
            model="step-3.7-flash-e2e-fixture", status="completed", attempts=1,
            parsed_json=json.dumps({
                "scene_consistency": "likely_same", "coverage_complete": True,
                "missing_views": [], "observations": [],
                "record_draft": "现场近景可见变化待人工确认。",
                "disclaimer": "仅提供可见变化提示，不作风险判断。",
            }, ensure_ascii=False),
        )
        session.add(review)
        session.flush()
        session.add_all([
            AIReviewItem(review_id=review.id, inspection_id=inspection.id, item_index=0, observation_type="wall_surface_change", observation_state="new", evidence="本次近景右下区域出现新的深色水迹。", confidence="medium", requires_human_check=True, human_status="pending"),
            AIReviewItem(review_id=review.id, inspection_id=inspection.id, item_index=1, observation_type="coverage_missing", observation_state="uncertain", evidence="拍摄角度变化，建议人工核对边缘覆盖范围。", confidence="low", requires_human_check=True, human_status="pending"),
        ])
        session.commit()
        print(review.id)


if __name__ == "__main__":
    main()
