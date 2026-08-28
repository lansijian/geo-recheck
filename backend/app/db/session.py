from __future__ import annotations

from collections.abc import Generator

from sqlalchemy import create_engine, event, inspect, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import DATABASE_PATH


DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)


class Base(DeclarativeBase):
    pass


engine = create_engine(
    f"sqlite:///{DATABASE_PATH.as_posix()}",
    connect_args={"check_same_thread": False},
)


@event.listens_for(engine, "connect")
def _enable_sqlite_foreign_keys(dbapi_connection, _) -> None:
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()
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

V04_INSPECTION_COLUMNS = {
    "demo_case_id": "VARCHAR(64)",
}

V05_INSPECTION_COLUMNS = {
    "capture_mode": "VARCHAR(16)",
    "planar_x_mm": "FLOAT",
    "planar_y_mm": "FLOAT",
    "opening_since_baseline_mm": "FLOAT",
    "shear_since_baseline_mm": "FLOAT",
    "camera_profile_is_demo": "BOOLEAN",
    "context_photo_used": "VARCHAR(500)",
}

V05_POINT_COLUMNS = {
    "baseline_inspection_id": "VARCHAR(36)",
    "context_photo_path": "VARCHAR(500)",
    "context_photo_captured_at": "DATETIME",
    "context_callouts": "TEXT",
}

LEGACY_POINT_COLUMNS = (
    "monitor_point_id, hazard_id, hazard_name, monitor_point_name, structure_id, "
    "structure_name, location_description, latitude, longitude, elevation, "
    "baseline_mm, left_marker_group, right_marker_group, is_demo_location"
)


def _add_missing_columns(connection, table: str, columns: dict[str, str]) -> None:
    existing = {column["name"] for column in inspect(connection).get_columns(table)}
    for name, sql_type in columns.items():
        if name not in existing:
            connection.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {sql_type}"))


def _monitor_points_need_rebuild(connection) -> bool:
    """The legacy schema declared latitude/longitude NOT NULL; new points may have neither."""
    for column in inspect(connection).get_columns("monitor_points"):
        if column["name"] == "latitude":
            return not column["nullable"]
    return False


def _rebuild_monitor_points(connection) -> None:
    # legacy_alter_table=ON makes RENAME a pure catalog rename: SQLite normally rewrites
    # any REFERENCES clause that names the old table (e.g. marker_assignments' FK) to
    # point at the new name, which would leave that FK referencing monitor_points_legacy
    # after it's dropped below. ON suppresses that rewrite so the FK keeps pointing at
    # "monitor_points" straight through the rename.
    connection.execute(text("PRAGMA legacy_alter_table=ON"))
    connection.execute(text("ALTER TABLE monitor_points RENAME TO monitor_points_legacy"))
    connection.execute(text("PRAGMA legacy_alter_table=OFF"))
    # SQLite does not rename a table's indexes along with the table itself, so the old
    # named index (e.g. ix_monitor_points_hazard_id) stays attached to *_legacy and
    # would collide with the identically-named index the fresh CREATE TABLE defines below.
    stale_indexes = connection.execute(
        text(
            "SELECT name FROM sqlite_master WHERE type = 'index' "
            "AND tbl_name = 'monitor_points_legacy' AND name NOT LIKE 'sqlite_autoindex_%'"
        )
    ).scalars().all()
    for index_name in stale_indexes:
        connection.execute(text(f"DROP INDEX {index_name}"))
    Base.metadata.tables["monitor_points"].create(bind=connection)
    connection.execute(
        text(
            f"INSERT INTO monitor_points ({LEGACY_POINT_COLUMNS}) "
            f"SELECT {LEGACY_POINT_COLUMNS} FROM monitor_points_legacy"
        )
    )
    connection.execute(text("DROP TABLE monitor_points_legacy"))


def _backfill_marker_assignments(connection) -> None:
    """One-time move of the comma-separated groups into the uniqueness-bearing table."""
    rows = connection.execute(
        text("SELECT monitor_point_id, left_marker_group, right_marker_group FROM monitor_points")
    ).all()
    for point_id, left_group, right_group in rows:
        for side, group in (("left", left_group), ("right", right_group)):
            for slot, raw in enumerate(item for item in (group or "").split(",") if item):
                connection.execute(
                    text(
                        "INSERT OR IGNORE INTO marker_assignments "
                        "(marker_id, monitor_point_id, side, slot) "
                        "VALUES (:marker_id, :point_id, :side, :slot)"
                    ),
                    {"marker_id": int(raw), "point_id": point_id, "side": side, "slot": slot},
                )


def _repair_dangling_baselines(connection) -> None:
    """A legacy demo reset deleted every inspection and left point references stale."""
    connection.execute(
        text(
            "UPDATE monitor_points SET baseline_inspection_id = NULL "
            "WHERE baseline_inspection_id IS NOT NULL AND NOT EXISTS ("
            "SELECT 1 FROM inspections WHERE inspections.id = monitor_points.baseline_inspection_id)"
        )
    )


def migrate_schema(target_engine: Engine = engine) -> None:
    """Additive migration plus a guarded rebuild so an existing SQLite file stays usable."""
    with target_engine.begin() as connection:
        _add_missing_columns(
            connection, "inspections",
            {**V03_INSPECTION_COLUMNS, **V04_INSPECTION_COLUMNS, **V05_INSPECTION_COLUMNS},
        )
        _add_missing_columns(connection, "monitor_points", V05_POINT_COLUMNS)
        if _monitor_points_need_rebuild(connection):
            _rebuild_monitor_points(connection)
        _backfill_marker_assignments(connection)
        _repair_dangling_baselines(connection)


def get_db() -> Generator[Session, None, None]:
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
