import cv2
import numpy as np

from app.config import EVIDENCE_ROOT
from app.db.session import SessionLocal
from app.models import Inspection
from app.services.ai_review import resolve_review_images


def context_jpeg() -> bytes:
    encoded, buffer = cv2.imencode(".jpg", np.full((120, 160, 3), 180, np.uint8))
    assert encoded
    return buffer.tobytes()


def test_real_point_review_images_come_from_point_and_history(
    client, make_point, crack_photo, confirm_inspection
):
    boards = make_point("MP-AI01")
    uploaded = client.put(
        "/api/points/MP-AI01/context-photo",
        files={"image": ("ctx.jpg", context_jpeg(), "image/jpeg")},
    )
    assert uploaded.status_code == 200, uploaded.text
    baseline = client.post(
        "/api/points/MP-AI01/baseline",
        files={"image": ("b.png", crack_photo(boards, 0.0), "image/png")},
    ).json()
    confirm_inspection(baseline["id"])
    current = client.post(
        "/api/measure",
        files={"image": ("c.png", crack_photo(boards, 3.0), "image/png")},
        data={"point": "MP-AI01", "capture_mode": "recheck"},
    ).json()

    with SessionLocal() as session:
        inspection = session.get(Inspection, current["id"])
        images = resolve_review_images(session, inspection, None)
        assert images.current == EVIDENCE_ROOT / current["id"] / "original.png"
        assert images.previous == EVIDENCE_ROOT / baseline["id"] / "original.png"
        assert images.context.name == "context.jpg"
        assert "MP-AI01" in str(images.context)


def test_baseline_capture_has_no_ai_review(client, make_point, crack_photo):
    boards = make_point("MP-AI02")
    baseline = client.post(
        "/api/points/MP-AI02/baseline",
        files={"image": ("b.png", crack_photo(boards, 0.0), "image/png")},
    ).json()
    response = client.post(f"/api/inspections/{baseline['id']}/ai-review", json={})
    assert response.status_code == 422
    assert "基线" in response.json()["detail"]


def test_real_point_without_context_photo_is_refused(
    client, make_point, crack_photo, confirm_inspection
):
    boards = make_point("MP-AI03")
    baseline = client.post(
        "/api/points/MP-AI03/baseline",
        files={"image": ("b.png", crack_photo(boards, 0.0), "image/png")},
    ).json()
    confirm_inspection(baseline["id"])
    current = client.post(
        "/api/measure",
        files={"image": ("c.png", crack_photo(boards, 2.0), "image/png")},
        data={"point": "MP-AI03", "capture_mode": "recheck"},
    ).json()
    response = client.post(f"/api/inspections/{current['id']}/ai-review", json={})
    assert response.status_code == 422
    assert "现场全景" in response.json()["detail"]


def test_demo_case_review_images_are_unchanged():
    """The demo-case branch must keep reading the three fixed files."""
    with SessionLocal() as session:
        inspection = Inspection(
            id="ai-demo-case-fixture",
            monitor_point_id="MP-03",
            capture_mode="recheck",
        )
        images = resolve_review_images(session, inspection, "case_02_widening")
        assert images.context.name == "context.jpg"
        assert images.previous.name == "previous_close.jpg"
        assert images.current.name == "current_close.jpg"
        assert "case_02_widening" in str(images.context)
