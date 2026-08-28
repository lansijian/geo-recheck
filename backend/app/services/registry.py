from __future__ import annotations

import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import SEED_ROOT
from app.models import MonitorPoint


def marker_ids(value: str) -> list[int]:
    return [int(item) for item in value.split(",") if item]


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
        "left_marker_group": marker_ids(point.left_marker_group),
        "right_marker_group": marker_ids(point.right_marker_group),
        "is_demo_location": point.is_demo_location,
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
    session.commit()


def match_point(session: Session, detected_ids: list[int]) -> MonitorPoint | None:
    detected = set(detected_ids)
    points = session.scalars(select(MonitorPoint)).all()
    for point in points:
        left = set(marker_ids(point.left_marker_group))
        right = set(marker_ids(point.right_marker_group))
        if len(detected & left) >= 3 and len(detected & right) >= 3:
            return point
    return None
