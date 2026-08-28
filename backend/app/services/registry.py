from __future__ import annotations

import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import SEED_ROOT
from app.cv.board_geometry import BoardSpec
from app.models import MarkerAssignment, MonitorPoint


MARKER_ID_MIN = 0
MARKER_ID_MAX = 586          # DICT_APRILTAG_36h11 holds 587 markers
MARKERS_PER_POINT = 8


def marker_ids(value: str) -> list[int]:
    return [int(item) for item in value.split(",") if item]


def _side_ids(point: MonitorPoint, side: str) -> list[int]:
    return [item.marker_id for item in point.marker_assignments if item.side == side]


def boards_for_point(point: MonitorPoint) -> tuple[BoardSpec, BoardSpec]:
    left = _side_ids(point, "left")
    right = _side_ids(point, "right")
    if len(left) != 4 or len(right) != 4:
        raise ValueError(f"监测点 {point.monitor_point_id} 的标靶配置不完整。")
    return BoardSpec("LEFT", tuple(left)), BoardSpec("RIGHT", tuple(right))


def allocate_marker_block(session: Session) -> list[int]:
    """Lowest contiguous run of free ids, so gaps from deleted points get reused."""
    taken = set(session.scalars(select(MarkerAssignment.marker_id)).all())
    for start in range(MARKER_ID_MIN, MARKER_ID_MAX - MARKERS_PER_POINT + 2):
        block = list(range(start, start + MARKERS_PER_POINT))
        if not taken.intersection(block):
            return block
    raise ValueError("标靶 ID 已用尽，无法再创建监测点。")


def create_monitor_point(session: Session, payload) -> MonitorPoint:
    if session.get(MonitorPoint, payload.monitor_point_id) is not None:
        raise ValueError(f"监测点编号 {payload.monitor_point_id} 已存在。")
    block = allocate_marker_block(session)
    left_ids, right_ids = block[:4], block[4:]
    point = MonitorPoint(
        monitor_point_id=payload.monitor_point_id,
        hazard_id=payload.hazard_id,
        hazard_name=payload.hazard_name,
        monitor_point_name=payload.monitor_point_name,
        structure_id=payload.structure_id,
        structure_name=payload.structure_name,
        location_description=payload.location_description,
        latitude=payload.latitude,
        longitude=payload.longitude,
        elevation=payload.elevation,
        baseline_mm=0.0,
        left_marker_group=",".join(map(str, left_ids)),
        right_marker_group=",".join(map(str, right_ids)),
        is_demo_location=False,
    )
    session.add(point)
    for side, ids in (("left", left_ids), ("right", right_ids)):
        for slot, marker_id in enumerate(ids):
            session.add(
                MarkerAssignment(
                    marker_id=marker_id,
                    monitor_point_id=point.monitor_point_id,
                    side=side,
                    slot=slot,
                )
            )
    session.commit()
    session.refresh(point)
    return point


def point_to_dict(point: MonitorPoint) -> dict:
    return {
        "hazard_id": point.hazard_id,
        "hazard_name": point.hazard_name,
        "monitor_point_id": point.monitor_point_id,
        "monitor_point_name": point.monitor_point_name,
        "structure_id": point.structure_id,
        "structure_name": point.structure_name,
        "location_description": point.location_description,
        "latitude": point.latitude,
        "longitude": point.longitude,
        "elevation": point.elevation,
        "baseline_mm": point.baseline_mm,
        "left_marker_group": _side_ids(point, "left"),
        "right_marker_group": _side_ids(point, "right"),
        "is_demo_location": point.is_demo_location,
        "baseline_inspection_id": point.baseline_inspection_id,
        "baseline_status": "confirmed" if point.baseline_inspection_id else "missing",
        "context_photo_path": point.context_photo_path,
        "context_photo_captured_at": (
            point.context_photo_captured_at.isoformat()
            if point.context_photo_captured_at
            else None
        ),
    }


def seed_points(session: Session) -> None:
    payload = json.loads((SEED_ROOT / "point_registry.json").read_text(encoding="utf-8"))
    for record in payload:
        point = session.get(MonitorPoint, record["monitor_point_id"])
        if point is None:
            point = MonitorPoint(monitor_point_id=record["monitor_point_id"])
            session.add(point)
        for key, value in record.items():
            if key in {"left_marker_group", "right_marker_group", "monitor_point_id"}:
                continue
            setattr(point, key, value)
        point.left_marker_group = ",".join(map(str, record["left_marker_group"]))
        point.right_marker_group = ",".join(map(str, record["right_marker_group"]))
        session.flush()
        for side, key in (("left", "left_marker_group"), ("right", "right_marker_group")):
            for slot, marker_id in enumerate(record[key]):
                if session.get(MarkerAssignment, marker_id) is None:
                    session.add(
                        MarkerAssignment(
                            marker_id=marker_id,
                            monitor_point_id=point.monitor_point_id,
                            side=side,
                            slot=slot,
                        )
                    )
    session.commit()


def match_point(session: Session, detected_ids: list[int]) -> MonitorPoint | None:
    """A point is identified by its tags: ids are globally unique by primary key."""
    if not detected_ids:
        return None
    rows = session.scalars(
        select(MarkerAssignment).where(MarkerAssignment.marker_id.in_(detected_ids))
    ).all()
    counts: dict[str, dict[str, int]] = {}
    for row in rows:
        counts.setdefault(row.monitor_point_id, {"left": 0, "right": 0})[row.side] += 1
    for point_id, tally in counts.items():
        if tally["left"] >= 3 and tally["right"] >= 3:
            return session.get(MonitorPoint, point_id)
    return None
