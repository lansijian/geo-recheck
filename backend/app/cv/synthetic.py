from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

from .board_geometry import BOARD_SIZE_MM, DEMO_LEFT, DEMO_RIGHT, BoardSpec
from .image_io import read_image
from .marker_detector import april_tag_dictionary


IMAGE_SIZE = (1920, 1080)
CAMERA_MATRIX = np.asarray(
    [[1500.0, 0.0, 960.0], [0.0, 1500.0, 540.0], [0.0, 0.0, 1.0]],
    dtype=np.float64,
)
DISTORTION = np.zeros(5, dtype=np.float64)


@dataclass(frozen=True)
class SyntheticCase:
    name: str
    delta_mm: float
    yaw_deg: float
    pitch_deg: float = 0.0
    brightness: float = 1.0
    blur_sigma: float = 0.0
    noise_sigma: float = 1.5
    occlusion: str = "none"
    expected_gate: str = "accepted"


def _rotation_vector(yaw_deg: float, pitch_deg: float) -> np.ndarray:
    yaw = np.radians(yaw_deg)
    pitch = np.radians(pitch_deg)
    ry = np.asarray(
        [[np.cos(yaw), 0.0, np.sin(yaw)], [0.0, 1.0, 0.0], [-np.sin(yaw), 0.0, np.cos(yaw)]],
        dtype=np.float64,
    )
    rx = np.asarray(
        [[1.0, 0.0, 0.0], [0.0, np.cos(pitch), -np.sin(pitch)], [0.0, np.sin(pitch), np.cos(pitch)]],
        dtype=np.float64,
    )
    rvec, _ = cv2.Rodrigues(rx @ ry)
    return rvec


