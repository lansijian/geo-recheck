import cv2
from fastapi.testclient import TestClient

from app.cv.synthetic import SyntheticCase, render_case
from app.db.session import SessionLocal
from app.main import app
from app.models import BenchmarkTrial, Inspection


def test_measure_confirm_and_history_workflow() -> None:
    image, _ = render_case(SyntheticCase("api", 5.0, 20.0, pitch_deg=-5.0), seed=123)
    encoded, buffer = cv2.imencode(".png", image)
    assert encoded

    created_id: str | None = None
    try:
        with TestClient(app) as client:
            health = client.get("/api/health")
            assert health.status_code == 200

            measured = client.post(
                "/api/measure",
                files={"image": ("measurement.png", buffer.tobytes(), "image/png")},
            )
            assert measured.status_code == 200, measured.text
            payload = measured.json()
            created_id = payload["id"]
            assert payload["monitor_point_id"] == "MP-03"
            assert payload["status"] == "pending"
            assert payload["location_mode"] == "demo"
            assert payload["current_distance_mm"] is not None

            confirmed = client.post(
                f"/api/inspections/{payload['id']}/confirm",
                json={"observer_name": "测试员", "remark": "自动化回归测试"},
            )
            assert confirmed.status_code == 200, confirmed.text
            assert confirmed.json()["human_confirmed"] is True

            history = client.get("/api/points/MP-03/history")
            assert history.status_code == 200
            assert any(item["id"] == payload["id"] for item in history.json())
    finally:
        if created_id:
            with SessionLocal() as session:
                record = session.get(Inspection, created_id)
                if record:
                    session.delete(record)
                    session.commit()


def test_benchmark_trial_summary() -> None:
    created_ids: list[int] = []
    try:
        with TestClient(app) as client:
            for mode, duration in (("traditional", 1000), ("system", 400)):
                response = client.post(
                    "/api/benchmark/trial",
                    json={"mode": mode, "duration_ms": duration, "errors": 0},
                )
                assert response.status_code == 200
                created_ids.append(response.json()["id"])
            summary = client.get("/api/benchmark/summary").json()
            assert summary["traditional"]["count"] >= 1
            assert summary["system"]["count"] >= 1
            assert summary["time_saved_percent"] is not None
    finally:
        with SessionLocal() as session:
            for created_id in created_ids:
                record = session.get(BenchmarkTrial, created_id)
                if record:
                    session.delete(record)
            session.commit()
