from __future__ import annotations

from dataclasses import dataclass, field

import cv2
import numpy as np

from .pose_estimation import BoardPose


@dataclass
class QualityReport:
    accepted: bool
    score: float
    blur_variance: float
    clipping_ratio: float
    min_marker_edge_px: float
    reasons: list[str] = field(default_factory=list)


def _min_marker_edge(corners_by_id: dict[int, np.ndarray]) -> float:
    edges: list[float] = []
    for corners in corners_by_id.values():
        rolled = np.roll(corners, -1, axis=0)
        edges.extend(np.linalg.norm(rolled - corners, axis=1).tolist())
    return min(edges) if edges else 0.0


def assess_quality(
    image: np.ndarray,
    corners_by_id: dict[int, np.ndarray],
    left_pose: BoardPose | None,
    right_pose: BoardPose | None,
    *,
    blur_threshold: float = 80.0,
    marker_edge_threshold: float = 24.0,
    max_view_angle_deg: float = 35.0,
    max_reprojection_rmse_px: float = 2.0,
) -> QualityReport:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blur = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    clipping = float(np.mean((gray <= 4) | (gray >= 251)))
    min_edge = _min_marker_edge(corners_by_id)
    reasons: list[str] = []

    if left_pose is None:
        reasons.append("无法可靠测量：左侧标靶识别不足。")
    if right_pose is None:
        reasons.append("无法可靠测量：右侧标靶识别不足。")
    if blur < blur_threshold:
        reasons.append("图像清晰度不足，请重新拍摄。")
    if min_edge < marker_edge_threshold:
        reasons.append("拍摄距离过远。")
    if clipping > 0.35:
        reasons.append("图像过曝或欠曝，请调整光照。")
    for pose in (left_pose, right_pose):
        if pose is None:
            continue
        if pose.view_angle_deg > max_view_angle_deg:
            reasons.append("拍摄角度过大，请尽量正对监测标靶。")
        if pose.reprojection_rmse_px > max_reprojection_rmse_px:
            reasons.append("标靶几何拟合不稳定，请重新拍摄。")

    marker_score = min(1.0, len(corners_by_id) / 8.0)
    blur_score = min(1.0, blur / (blur_threshold * 2.0))
    size_score = min(1.0, min_edge / (marker_edge_threshold * 2.0))
    angle = max(
        [pose.view_angle_deg for pose in (left_pose, right_pose) if pose] or [90.0]
    )
    angle_score = max(0.0, 1.0 - angle / 45.0)
    score = float(
        np.clip(
            0.35 * marker_score
            + 0.20 * blur_score
            + 0.20 * size_score
            + 0.25 * angle_score,
            0.0,
            1.0,
        )
    )
    return QualityReport(not reasons, score, blur, clipping, min_edge, reasons)
