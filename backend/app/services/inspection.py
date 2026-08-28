from __future__ import annotations

import json
import logging
import math
import time
import uuid
from datetime import datetime

import cv2
import numpy as np
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.config import CAMERA_PROFILE_PATH, DEMO_CASES_ROOT, DEMO_LOCATION_MODE, EVIDENCE_ROOT
from app.cv.pipeline import measure_image, scan_marker_ids
from app.models import Inspection, MonitorPoint
from app.services.registry import boards_for_point, match_point, point_to_dict


logger = logging.getLogger("uvicorn.error")

DEMO_PROVENANCE = {
    "story": "贵州仁怀基层地灾监测员公开工作场景",
    "story_source": "https://gz.people.com.cn/n2/2026/0522/c361324-41588761.html",
    "wall_dataset": "Özgenel Concrete Crack Segmentation Dataset",
    "wall_source": "https://data.mendeley.com/datasets/jwsn7tfbrp/1",
    "license": "CC BY 4.0",
    "deformation": "controlled synthetic wall-plane displacement",
    "is_real_guizhou_monitoring_data": False,
}


def _camera_for_image(image: np.ndarray) -> tuple[np.ndarray, np.ndarray, dict]:
    profile = json.loads(CAMERA_PROFILE_PATH.read_text(encoding="utf-8"))
    matrix = np.asarray(profile["camera_matrix"], dtype=np.float64)
    distortion = np.asarray(profile["distortion_coefficients"], dtype=np.float64)
    calibration_width, calibration_height = profile["calibration_image_size"]
    height, width = image.shape[:2]
    sx = width / calibration_width
    sy = height / calibration_height
    matrix[0, 0] *= sx
    matrix[0, 2] *= sx
    matrix[1, 1] *= sy
    matrix[1, 2] *= sy
    return matrix, distortion, profile


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius = 6_371_000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * radius * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _evidence_url(inspection_id: str, name: str) -> str:
    return f"/media/{inspection_id}/{name}.png"


def _existing_evidence_url(inspection_id: str, name: str) -> str | None:
    path = EVIDENCE_ROOT / inspection_id / f"{name}.png"
    return _evidence_url(inspection_id, name) if path.exists() and path.stat().st_size > 0 else None


def _quality_payload(inspection: Inspection) -> tuple[list[str], dict]:
    parsed = json.loads(inspection.quality_reasons or "[]")
    if isinstance(parsed, list):
        return parsed, {}
    return parsed.get("reasons", []), parsed.get("metrics", {})


def inspection_to_dict(inspection: Inspection, point: MonitorPoint) -> dict:
    reasons, metrics = _quality_payload(inspection)
    profile = json.loads(CAMERA_PROFILE_PATH.read_text(encoding="utf-8"))
    return {
        "id": inspection.id,
        **point_to_dict(point),
        "capture_time": inspection.capture_time.isoformat(),
        "observer_name": inspection.observer_name,
        "previous_distance_mm": inspection.previous_distance_mm,
        "current_distance_mm": inspection.current_distance_mm,
        "delta_mm": inspection.opening_delta_mm if inspection.opening_delta_mm is not None else inspection.delta_opening_mm,
        "crack_id": inspection.crack_id or "CRACK-W01",
        "scene_type": inspection.scene_type or "wall_crack_recheck",
        "baseline_crack_width_mm": inspection.baseline_crack_width_mm,
        "opening_delta_mm": inspection.opening_delta_mm if inspection.opening_delta_mm is not None else inspection.delta_opening_mm,
        "shear_delta_mm": inspection.shear_delta_mm,
        "out_of_plane_delta_mm": inspection.out_of_plane_delta_mm,
        "capture_mode": inspection.capture_mode,
        "opening_since_baseline_mm": inspection.opening_since_baseline_mm,
        "shear_since_baseline_mm": inspection.shear_since_baseline_mm,
        "camera_profile_is_demo": inspection.camera_profile_is_demo,
        "planar_position_mm": (
            [inspection.planar_x_mm, inspection.planar_y_mm]
            if inspection.planar_x_mm is not None
            else None
        ),
        "measurement_mode": inspection.measurement_mode or "legacy_dual_pnp_distance",
        "detector_type": inspection.detector_type or "opencv_aruco_apriltag_36h11",
        "data_provenance": json.loads(inspection.data_provenance) if inspection.data_provenance else DEMO_PROVENANCE,
        "quality_score": inspection.quality_score,
        "status": inspection.measurement_status,
        "human_confirmed": inspection.human_confirmed,
        "location_match": inspection.location_match,
        "location_mode": inspection.location_mode,
        "quality_reasons": reasons,
        "quality_metrics": metrics,
        "visible_change_note": inspection.visible_change_note,
        "remark": inspection.remark,
        "demo_case_id": inspection.demo_case_id,
        "camera_profile": {
            "name": profile["name"],
            "is_demo_profile": profile.get("is_demo_profile", False),
        },
        "evidence": {
            "original": _existing_evidence_url(inspection.id, "original") or inspection.photo_original,
            "undistorted": _existing_evidence_url(inspection.id, "undistorted") or inspection.photo_undistorted,
            "rectified": _existing_evidence_url(inspection.id, "rectified") or inspection.photo_rectified,
            "rectified_left": _existing_evidence_url(inspection.id, "rectified_left"),
            "rectified_right": _existing_evidence_url(inspection.id, "rectified_right"),
            "overlay": _existing_evidence_url(inspection.id, "overlay") or inspection.photo_overlay,
        },
    }


