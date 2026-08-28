from __future__ import annotations

from dataclasses import dataclass
from typing import Protocol

import cv2
import numpy as np


@dataclass
class DetectionResult:
    corners_by_id: dict[int, np.ndarray]
    rejected_count: int

    @property
    def ids(self) -> list[int]:
        return sorted(self.corners_by_id)


def april_tag_dictionary():
    return cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_APRILTAG_36h11)


class FiducialDetector(Protocol):
    detector_type: str

    def detect(self, image: np.ndarray) -> DetectionResult: ...


class OpenCVArucoDetector:
    """Stable V0.3 default; native AprilTag remains an isolated benchmark candidate."""

    detector_type = "opencv_aruco_apriltag_36h11"

    def __init__(self) -> None:
        parameters = cv2.aruco.DetectorParameters()
        parameters.cornerRefinementMethod = cv2.aruco.CORNER_REFINE_SUBPIX
        parameters.cornerRefinementWinSize = 5
        parameters.cornerRefinementMaxIterations = 50
        parameters.cornerRefinementMinAccuracy = 0.01
        self._detector = cv2.aruco.ArucoDetector(april_tag_dictionary(), parameters)

    def detect(self, image: np.ndarray) -> DetectionResult:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY) if image.ndim == 3 else image
        corners, ids, rejected = self._detector.detectMarkers(gray)
        if ids is None:
            return DetectionResult({}, len(rejected))

        result: dict[int, np.ndarray] = {}
        for marker_corners, marker_id in zip(corners, ids.flatten(), strict=True):
            # ArucoDetector already applies sub-pixel refinement. Refining a second time
            # can snap compact tags to an internal black/white edge and bias metric scale.
            result[int(marker_id)] = marker_corners.reshape(4, 2).astype(np.float32)
        return DetectionResult(result, len(rejected))


DEFAULT_DETECTOR = OpenCVArucoDetector()


def detect_markers(image: np.ndarray) -> DetectionResult:
    """Compatibility wrapper retained for V0.2 callers."""
    return DEFAULT_DETECTOR.detect(image)
