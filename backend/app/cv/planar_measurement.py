from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

from .board_geometry import DEMO_LEFT, DEMO_RIGHT, BoardSpec
from .pose_estimation import BoardPose, collect_correspondences


@dataclass(frozen=True)
class PlanarMeasurement:
    right_center_mm: np.ndarray
    image_to_left_plane: np.ndarray
    homography_rmse_mm: float
    right_point_spread_mm: float


def _board_center_candidates(
    board: BoardSpec,
    corners_by_id: dict[int, np.ndarray],
    image_to_left_plane: np.ndarray,
) -> np.ndarray:
    candidates: list[np.ndarray] = []
    for marker_id in board.marker_ids:
        image_corners = corners_by_id.get(marker_id)
        if image_corners is None:
            continue
        image_center = np.mean(image_corners, axis=0).reshape(1, 1, 2)
        wall_center = cv2.perspectiveTransform(image_center, image_to_left_plane).reshape(2)
        local_center = np.mean(board.marker_corners_mm(marker_id)[:, :2], axis=0)
        candidates.append(wall_center - local_center)
    return np.asarray(candidates, dtype=np.float64)


def measure_planar_relative(
    corners_by_id: dict[int, np.ndarray],
    left: BoardSpec = DEMO_LEFT,
    right: BoardSpec = DEMO_RIGHT,
    left_pose: BoardPose | None = None,
    camera_matrix: np.ndarray | None = None,
) -> PlanarMeasurement | None:
    """Rectify the shared wall plane with the left sticker as the metric reference."""
    left_corners_object, left_corners_image, used_left = collect_correspondences(left, corners_by_id)
    _, _, used_right = collect_correspondences(right, corners_by_id)
    if len(used_left) < 3 or len(used_right) < 3:
        return None

    left_image = np.asarray(
        [np.mean(corners_by_id[marker_id], axis=0) for marker_id in used_left],
        dtype=np.float32,
    )
    left_object = np.asarray(
        [np.mean(left.marker_corners_mm(marker_id)[:, :2], axis=0) for marker_id in used_left],
        dtype=np.float32,
    )
    if left_pose is not None and camera_matrix is not None:
        rotation, _ = cv2.Rodrigues(left_pose.rvec)
        plane_to_image = camera_matrix @ np.column_stack(
            [rotation[:, 0], rotation[:, 1], left_pose.tvec.reshape(3)]
        )
        image_to_plane = np.linalg.inv(plane_to_image)
    else:
        image_to_plane, _ = cv2.findHomography(left_image, left_object, 0)
    if image_to_plane is None:
        return None

    left_projected = cv2.perspectiveTransform(
        left_corners_image.reshape(1, -1, 2), image_to_plane
    ).reshape(-1, 2)
    rmse = float(
        np.sqrt(np.mean(np.sum((left_projected - left_corners_object[:, :2]) ** 2, axis=1)))
    )
    candidates = _board_center_candidates(right, corners_by_id, image_to_plane)
    if len(candidates) < 3:
        return None
    center = np.median(candidates, axis=0)
    spread = float(np.sqrt(np.mean(np.sum((candidates - center) ** 2, axis=1))))
    return PlanarMeasurement(center, image_to_plane, rmse, spread)
