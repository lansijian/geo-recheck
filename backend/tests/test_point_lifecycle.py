import pytest
from sqlalchemy.exc import IntegrityError

from app.db.session import SessionLocal
from app.models import MarkerAssignment, MonitorPoint
from app.services.registry import allocate_marker_block, boards_for_point


def test_allocates_a_free_block_and_never_hands_out_seeded_ids(client, point_payload):
    created = client.post("/api/points", json=point_payload("MP-T01"))
    assert created.status_code == 200, created.text
    body = created.json()
    allocated = body["left_marker_group"] + body["right_marker_group"]
    assert len(allocated) == 8
    assert allocated == sorted(allocated)
    # 301-308 belong to the seeded demo point MP-03 and must not be handed out.
    assert not set(allocated) & {301, 302, 303, 304, 305, 306, 307, 308}


def test_second_point_gets_a_disjoint_block(client, point_payload):
    first = client.post("/api/points", json=point_payload("MP-T02")).json()
    second = client.post("/api/points", json=point_payload("MP-T03")).json()
    first_ids = set(first["left_marker_group"] + first["right_marker_group"])
    second_ids = set(second["left_marker_group"] + second["right_marker_group"])
    assert not first_ids & second_ids


def test_duplicate_point_id_is_refused(client, point_payload):
    assert client.post("/api/points", json=point_payload("MP-T07")).status_code == 200
    again = client.post("/api/points", json=point_payload("MP-T07"))
    assert again.status_code == 422
    assert "已存在" in again.json()["detail"]


def test_duplicate_marker_id_is_refused_by_the_database(client, point_payload):
    client.post("/api/points", json=point_payload("MP-T04"))
    with SessionLocal() as session:
        existing = session.query(MarkerAssignment).first()
        assert existing is not None
        session.add(
            MarkerAssignment(
                marker_id=existing.marker_id,
                monitor_point_id="MP-T04",
                side="left",
                slot=0,
            )
        )
        with pytest.raises(IntegrityError):
            session.commit()
        session.rollback()


def test_boards_for_point_preserves_slot_order(client, point_payload):
    body = client.post("/api/points", json=point_payload("MP-T05")).json()
    with SessionLocal() as session:
        point = session.get(MonitorPoint, "MP-T05")
        left, right = boards_for_point(point)
        assert list(left.marker_ids) == body["left_marker_group"]
        assert list(right.marker_ids) == body["right_marker_group"]
        assert left.side == "LEFT" and right.side == "RIGHT"


def test_sticker_pdf_contains_the_point_and_its_marker_ids(client, point_payload):
    body = client.post("/api/points", json=point_payload("MP-T06")).json()
    response = client.get("/api/points/MP-T06/sticker.pdf")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    text = response.content.decode("latin-1")
    assert "MP-T06" in text
    for marker_id in body["left_marker_group"]:
        assert str(marker_id) in text


def test_seeded_demo_point_still_reads_back_its_markers(client):
    response = client.get("/api/points/MP-03")
    assert response.status_code == 200
    body = response.json()
    assert body["left_marker_group"] == [301, 302, 303, 304]
    assert body["right_marker_group"] == [305, 306, 307, 308]
    assert body["baseline_status"] in {"missing", "confirmed"}


def test_allocation_is_contiguous_within_a_point():
    with SessionLocal() as session:
        block = allocate_marker_block(session)
        assert len(block) == 8
        assert block == list(range(block[0], block[0] + 8))
