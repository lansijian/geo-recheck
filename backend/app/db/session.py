from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import DATABASE_PATH


DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)


class Base(DeclarativeBase):
    pass


engine = create_engine(
    f"sqlite:///{DATABASE_PATH.as_posix()}",
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


V03_INSPECTION_COLUMNS = {
    "crack_id": "VARCHAR(64)",
    "scene_type": "VARCHAR(64)",
    "baseline_crack_width_mm": "FLOAT",
    "opening_delta_mm": "FLOAT",
    "shear_delta_mm": "FLOAT",
    "out_of_plane_delta_mm": "FLOAT",
    "measurement_mode": "VARCHAR(64)",
    "detector_type": "VARCHAR(64)",
    "data_provenance": "TEXT",
}


def migrate_schema() -> None:
    """Small additive migration so an existing V0.2 SQLite file remains usable."""
    columns = {column["name"] for column in inspect(engine).get_columns("inspections")}
    with engine.begin() as connection:
        for name, sql_type in V03_INSPECTION_COLUMNS.items():
            if name not in columns:
                connection.execute(text(f"ALTER TABLE inspections ADD COLUMN {name} {sql_type}"))


def get_db() -> Generator[Session, None, None]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
