from __future__ import annotations

import sys
from pathlib import Path

from sqlalchemy import delete


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.db.session import Base, SessionLocal, engine, migrate_schema  # noqa: E402
from app.models import AIReview, AIReviewItem, BenchmarkTrial, Inspection  # noqa: E402
from app.services.inspection import seed_baseline  # noqa: E402
from app.services.registry import seed_points  # noqa: E402


def main() -> None:
    Base.metadata.create_all(bind=engine)
    migrate_schema()
    with SessionLocal() as session:
        session.execute(delete(AIReviewItem))
        session.execute(delete(AIReview))
        session.execute(delete(BenchmarkTrial))
        session.execute(delete(Inspection))
        session.commit()
        seed_points(session)
        seed_baseline(session)
    print("Demo records reset to CRACK-W01 baseline (0.0 mm relative opening; 8.0 mm controlled initial width).")


if __name__ == "__main__":
    main()
