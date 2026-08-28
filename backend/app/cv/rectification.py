from __future__ import annotations

import cv2
import numpy as np

from .board_geometry import BOARD_HEIGHT_MM, BOARD_WIDTH_MM, BoardSpec
from .pose_estimation import collect_correspondences


def rectify_board(
    image: np.ndarray,
    board: BoardSpec,
    corners_by_id: dict[int, np.ndarray],
    pixels_per_mm: float = 2.5,
) -> np.ndarray | None:
    object_points, image_points, used = collect_correspondences(board, corners_by_id)
    if len(used) < 2:
        return None
    destination = object_points[:, :2].copy()
    destination[:, 0] = (destination[:, 0] + BOARD_WIDTH_MM / 2) * pixels_per_mm
    destination[:, 1] = (destination[:, 1] + BOARD_HEIGHT_MM / 2) * pixels_per_mm
    homography, _ = cv2.findHomography(image_points, destination, cv2.RANSAC, 2.0)
    if homography is None:
        return None
    width = int(round(BOARD_WIDTH_MM * pixels_per_mm))
    height = int(round(BOARD_HEIGHT_MM * pixels_per_mm))
    return cv2.warpPerspective(image, homography, (width, height))


def rectify_wall_plane(
    image: np.ndarray,
    image_to_left_plane: np.ndarray,
    *,
    pixels_per_mm: float = 2.5,
    x_limits_mm: tuple[float, float] = (-100.0, 360.0),
    y_limits_mm: tuple[float, float] = (-130.0, 130.0),
) -> np.ndarray:
    """Create a single front-facing wall view containing both recheck stickers."""
    x0, x1 = x_limits_mm
    y0, y1 = y_limits_mm
    plane_to_canvas = np.asarray(
        [
            [pixels_per_mm, 0.0, -x0 * pixels_per_mm],
            [0.0, pixels_per_mm, -y0 * pixels_per_mm],
            [0.0, 0.0, 1.0],
        ],
        dtype=np.float64,
    )
    width = int(round((x1 - x0) * pixels_per_mm))
    height = int(round((y1 - y0) * pixels_per_mm))
    return cv2.warpPerspective(image, plane_to_canvas @ image_to_left_plane, (width, height))


def compose_rectified(left: np.ndarray | None, right: np.ndarray | None) -> np.ndarray:
    size = 300
    fallback = np.full((size, size, 3), 238, np.uint8)
    left_image = left if left is not None else fallback.copy()
    right_image = right if right is not None else fallback.copy()
    left_image = cv2.resize(left_image, (size, size))
    right_image = cv2.resize(right_image, (size, size))
    gap = np.full((size, 80, 3), 246, np.uint8)
    canvas = np.hstack([left_image, gap, right_image])
    cv2.putText(canvas, "LEFT", (12, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (47, 93, 80), 2)
    cv2.putText(canvas, "RIGHT", (size + 92, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (47, 93, 80), 2)
    return canvas
