from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

from .board_geometry import BoardSpec


@dataclass
class BoardPose:
    board: BoardSpec
    marker_ids: list[int]
    rvec: np.ndarray
    tvec: np.ndarray
    reprojection_rmse_px: float
    solver: str
    view_angle_deg: float


def collect_correspondences(
    board: BoardSpec, corners_by_id: dict[int, np.ndarray]
) -> tuple[np.ndarray, np.ndarray, list[int]]:
    object_points: list[np.ndarray] = []
    image_points: list[np.ndarray] = []
    used: list[int] = []
    for marker_id in board.marker_ids:
        if marker_id not in corners_by_id:
            continue
        object_points.append(board.marker_corners_mm(marker_id))
        image_points.append(corners_by_id[marker_id])
        used.append(marker_id)
    if not object_points:
        return (
            np.empty((0, 3), np.float32),
            np.empty((0, 2), np.float32),
            used,
        )
    return np.concatenate(object_points), np.concatenate(image_points), used


def _reprojection_rmse(
    object_points: np.ndarray,
    image_points: np.ndarray,
    rvec: np.ndarray,
    tvec: np.ndarray,
    camera_matrix: np.ndarray,
    distortion: np.ndarray,
) -> float:
    projected, _ = cv2.projectPoints(
        object_points, rvec, tvec, camera_matrix, distortion
    )
    residual = projected.reshape(-1, 2) - image_points
    return float(np.sqrt(np.mean(np.sum(residual**2, axis=1))))


def estimate_board_pose(
    board: BoardSpec,
    corners_by_id: dict[int, np.ndarray],
    camera_matrix: np.ndarray,
    distortion: np.ndarray,
    min_markers: int = 3,
) -> BoardPose | None:
    object_points, image_points, used = collect_correspondences(board, corners_by_id)
    if len(used) < min_markers:
        return None

    candidates: list[tuple[float, np.ndarray, np.ndarray, str]] = []
    for flag, name in (
        (cv2.SOLVEPNP_IPPE, "IPPE"),
        (cv2.SOLVEPNP_ITERATIVE, "ITERATIVE"),
    ):
        success, rvec, tvec = cv2.solvePnP(
            object_points,
            image_points,
            camera_matrix,
            distortion,
            flags=flag,
        )
        if not success or float(tvec.reshape(3)[2]) <= 0:
            continue
        rmse = _reprojection_rmse(
            object_points, image_points, rvec, tvec, camera_matrix, distortion
        )
        candidates.append((rmse, rvec, tvec, name))
    if not candidates:
        return None

    rmse, rvec, tvec, solver = min(candidates, key=lambda item: item[0])
    rotation, _ = cv2.Rodrigues(rvec)
    normal = rotation[:, 2]
    cosine = float(np.clip(abs(normal[2]), 0.0, 1.0))
    view_angle = float(np.degrees(np.arccos(cosine)))
    return BoardPose(board, used, rvec, tvec, rmse, solver, view_angle)


def relative_distance_mm(left: BoardPose, right: BoardPose) -> float:
    return float(np.linalg.norm(right.tvec.reshape(3) - left.tvec.reshape(3)))


def relative_transform_mm(left: BoardPose, right: BoardPose) -> np.ndarray:
    """Return the right-board origin expressed in the left-board frame."""
    left_rotation, _ = cv2.Rodrigues(left.rvec)
    camera_delta = right.tvec.reshape(3) - left.tvec.reshape(3)
    return (left_rotation.T @ camera_delta).astype(np.float64)