def make_board_texture(board: BoardSpec, pixels_per_mm: float = 5.0) -> np.ndarray:
    size = int(round(BOARD_SIZE_MM * pixels_per_mm))
    marker_size = int(round(40.0 * pixels_per_mm))
    texture = np.full((size, size, 3), 255, np.uint8)
    for index, marker_id in enumerate(board.marker_ids):
        marker = cv2.aruco.generateImageMarker(
            april_tag_dictionary(), marker_id, marker_size, borderBits=1
        )
        marker_bgr = cv2.cvtColor(marker, cv2.COLOR_GRAY2BGR)
        x = int(round((10.0 + (index % 2) * 60.0) * pixels_per_mm))
        y = int(round((10.0 + (index // 2) * 60.0) * pixels_per_mm))
        texture[y : y + marker_size, x : x + marker_size] = marker_bgr
    return texture


def _procedural_background(seed: int) -> np.ndarray:
    rng = np.random.default_rng(seed)
    width, height = IMAGE_SIZE
    low_res = rng.normal(0, 1, (height // 8, width // 8)).astype(np.float32)
    texture = cv2.resize(low_res, (width, height), interpolation=cv2.INTER_CUBIC)
    texture = cv2.GaussianBlur(texture, (0, 0), 9)
    base = np.clip(164 + texture * 13, 90, 220).astype(np.uint8)
    image = cv2.cvtColor(base, cv2.COLOR_GRAY2BGR)
    for offset in (-14, 0, 11):
        points = np.asarray(
            [[760, 0], [748 + offset, 260], [775 + offset, 520], [752 + offset, 810], [790, 1080]],
            np.int32,
        )
        cv2.polylines(image, [points], False, (70, 76, 72), 1 if offset else 3)
    return image


def load_background(dataset_root: Path | None, seed: int) -> tuple[np.ndarray, str]:
    if dataset_root and dataset_root.exists():
        image_root = dataset_root / "image"
        search_root = image_root if image_root.is_dir() else dataset_root
        candidates = sorted(
            path
            for pattern in ("*.jpg", "*.JPG", "*.png", "*.PNG")
            for path in search_root.rglob(pattern)
            if "gt" not in path.name.lower()
        )
        if candidates:
            chosen = candidates[seed % len(candidates)]
            image = read_image(chosen)
            if image is not None:
                return cv2.resize(image, IMAGE_SIZE), f"crackforest:{chosen.name}"
    return _procedural_background(seed), "procedural_fallback"


def _project_board(
    image: np.ndarray,
    board: BoardSpec,
    center_x_mm: float,
    rvec: np.ndarray,
    tvec: np.ndarray,
    occlusion: str,
) -> None:
    half = BOARD_SIZE_MM / 2
    object_corners = np.asarray(
        [
            [center_x_mm - half, -half, 0.0],
            [center_x_mm + half, -half, 0.0],
            [center_x_mm + half, half, 0.0],
            [center_x_mm - half, half, 0.0],
        ],
        dtype=np.float32,
    )
    projected, _ = cv2.projectPoints(
        object_corners, rvec, tvec, CAMERA_MATRIX, DISTORTION
    )
    destination = projected.reshape(4, 2).astype(np.float32)
    texture = make_board_texture(board)
    if occlusion == "right_two" and board.side == "RIGHT":
        texture[texture.shape[0] // 2 :, :] = 170
    elif occlusion == "small" and board.side == "RIGHT":
        cv2.circle(texture, (texture.shape[1] // 2, texture.shape[0] // 2), 42, (115, 115, 115), -1)
    height, width = texture.shape[:2]
    source = np.asarray(
        [[0.0, 0.0], [width - 1.0, 0.0], [width - 1.0, height - 1.0], [0.0, height - 1.0]],
        dtype=np.float32,
    )
    homography = cv2.getPerspectiveTransform(source, destination)
    warped = cv2.warpPerspective(texture, homography, IMAGE_SIZE)
    mask = cv2.warpPerspective(np.full((height, width), 255, np.uint8), homography, IMAGE_SIZE)
    image[mask > 0] = warped[mask > 0]


def render_case(
    case: SyntheticCase,
    *,
    baseline_mm: float = 243.2,
    dataset_root: Path | None = None,
    seed: int = 7,
) -> tuple[np.ndarray, dict]:
    distance = baseline_mm + case.delta_mm
    image, background_source = load_background(dataset_root, seed)
    rvec = _rotation_vector(case.yaw_deg, case.pitch_deg)
    tvec = np.asarray([[0.0], [0.0], [900.0]], dtype=np.float64)
    _project_board(image, DEMO_LEFT, -distance / 2, rvec, tvec, case.occlusion)
    _project_board(image, DEMO_RIGHT, distance / 2, rvec, tvec, case.occlusion)

    if case.brightness != 1.0:
        image = cv2.convertScaleAbs(image, alpha=case.brightness, beta=0)
    if case.blur_sigma > 0:
        kernel = max(3, int(round(case.blur_sigma * 6)) | 1)
        image = cv2.GaussianBlur(image, (kernel, kernel), case.blur_sigma)
    if case.noise_sigma > 0:
        rng = np.random.default_rng(seed + 1000)
        noise = rng.normal(0, case.noise_sigma, image.shape).astype(np.float32)
        image = np.clip(image.astype(np.float32) + noise, 0, 255).astype(np.uint8)

    truth = {
        "name": case.name,
        "ground_truth_mm": distance,
        "baseline_mm": baseline_mm,
        "delta_mm": case.delta_mm,
        "yaw_deg": case.yaw_deg,
        "pitch_deg": case.pitch_deg,
        "brightness": case.brightness,
        "blur_sigma": case.blur_sigma,
        "occlusion": case.occlusion,
        "expected_gate": case.expected_gate,
        "background_source": background_source,
    }
    return image, truth


def default_cases() -> list[SyntheticCase]:
    cases: list[SyntheticCase] = []
    for delta in (0.0, 1.0, 2.0, 5.0, 10.0):
        for angle in (0.0, 10.0, 20.0, 30.0):
            cases.append(
                SyntheticCase(
                    name=f"delta_{delta:g}_angle_{angle:g}",
                    delta_mm=delta,
                    yaw_deg=angle,
                    pitch_deg=-angle / 3,
                )
            )
    cases.extend(
        [
            SyntheticCase("brightness_low", 5.0, 15.0, brightness=0.55),
            SyntheticCase("brightness_high", 5.0, 15.0, brightness=1.35),
            SyntheticCase("small_occlusion", 5.0, 20.0, occlusion="small"),
            SyntheticCase(
                "blur_reject",
                5.0,
                10.0,
                blur_sigma=7.0,
                noise_sigma=0.0,
                expected_gate="rejected",
            ),
            SyntheticCase(
                "occlusion_reject",
                5.0,
                10.0,
                occlusion="right_two",
                expected_gate="rejected",
            ),
            SyntheticCase(
                "angle_reject", 5.0, 42.0, expected_gate="rejected"
            ),
        ]
    )
    return cases
