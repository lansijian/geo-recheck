from __future__ import annotations

import sys
from pathlib import Path

from sqlalchemy import delete, or_, select


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.db.session import Base, SessionLocal, engine, migrate_schema  # noqa: E402
from app.models import AIReview, AIReviewItem, BenchmarkTrial, Inspection  # noqa: E402
from app.services.inspection import seed_baseline  # noqa: E402
from app.services.registry import seed_points  # noqa: E402


def reset_demo_records(session) -> None:
    """Reset only Showcase fixtures; real point inspections must never be touched."""
    demo_inspection_ids = select(Inspection.id).where(
        or_(Inspection.monitor_point_id == "MP-03", Inspection.demo_case_id.is_not(None))
    )
    demo_review_ids = select(AIReview.id).where(AIReview.inspection_id.in_(demo_inspection_ids))
    session.execute(delete(AIReviewItem).where(AIReviewItem.review_id.in_(demo_review_ids)))
    session.execute(delete(AIReview).where(AIReview.inspection_id.in_(demo_inspection_ids)))
    session.execute(delete(Inspection).where(Inspection.id.in_(demo_inspection_ids)))
    session.execute(delete(BenchmarkTrial))
    session.commit()
    seed_points(session)
    seed_baseline(session)


def main() -> None:
    Base.metadata.create_all(bind=engine)
    migrate_schema()
    with SessionLocal() as session:
        reset_demo_records(session)
    print("Demo records reset to CRACK-W01 baseline (0.0 mm relative opening; 8.0 mm controlled initial width).")


if __name__ == "__main__":
    main()
