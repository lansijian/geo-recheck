from __future__ import annotations

import json
from datetime import datetime, timedelta

from sqlalchemy import create_engine, delete, inspect, text
from sqlalchemy.orm import Session

from app.db.session import Base, SessionLocal, migrate_schema
from app.models import Inspection, MarkerAssignment, MonitorPoint
from app.services.inspection import last_confirmed_inspection
from scripts.reset_demo import reset_demo_records


def test_deleted_point_releases_its_marker_block(client, point_payload):
    first = client.post("/api/points", json=point_payload("MP-T-REUSE-A")).json()
    released = first["left_marker_group"] + first["right_marker_group"]
    with SessionLocal() as session:
        session.execute(delete(MarkerAssignment).where(MarkerAssignment.monitor_point_id == "MP-T-REUSE-A"))
        session.execute(delete(MonitorPoint).where(MonitorPoint.monitor_point_id == "MP-T-REUSE-A"))
        session.commit()

    second = client.post("/api/points", json=point_payload("MP-T-REUSE-B")).json()
    assert second["left_marker_group"] + second["right_marker_group"] == released


def test_rejected_capture_never_becomes_previous(client, point_payload):
    client.post("/api/points", json=point_payload("MP-T-PREVIOUS"))
    now = datetime.now()
    with SessionLocal() as session:
        confirmed = Inspection(
            id="10000000-0000-0000-0000-000000000001",
            monitor_point_id="MP-T-PREVIOUS",
            capture_time=now,
            measurement_status="confirmed",
            human_confirmed=True,
            quality_score=1.0,
        )
        rejected = Inspection(
            id="10000000-0000-0000-0000-000000000002",
            monitor_point_id="MP-T-PREVIOUS",
            capture_time=now + timedelta(minutes=1),
            measurement_status="rejected",
            human_confirmed=False,
            quality_score=0.0,
        )
        session.add_all([confirmed, rejected])
        session.commit()
        assert last_confirmed_inspection(session, "MP-T-PREVIOUS").id == confirmed.id


def test_real_point_measurement_has_no_demo_fallback(
    client, make_point, crack_photo
):
    point_id = "MP-T-ISOLATION"
    boards = make_point(point_id)
    response = client.post(
        f"/api/points/{point_id}/baseline",
        files={"image": ("baseline.png", crack_photo(boards, 0.0), "image/png")},
    )
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["crack_id"] == point_id
    assert payload["demo_case_id"] is None
    assert payload["data_provenance"]["mode"] == "field"
    assert payload["location_mode"] == "unavailable"
    serialized = json.dumps(payload, ensure_ascii=False)
    assert "CRACK-W01" not in serialized
    assert "controlled synthetic" not in serialized


def test_points_api_does_not_expose_demo_readiness_to_real_business(client):
    payload = client.get("/api/points").json()
    assert payload
    assert all("demo_ready" not in item for item in payload)


def test_fresh_database_declares_business_foreign_keys(tmp_path):
    target = create_engine(f"sqlite:///{(tmp_path / 'fresh.db').as_posix()}")
    Base.metadata.create_all(target)
    with target.connect() as connection:
        inspection_fks = connection.execute(text("PRAGMA foreign_key_list(inspections)"))
        point_fks = connection.execute(text("PRAGMA foreign_key_list(monitor_points)"))
        review_fks = connection.execute(text("PRAGMA foreign_key_list(ai_reviews)"))
        item_fks = connection.execute(text("PRAGMA foreign_key_list(ai_review_items)"))
        assert {row[2] for row in inspection_fks} == {"monitor_points"}
        assert {row[2] for row in point_fks} == {"inspections"}
        assert {row[2] for row in review_fks} == {"inspections"}
        assert {row[2] for row in item_fks} == {"inspections", "ai_reviews"}


