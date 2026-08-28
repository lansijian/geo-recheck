import cv2
import numpy as np

from app.db.session import SessionLocal
from app.models import Inspection


def test_recheck_before_baseline_is_refused(client, make_point, crack_photo):
    boards = make_point("MP-BL01")
    response = client.post(
        "/api/measure",
        files={"image": ("a.png", crack_photo(boards, 0.0), "image/png")},
        data={"point": "MP-BL01", "capture_mode": "recheck"},
    )
    assert response.status_code == 422
    assert "建档" in response.json()["detail"]


def test_unknown_capture_mode_is_refused(client, make_point, crack_photo):
    """An unrecognised mode must not slip past both baseline gates."""
    boards = make_point("MP-BL08")
    response = client.post(
        "/api/measure",
        files={"image": ("a.png", crack_photo(boards, 0.0), "image/png")},
        data={"point": "MP-BL08", "capture_mode": "definitely-not-a-mode"},
    )
    assert response.status_code == 422


def test_baseline_then_recheck_reports_both_numbers(
    client, make_point, crack_photo, confirm_inspection
):
    boards = make_point("MP-BL02")

    baseline = client.post(
        "/api/points/MP-BL02/baseline",
        files={"image": ("base.png", crack_photo(boards, 0.0), "image/png")},
    )
    assert baseline.status_code == 200, baseline.text
    assert baseline.json()["capture_mode"] == "baseline"
    assert baseline.json()["opening_since_baseline_mm"] == 0.0
    confirm_inspection(baseline.json()["id"])

    first = client.post(
        "/api/measure",
        files={"image": ("c1.png", crack_photo(boards, 2.0), "image/png")},
        data={"point": "MP-BL02", "capture_mode": "recheck"},
    ).json()
    confirm_inspection(first["id"])
    assert abs(first["opening_since_baseline_mm"] - 2.0) <= 1.0
    assert abs(first["opening_delta_mm"] - 2.0) <= 1.0

    second = client.post(
        "/api/measure",
        files={"image": ("c2.png", crack_photo(boards, 5.0), "image/png")},
        data={"point": "MP-BL02", "capture_mode": "recheck"},
    ).json()
    # cumulative is measured from the baseline, single-period from the last confirmed run
    assert abs(second["opening_since_baseline_mm"] - 5.0) <= 1.0
    assert abs(second["opening_delta_mm"] - 3.0) <= 1.0


def test_explicit_point_mismatch_is_refused(
    client, make_point, crack_photo, confirm_inspection
):
    boards_a = make_point("MP-BL03")
    make_point("MP-BL04")
    baseline = client.post(
        "/api/points/MP-BL03/baseline",
        files={"image": ("b.png", crack_photo(boards_a, 0.0), "image/png")},
    ).json()
    confirm_inspection(baseline["id"])

    response = client.post(
        "/api/measure",
        files={"image": ("x.png", crack_photo(boards_a, 2.0), "image/png")},
        data={"point": "MP-BL04", "capture_mode": "recheck"},
    )
    assert response.status_code == 422
    assert "MP-BL03" in response.json()["detail"]


def test_explicit_point_never_falls_back_to_the_demo_point(client, make_point):
    """With an explicit point, an unreadable photo must fail rather than land on MP-03."""
    make_point("MP-BL09")
    blank = cv2.imencode(".png", np.full((600, 800, 3), 200, np.uint8))[1].tobytes()
    with SessionLocal() as session:
        before = session.query(Inspection).filter(
            Inspection.monitor_point_id == "MP-03"
        ).count()

    response = client.post(
        "/api/measure",
        files={"image": ("blank.png", blank, "image/png")},
        data={
            "point": "MP-BL09",
            "capture_mode": "recheck",
            "demo_case_id": "case_02_widening",
        },
    )
    assert response.status_code == 422

    with SessionLocal() as session:
        after = session.query(Inspection).filter(
            Inspection.monitor_point_id == "MP-03"
        ).count()
    assert after == before


def test_second_baseline_is_refused(client, make_point, crack_photo, confirm_inspection):
    boards = make_point("MP-BL05")
    first = client.post(
        "/api/points/MP-BL05/baseline",
        files={"image": ("b.png", crack_photo(boards, 0.0), "image/png")},
    ).json()
    confirm_inspection(first["id"])
    again = client.post(
        "/api/points/MP-BL05/baseline",
        files={"image": ("b2.png", crack_photo(boards, 0.0), "image/png")},
    )
    assert again.status_code == 422
    assert "已建档" in again.json()["detail"]


def test_cumulative_value_is_not_capped_by_the_single_period_gate(
    client, make_point, crack_photo, confirm_inspection
):
    """A long-tracked crack legitimately exceeds 50 mm cumulatively."""
    boards = make_point("MP-BL06")
    baseline = client.post(
        "/api/points/MP-BL06/baseline",
        files={"image": ("b.png", crack_photo(boards, 0.0), "image/png")},
    ).json()
    confirm_inspection(baseline["id"])

    # Confirm one recheck so that "previous" is no longer the baseline record.
    first = client.post(
        "/api/measure",
        files={"image": ("c1.png", crack_photo(boards, 2.0), "image/png")},
        data={"point": "MP-BL06", "capture_mode": "recheck"},
    ).json()
    confirm_inspection(first["id"])

    # Shift only the baseline, so the cumulative value must exceed the gate while the
    # period-over-period change stays small.
    with SessionLocal() as session:
        record = session.get(Inspection, baseline["id"])
        record.planar_x_mm = record.planar_x_mm - 60.0
        session.commit()

    second = client.post(
        "/api/measure",
        files={"image": ("c2.png", crack_photo(boards, 5.0), "image/png")},
        data={"point": "MP-BL06", "capture_mode": "recheck"},
    )
    assert second.status_code == 200, second.text
    body = second.json()
    assert body["status"] == "pending"
    assert abs(body["opening_delta_mm"] - 3.0) <= 1.0
    assert body["opening_since_baseline_mm"] > 50.0


def test_single_period_gate_fires_on_the_first_recheck_too(
    client, make_point, crack_photo, confirm_inspection
):
    """The gate is not exempt just because previous and baseline are the same record."""
    boards = make_point("MP-BL07")
    baseline = client.post(
        "/api/points/MP-BL07/baseline",
        files={"image": ("b.png", crack_photo(boards, 0.0), "image/png")},
    ).json()
    confirm_inspection(baseline["id"])
    with SessionLocal() as session:
        record = session.get(Inspection, baseline["id"])
        record.planar_x_mm = record.planar_x_mm - 60.0
        session.commit()

    response = client.post(
        "/api/measure",
        files={"image": ("c.png", crack_photo(boards, 2.0), "image/png")},
        data={"point": "MP-BL07", "capture_mode": "recheck"},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "rejected"
    assert any("异常" in reason for reason in body["quality_reasons"])
