from __future__ import annotations

from dataclasses import asdict, dataclass
from pathlib import Path

import cv2
import numpy as np

from .board_geometry import DEMO_LEFT, DEMO_RIGHT
from .image_io import write_image
from .marker_detector import detect_markers
from .pose_estimation import estimate_board_pose, relative_distance_mm
from .quality_gate import QualityReport, assess_quality
from .rectification import compose_rectified, rectify_board


@dataclass
class MeasurementResult:
    status: str
    marker_ids: list[int]
    distance_mm: float | None
    quality: QualityReport
    left_pose: dict | None
    right_pose: dict | None

    def as_dict(self) -> dict:
        result = asdict(self)
        return result


def _pose_dict(pose) -> dict | None:
    if pose is None:
        return None
    return {
        "marker_ids": pose.marker_ids,
        "solver": pose.solver,
        "reprojection_rmse_px": pose.reprojection_rmse_px,
        "view_angle_deg": pose.view_angle_deg,
        "rvec": pose.rvec.reshape(3).tolist(),
        "tvec_mm": pose.tvec.reshape(3).tolist(),
    }


def measure_image(
    image: np.ndarray,
    camera_matrix: np.ndarray,
    distortion: np.ndarray,
    output_dir: Path | None = None,
) -> MeasurementResult:
    undistorted = cv2.undistort(image, camera_matrix, distortion)
    detection = detect_markers(undistorted)
    left = estimate_board_pose(DEMO_LEFT, detection.corners_by_id, camera_matrix, distortion)
    right = estimate_board_pose(DEMO_RIGHT, detection.corners_by_id, camera_matrix, distortion)
    quality = assess_quality(undistorted, detection.corners_by_id, left, right)
    distance = relative_distance_mm(left, right) if quality.accepted and left and right else None

    if output_dir:
        output_dir.mkdir(parents=True, exist_ok=True)
        overlay = undistorted.copy()
        if detection.corners_by_id:
            corners = [value.reshape(1, 4, 2) for value in detection.corners_by_id.values()]
            ids = np.asarray(list(detection.corners_by_id), dtype=np.int32).reshape(-1, 1)
            cv2.aruco.drawDetectedMarkers(overlay, corners, ids)
        if left and right:
            left_center = tuple(np.round(np.mean([detection.corners_by_id[i] for i in left.marker_ids], axis=(0, 1))).astype(int))
            right_center = tuple(np.round(np.mean([detection.corners_by_id[i] for i in right.marker_ids], axis=(0, 1))).astype(int))
            cv2.line(overlay, left_center, right_center, (27, 137, 95), 3)
        left_rect = rectify_board(undistorted, DEMO_LEFT, detection.corners_by_id)
        right_rect = rectify_board(undistorted, DEMO_RIGHT, detection.corners_by_id)
        write_image(output_dir / "original.png", image)
        write_image(output_dir / "undistorted.png", undistorted)
        write_image(output_dir / "overlay.png", overlay)
        if left_rect is not None:
            write_image(output_dir / "rectified_left.png", left_rect)
        if right_rect is not None:
            write_image(output_dir / "rectified_right.png", right_rect)
        write_image(output_dir / "rectified.png", compose_rectified(left_rect, right_rect))

    return MeasurementResult(
        status="accepted" if quality.accepted else "rejected",
        marker_ids=detection.ids,
        distance_mm=distance,
        quality=quality,
        left_pose=_pose_dict(left),
        right_pose=_pose_dict(right),
    )
