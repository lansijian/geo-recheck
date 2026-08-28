from __future__ import annotations

import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.db.session import Base, SessionLocal, engine  # noqa: E402
from app.services.inspection import seed_baseline  # noqa: E402
from app.services.registry import seed_points  # noqa: E402


def main() -> None:
    Base.metadata.create_all(bind=engine)
    with SessionLocal() as session:
        seed_points(session)
        seed_baseline(session)
    print("Demo point registry and baseline are ready.")


if __name__ == "__main__":
    main()