def test_existing_v06_database_migrates_without_losing_rows(tmp_path):
    target = create_engine(f"sqlite:///{(tmp_path / 'legacy.db').as_posix()}")
    with target.begin() as connection:
        connection.execute(text("""
            CREATE TABLE monitor_points (
                monitor_point_id VARCHAR(64) PRIMARY KEY,
                hazard_id VARCHAR(64) NOT NULL,
                hazard_name VARCHAR(200) NOT NULL,
                monitor_point_name VARCHAR(200) NOT NULL,
                structure_id VARCHAR(64) NOT NULL,
                structure_name VARCHAR(200) NOT NULL,
                location_description VARCHAR(300) NOT NULL,
                latitude FLOAT NOT NULL,
                longitude FLOAT NOT NULL,
                elevation FLOAT,
                baseline_mm FLOAT NOT NULL,
                left_marker_group VARCHAR(100) NOT NULL,
                right_marker_group VARCHAR(100) NOT NULL,
                is_demo_location BOOLEAN NOT NULL
            )
        """))
        connection.execute(text("""
            CREATE TABLE inspections (
                id VARCHAR(36) PRIMARY KEY,
                monitor_point_id VARCHAR(64) NOT NULL,
                capture_time DATETIME NOT NULL,
                quality_score FLOAT NOT NULL,
                measurement_status VARCHAR(50) NOT NULL,
                human_confirmed BOOLEAN NOT NULL,
                location_mode VARCHAR(30) NOT NULL
            )
        """))
        connection.execute(text("""
            CREATE TABLE marker_assignments (
                marker_id INTEGER PRIMARY KEY,
                monitor_point_id VARCHAR(64) NOT NULL REFERENCES monitor_points(monitor_point_id),
                side VARCHAR(8) NOT NULL,
                slot INTEGER NOT NULL
            )
        """))
        connection.execute(text("""
            INSERT INTO monitor_points VALUES (
                'MP-LEGACY','HZ-1','旧隐患点','旧点位','W-1','旧墙体','旧位置',
                27.1,106.1,NULL,300.0,'40,41,42,43','44,45,46,47',0
            )
        """))
        connection.execute(text("""
            INSERT INTO inspections (id, monitor_point_id, capture_time, quality_score,
              measurement_status, human_confirmed, location_mode)
            VALUES ('legacy-inspection','MP-LEGACY','2026-08-01 00:00:00',1.0,'confirmed',1,'browser')
        """))

    migrate_schema(target)

    with target.connect() as connection:
        point = connection.execute(text("SELECT monitor_point_id, latitude FROM monitor_points")).one()
        inspection_count = connection.execute(text("SELECT COUNT(*) FROM inspections")).scalar_one()
        marker_count = connection.execute(text("SELECT COUNT(*) FROM marker_assignments")).scalar_one()
        columns = {column["name"] for column in inspect(connection).get_columns("inspections")}
        assert point == ("MP-LEGACY", 27.1)
        assert inspection_count == 1
        assert marker_count == 8
        assert {"capture_mode", "opening_since_baseline_mm", "camera_profile_is_demo"} <= columns
        assert connection.execute(text("PRAGMA foreign_key_check")).all() == []


def test_live_database_foreign_key_check_is_clean(client):
    client.get("/api/health")
    with SessionLocal() as session:
        assert session.execute(text("PRAGMA foreign_keys")).scalar_one() == 1
        assert session.execute(text("PRAGMA foreign_key_check")).all() == []


def test_showcase_reset_preserves_real_point_inspections(client, point_payload):
    point_id = "MP-T-DEMO-RESET"
    client.post("/api/points", json=point_payload(point_id))
    inspection_id = "10000000-0000-0000-0000-000000000003"
    with SessionLocal() as session:
        session.add(Inspection(id=inspection_id, monitor_point_id=point_id, capture_time=datetime.now(), measurement_status="confirmed", human_confirmed=True, quality_score=1.0))
        session.commit()
        reset_demo_records(session)
        assert session.get(Inspection, inspection_id) is not None
