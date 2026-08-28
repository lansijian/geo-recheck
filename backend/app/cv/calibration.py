from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np


SQUARE_LENGTH_MM = 26.0
MARKER_LENGTH_MM = 19.5
BOARD_SQUARES = (7, 5)


def charuco_dictionary():
    return cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_5X5_100)


def charuco_board():
    return cv2.aruco.CharucoBoard(
        BOARD_SQUARES,
        SQUARE_LENGTH_MM,
        MARKER_LENGTH_MM,
        charuco_dictionary(),
    )


@dataclass
class CalibrationResult:
    rms_reprojection_error_px: float
    camera_matrix: np.ndarray
    distortion: np.ndarray
    image_size: tuple[int, int]
    accepted_images: int
    total_images: int


def calibrate_camera(images: list[np.ndarray]) -> CalibrationResult:
    if len(images) < 10:
        raise ValueError("相机标定至少需要 10 张不同视角照片，建议 15–25 张。")
    board = charuco_board()
    detector = cv2.aruco.CharucoDetector(board)
    all_corners: list[np.ndarray] = []
    all_ids: list[np.ndarray] = []
    image_size: tuple[int, int] | None = None
    for image in images:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        current_size = (gray.shape[1], gray.shape[0])
        if image_size is None:
            image_size = current_size
        if image_size != current_size:
            raise ValueError("所有标定照片必须具有相同分辨率。")
        charuco_corners, charuco_ids, _, _ = detector.detectBoard(gray)
        if charuco_ids is not None and len(charuco_ids) >= 10:
            all_corners.append(charuco_corners)
            all_ids.append(charuco_ids)
    if len(all_corners) < 8 or image_size is None:
        raise ValueError("有效标定视角不足：至少需要 8 张能识别 10 个以上 ChArUco 角点的照片。")
    rms, matrix, distortion, _, _ = cv2.aruco.calibrateCameraCharuco(
        all_corners,
        all_ids,
        board,
        image_size,
        None,
        None,
    )
    return CalibrationResult(
        float(rms), matrix, distortion.reshape(-1), image_size, len(all_corners), len(images)
    )