def last_confirmed_inspection(
    session: Session, monitor_point_id: str, before: datetime | None = None
) -> Inspection | None:
    query = select(Inspection).where(
        Inspection.monitor_point_id == monitor_point_id,
        Inspection.human_confirmed.is_(True),
    )
    if before is not None:
        query = query.where(Inspection.capture_time < before)
    return session.scalar(query.order_by(desc(Inspection.capture_time)))


def create_measurement(
    session: Session,
    raw_image: bytes,
    browser_lat: float | None,
    browser_lon: float | None,
    original_filename: str = "measurement.png",
    demo_case_id: str | None = None,
    monitor_point_id: str | None = None,
    capture_mode: str = "recheck",
) -> dict:
    demo_case_valid = False
    if demo_case_id:
        case_path = (DEMO_CASES_ROOT / demo_case_id).resolve()
        demo_case_valid = (
            demo_case_id.startswith("case_")
            and not any(token in demo_case_id for token in ("/", "\\", ".."))
            and case_path.parent == DEMO_CASES_ROOT.resolve()
            and case_path.is_dir()
        )
        if not demo_case_valid:
            raise ValueError("Demo Case 编号无效或不存在。")
    array = np.frombuffer(raw_image, np.uint8)
    image = cv2.imdecode(array, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("无法读取上传图片。")

    height, width = image.shape[:2]
    logger.info("image dimensions=%sx%s filename=%s", width, height, original_filename)

    camera_matrix, distortion, profile = _camera_for_image(image)
    detected_ids = scan_marker_ids(image, camera_matrix, distortion)
    point = match_point(session, detected_ids)

    if monitor_point_id is not None:
        requested = session.get(MonitorPoint, monitor_point_id)
        if requested is None:
            raise ValueError("监测点不存在。")
        if point is None:
            raise ValueError("未能从左右视觉标靶识别监测点，请重新拍摄并让两组复测贴完整入镜。")
        if point.monitor_point_id != monitor_point_id:
            raise ValueError(
                f"这张照片属于 {point.monitor_point_id}，不是 {monitor_point_id}。"
            )
    elif point is None and demo_case_valid:
        point = session.get(MonitorPoint, "MP-03")
    if point is None:
        raise ValueError("未能从左右视觉标靶自动匹配监测点。")

    if capture_mode == "recheck" and point.baseline_inspection_id is None:
        raise ValueError("该监测点尚未完成首次建档，请先采集并确认基线照片。")
    if capture_mode == "baseline" and point.baseline_inspection_id is not None:
        raise ValueError("该监测点已建档，无需重复采集基线。")

    left_board, right_board = boards_for_point(point)
    inspection_id = str(uuid.uuid4())
    evidence_dir = EVIDENCE_ROOT / inspection_id
    started = time.perf_counter()
    result = measure_image(
        image, camera_matrix, distortion, evidence_dir, left=left_board, right=right_board
    )
    processing_ms = (time.perf_counter() - started) * 1000
    logger.info("detected marker ids=%s", result.marker_ids)
    required_evidence = ["original.png", "undistorted.png", "overlay.png", "rectified.png"]
    if result.status == "accepted":
        required_evidence.extend(["rectified_left.png", "rectified_right.png"])
    missing = [
        name
        for name in required_evidence
        if not (evidence_dir / name).exists() or (evidence_dir / name).stat().st_size <= 0
    ]
    if missing:
        raise ValueError(f"证据图生成失败：{', '.join(missing)}")
    logger.info("saved filename=original.png evidence_dir=%s", evidence_dir)

    current_planar = result.planar_position_mm
    planar_x = float(current_planar[0]) if current_planar else None
    planar_y = float(current_planar[1]) if current_planar else None

    previous = last_confirmed_inspection(session, point.monitor_point_id)
    baseline = (
        session.get(Inspection, point.baseline_inspection_id)
        if point.baseline_inspection_id
        else None
    )

    if capture_mode == "baseline":
        opening_delta = shear_delta = 0.0
        opening_since_baseline = shear_since_baseline = 0.0
    else:
        opening_delta = (
            planar_x - previous.planar_x_mm
            if planar_x is not None and previous and previous.planar_x_mm is not None
            else None
        )
        shear_delta = (
            planar_y - previous.planar_y_mm
            if planar_y is not None and previous and previous.planar_y_mm is not None
            else None
        )
        opening_since_baseline = (
            planar_x - baseline.planar_x_mm
            if planar_x is not None and baseline and baseline.planar_x_mm is not None
            else None
        )
        shear_since_baseline = (
            planar_y - baseline.planar_y_mm
            if planar_y is not None and baseline and baseline.planar_y_mm is not None
            else None
        )

    previous_distance = (
        previous.current_distance_mm
        if previous and previous.current_distance_mm is not None
        else point.baseline_mm
    )
    current = result.distance_mm
    out_of_plane_delta = (
        result.dual_pnp_position_mm[2] if result.dual_pnp_position_mm is not None else None
    )

    reasons = list(result.quality.reasons)
    status = "pending" if result.status == "accepted" else "rejected"
    # The 50 mm gate catches an implausible single-period jump. The cumulative value is
    # deliberately uncapped: a long-tracked crack legitimately exceeds it. On the very
    # first recheck since baseline, "previous" and "baseline" are the same record, so
    # opening_delta and opening_since_baseline are numerically identical; gating on it
    # there would silently cap the cumulative value too, which must never happen.
    is_first_recheck_since_baseline = (
        previous is not None and baseline is not None and previous.id == baseline.id
    )
    if (
        not is_first_recheck_since_baseline
        and opening_delta is not None
        and abs(opening_delta) > 50.0
    ):
        reasons.append("测量结果与上次差异异常，请重新拍摄或使用卷尺复核。")
        status = "rejected"
        current = None
        opening_delta = shear_delta = None
        opening_since_baseline = shear_since_baseline = None
        out_of_plane_delta = None

    if browser_lat is not None and browser_lon is not None and point.latitude is not None:
        location_match = _haversine_m(browser_lat, browser_lon, point.latitude, point.longitude) <= 100
        location_mode = "browser"
        latitude, longitude = browser_lat, browser_lon
    elif DEMO_LOCATION_MODE and point.latitude is not None:
        location_match = True
        location_mode = "demo"
        latitude, longitude = point.latitude, point.longitude
    else:
        location_match = None
        location_mode = "unavailable"
        latitude = longitude = None

    record = Inspection(
        id=inspection_id,
        monitor_point_id=point.monitor_point_id,
        capture_time=datetime.now(),
        latitude=latitude,
        longitude=longitude,
        previous_distance_mm=previous_distance,
        current_distance_mm=current,
        delta_opening_mm=opening_delta,
        scene_type="wall_crack_recheck",
        opening_delta_mm=opening_delta,
        shear_delta_mm=shear_delta,
        out_of_plane_delta_mm=out_of_plane_delta,
        capture_mode=capture_mode,
        planar_x_mm=planar_x,
        planar_y_mm=planar_y,
        opening_since_baseline_mm=opening_since_baseline,
        shear_since_baseline_mm=shear_since_baseline,
        camera_profile_is_demo=bool(profile.get("is_demo_profile", False)),
        crack_id=point.structure_name if point.monitor_point_id != "MP-03" else "CRACK-W01",
        baseline_crack_width_mm=8.0 if point.monitor_point_id == "MP-03" else None,
        measurement_mode=result.measurement_mode,
        detector_type=result.detector_type,
        data_provenance=json.dumps(DEMO_PROVENANCE, ensure_ascii=False),
        quality_score=result.quality.score,
        measurement_status=status,
        human_confirmed=False,
        location_match=location_match,
        location_mode=location_mode,
        photo_original=_evidence_url(inspection_id, "original"),
        photo_undistorted=_evidence_url(inspection_id, "undistorted"),
        photo_rectified=_evidence_url(inspection_id, "rectified"),
        photo_overlay=_evidence_url(inspection_id, "overlay"),
        quality_reasons=json.dumps(
            {
                "reasons": reasons,
                "metrics": {
                    "marker_ids": result.marker_ids,
                    "marker_count": len(result.marker_ids),
                    "blur_variance": result.quality.blur_variance,
                    "clipping_ratio": result.quality.clipping_ratio,
                    "min_marker_edge_px": result.quality.min_marker_edge_px,
                    "view_angle_deg": max(
                        [
                            pose["view_angle_deg"]
                            for pose in (result.left_pose, result.right_pose)
                            if pose is not None
                        ]
                        or [None]
                    ),
                    "reprojection_rmse_px": max(
                        [
                            pose["reprojection_rmse_px"]
                            for pose in (result.left_pose, result.right_pose)
                            if pose is not None
                        ]
                        or [None]
                    ),
                    "homography_rmse_mm": result.homography_rmse_mm,
                    "homography_spread_mm": result.homography_spread_mm,
                    "planar_position_mm": result.planar_position_mm,
                    "dual_pnp_position_mm": result.dual_pnp_position_mm,
                    "legacy_board_center_distance_mm": result.distance_mm,
                    "processing_ms": round(processing_ms, 2),
                },
            },
            ensure_ascii=False,
        ),
        remark=profile.get("warning") if profile.get("is_demo_profile") else None,
        demo_case_id=demo_case_id,
    )
    session.add(record)
    session.commit()
    response = inspection_to_dict(record, point)
    response["marker_ids"] = result.marker_ids
    response["camera_profile"] = {
        "name": profile["name"],
        "is_demo_profile": profile.get("is_demo_profile", False),
    }
    response["previous_evidence"] = (
        {
            "original": previous.photo_original,
            "rectified": previous.photo_rectified,
            "capture_time": previous.capture_time.isoformat(),
        }
        if previous
        else None
    )
    return response


def seed_baseline(session: Session) -> None:
    point = session.get(MonitorPoint, "MP-03")
    if point is None:
        return
    existing = session.get(Inspection, "00000000-0000-0000-0000-000000000003")
    if existing and existing.crack_id == "CRACK-W01" and point.baseline_inspection_id == existing.id:
        return
    if existing:
        session.delete(existing)
        session.commit()
    from app.cv.image_io import read_image

    benchmark_image = EVIDENCE_ROOT.parent / "wall_demo" / "images" / "baseline_front.png"
    rectified_url = None
    original_url = None
    overlay_url = None
    is_demo_profile = False
    baseline_metrics = {
        "planar_position_mm": [point.baseline_mm, 0.0],
        "dual_pnp_position_mm": [point.baseline_mm, 0.0, 0.0],
    }
    if benchmark_image.exists():
        image = read_image(benchmark_image)
        if image is not None:
            output = EVIDENCE_ROOT / "seed-baseline"
            camera_matrix, distortion, seed_profile = _camera_for_image(image)
            is_demo_profile = bool(seed_profile.get("is_demo_profile", False))
            result = measure_image(image, camera_matrix, distortion, output)
            if result.planar_position_mm:
                baseline_metrics["planar_position_mm"] = result.planar_position_mm
            if result.dual_pnp_position_mm:
                baseline_metrics["dual_pnp_position_mm"] = result.dual_pnp_position_mm
            original_url = "/media/seed-baseline/original.png"
            rectified_url = "/media/seed-baseline/rectified.png"
            overlay_url = "/media/seed-baseline/overlay.png"

    seed_inspection_id = "00000000-0000-0000-0000-000000000003"
    session.add(
        Inspection(
            id=seed_inspection_id,
            monitor_point_id=point.monitor_point_id,
            capture_time=datetime(2026, 8, 27, 9, 13),
            observer_name="演示基线",
            latitude=point.latitude,
            longitude=point.longitude,
            previous_distance_mm=point.baseline_mm,
            current_distance_mm=point.baseline_mm,
            delta_opening_mm=0.0,
            crack_id="CRACK-W01",
            scene_type="wall_crack_recheck",
            baseline_crack_width_mm=8.0,
            opening_delta_mm=0.0,
            shear_delta_mm=0.0,
            out_of_plane_delta_mm=0.0,
            capture_mode="baseline",
            planar_x_mm=float(baseline_metrics["planar_position_mm"][0]),
            planar_y_mm=float(baseline_metrics["planar_position_mm"][1]),
            opening_since_baseline_mm=0.0,
            shear_since_baseline_mm=0.0,
            camera_profile_is_demo=is_demo_profile,
            measurement_mode="planar_rectified_2d",
            detector_type="opencv_aruco_apriltag_36h11",
            data_provenance=json.dumps(DEMO_PROVENANCE, ensure_ascii=False),
            quality_score=1.0,
            measurement_status="confirmed",
            human_confirmed=True,
            location_match=True,
            location_mode="demo",
            photo_original=original_url,
            photo_rectified=rectified_url,
            photo_overlay=overlay_url,
            quality_reasons=json.dumps({"reasons": [], "metrics": baseline_metrics}, ensure_ascii=False),
            remark="首次人工建档开度 8.0 mm；公开场景复原与受控仿真，非真实监测记录。",
        )
    )
    point.baseline_inspection_id = seed_inspection_id
    session.commit()
