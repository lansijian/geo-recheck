from __future__ import annotations

import sys
from pathlib import Path

from sqlalchemy import delete


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.db.session import SessionLocal  # noqa: E402
from app.models import BenchmarkTrial, Inspection  # noqa: E402


BASELINE_ID = "00000000-0000-0000-0000-000000000003"


def main() -> None:
    with SessionLocal() as session:
        session.execute(delete(BenchmarkTrial))
        session.execute(delete(Inspection).where(Inspection.id != BASELINE_ID))
        session.commit()
    print("Demo records reset to the seeded 243.2 mm baseline.")


if __name__ == "__main__":
    main()

