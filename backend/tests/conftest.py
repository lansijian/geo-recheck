from __future__ import annotations

import cv2
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, inspect

from app.cv.board_geometry import BoardSpec
from app.cv.synthetic import SyntheticCase, render_case
from app.db.session import SessionLocal, engine
from app.main import app
from app.models import Inspection, MarkerAssignment, MonitorPoint
from app.services.registry import boards_for_point


TEST_POINT_PREFIXES = ("MP-T", "MP-BL", "MP-AI")


@pytest.fixture(autouse=True)
def clean_test_points():
    """Points created by tests must not survive into the next run."""
    yield
    if not inspect(engine).has_table("monitor_points"):
        # A test that never touches the app (no TestClient, no create_all) may run
        # first against a brand-new database file, before any table exists.
        return
    with SessionLocal() as session:
        ids = [
            point.monitor_point_id
            for point in session.query(MonitorPoint).all()
            if point.monitor_point_id.startswith(TEST_POINT_PREFIXES)
        ]
        if not ids:
            return
        session.execute(delete(Inspection).where(Inspection.monitor_point_id.in_(ids)))
        session.execute(
            delete(MarkerAssignment).where(MarkerAssignment.monitor_point_id.in_(ids))
        )
        session.execute(delete(MonitorPoint).where(MonitorPoint.monitor_point_id.in_(ids)))
        session.commit()


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def point_payload():
    def build(point_id: str, name: str = "测试墙缝") -> dict:
        return {
            "monitor_point_id": point_id,
            "hazard_id": "HZ-TEST-001",
            "hazard_name": "测试隐患点",
            "monitor_point_name": name,
            "structure_id": "WALL-TEST",
            "structure_name": "测试墙体",
            "location_description": "测试位置描述",
        }

    return build


@pytest.fixture
def make_point(client, point_payload):
    def build(point_id: str) -> tuple[BoardSpec, BoardSpec]:
        response = client.post("/api/points", json=point_payload(point_id))
        assert response.status_code == 200, response.text
        with SessionLocal() as session:
            return boards_for_point(session.get(MonitorPoint, point_id))

    return build


@pytest.fixture
def crack_photo():
    def build(boards: tuple[BoardSpec, BoardSpec], delta_mm: float) -> bytes:
        image, _ = render_case(
            SyntheticCase("fixture", delta_mm=delta_mm, yaw_deg=10.0), seed=55, boards=boards
        )
        encoded, buffer = cv2.imencode(".png", image)
        assert encoded
        return buffer.tobytes()

    return build


@pytest.fixture
def confirm_inspection(client):
    def build(inspection_id: str) -> dict:
        response = client.post(
            f"/api/inspections/{inspection_id}/confirm",
            json={"observer_name": "测试监测员"},
        )
        assert response.status_code == 200, response.text
        return response.json()

    return build
