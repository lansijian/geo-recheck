from __future__ import annotations

import json
from dataclasses import dataclass
from pathlib import Path

import cv2
import numpy as np

from .board_geometry import (
    BOARD_HEIGHT_MM,
    BOARD_WIDTH_MM,
    DEMO_LEFT,
    DEMO_RIGHT,
    MARKER_SIZE_MM,
    MARKER_X_MM,
    MARKER_Y_MM,
    BoardSpec,
)
from .image_io import read_image
from .marker_detector import april_tag_dictionary


IMAGE_SIZE = (1920, 1080)
CANONICAL_SIZE = (2000, 1200)
SYNTHETIC_PIXELS_PER_MM = 2.0
BASELINE_CRACK_WIDTH_MM = 8.0
BASELINE_BOARD_SEPARATION_MM = 160.0
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
    shear_delta_mm: float = 0.0
    brightness: float = 1.0
    blur_sigma: float = 0.0
    noise_sigma: float = 1.2
    occlusion: str = "none"
    expected_gate: str = "accepted"


def _rotation_matrix(yaw_deg: float, pitch_deg: float, roll_deg: float = 0.0) -> np.ndarray:
    yaw, pitch, roll = np.radians([yaw_deg, pitch_deg, roll_deg])
    ry = np.asarray(
        [[np.cos(yaw), 0.0, np.sin(yaw)], [0.0, 1.0, 0.0], [-np.sin(yaw), 0.0, np.cos(yaw)]],
        dtype=np.float64,
    )
    rx = np.asarray(
        [[1.0, 0.0, 0.0], [0.0, np.cos(pitch), -np.sin(pitch)], [0.0, np.sin(pitch), np.cos(pitch)]],
        dtype=np.float64,
    )
    rz = np.asarray(
        [[np.cos(roll), -np.sin(roll), 0.0], [np.sin(roll), np.cos(roll), 0.0], [0.0, 0.0, 1.0]],
        dtype=np.float64,
    )
    return rz @ rx @ ry


def make_board_texture(board: BoardSpec, pixels_per_mm: float = 4.0) -> np.ndarray:
    """Render an engineering recheck sticker with compact AprilTags and human labels."""
    width = int(round(BOARD_WIDTH_MM * pixels_per_mm))
    height = int(round(BOARD_HEIGHT_MM * pixels_per_mm))
    marker_size = int(round(MARKER_SIZE_MM * pixels_per_mm))
    render_scale = max(0.75, pixels_per_mm / 4.0)
    line_width = max(1, int(round(render_scale * 2)))
    texture = np.full((height, width, 3), 248, np.uint8)
    cv2.rectangle(texture, (1, 1), (width - 2, height - 2), (45, 72, 65), line_width)
    cv2.line(texture, (width // 2, 3), (width // 2, height - 4), (90, 115, 106), 1)
    cv2.line(texture, (width // 2 - 10, height // 2), (width // 2 + 10, height // 2), (18, 113, 82), 2)
    for index, marker_id in enumerate(board.marker_ids):
        marker = cv2.aruco.generateImageMarker(
            april_tag_dictionary(), marker_id, marker_size, borderBits=1
        )
        marker_bgr = cv2.cvtColor(marker, cv2.COLOR_GRAY2BGR)
        x = int(round(MARKER_X_MM[index % 2] * pixels_per_mm))
        y = int(round(MARKER_Y_MM[index // 2] * pixels_per_mm))
        texture[y : y + marker_size, x : x + marker_size] = marker_bgr
    label = "CRACK-W01"
    side = "LEFT" if board.side == "LEFT" else "RIGHT"
    cv2.putText(texture, label, (width // 2 - int(48 * render_scale), height // 2 - int(6 * render_scale)), cv2.FONT_HERSHEY_SIMPLEX, 0.36 * render_scale, (31, 62, 54), max(1, int(render_scale)), cv2.LINE_AA)
    cv2.putText(texture, side, (width // 2 - int(24 * render_scale), height // 2 + int(16 * render_scale)), cv2.FONT_HERSHEY_SIMPLEX, 0.38 * render_scale, (18, 113, 82), max(1, int(render_scale)), cv2.LINE_AA)
    arrow_end = (width // 2 + int((25 if board.side == "LEFT" else -25) * render_scale), height // 2)
    cv2.arrowedLine(texture, (width // 2, height // 2), arrow_end, (18, 113, 82), line_width, tipLength=0.3)
    return texture


def _procedural_wall(seed: int) -> tuple[np.ndarray, np.ndarray, str]:
    """Test-only fallback; final Golden Path is generated from the licensed dataset."""
    rng = np.random.default_rng(seed)
    width, height = CANONICAL_SIZE
    noise = rng.normal(0, 1, (height // 10, width // 10)).astype(np.float32)
    noise = cv2.resize(noise, (width, height), interpolation=cv2.INTER_CUBIC)
    base = np.clip(184 + cv2.GaussianBlur(noise, (0, 0), 7) * 14, 118, 224).astype(np.uint8)
    wall = cv2.cvtColor(base, cv2.COLOR_GRAY2BGR)
    mask = np.zeros((height, width), np.uint8)
    points = np.asarray([[1010, 50], [982, 260], [1028, 470], [995, 700], [1022, 940], [1000, 1150]], np.int32)
    cv2.polylines(mask, [points], False, 255, 5)
    return wall, mask, "procedural_test_fallback"


def _resize_cover(image: np.ndarray, size: tuple[int, int], interpolation: int) -> np.ndarray:
    target_width, target_height = size
    height, width = image.shape[:2]
    scale = max(target_width / width, target_height / height)
    resized = cv2.resize(image, (int(round(width * scale)), int(round(height * scale))), interpolation=interpolation)
    y0 = max(0, (resized.shape[0] - target_height) // 2)
    x0 = max(0, (resized.shape[1] - target_width) // 2)
    return resized[y0 : y0 + target_height, x0 : x0 + target_width]


def _load_manifest_scene(manifest_path: Path) -> tuple[np.ndarray, np.ndarray, str] | None:
    if not manifest_path.exists():
        return None
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    record = manifest[0] if isinstance(manifest, list) else manifest
    source_file = Path(record["source_file"])
    mask_file = Path(record["mask_file"])
    project_root = manifest_path.parents[1]
    source_file = source_file if source_file.is_absolute() else project_root / source_file
    mask_file = mask_file if mask_file.is_absolute() else project_root / mask_file
    image = read_image(source_file)
    mask = read_image(mask_file, cv2.IMREAD_GRAYSCALE)
    if image is None or mask is None:
        return None
    image = _resize_cover(image, CANONICAL_SIZE, cv2.INTER_AREA)
    mask = _resize_cover(mask, CANONICAL_SIZE, cv2.INTER_NEAREST)
    return image, np.where(mask > 127, 255, 0).astype(np.uint8), record["source_file"]


def load_wall_source(dataset_root: Path | None, seed: int) -> tuple[np.ndarray, np.ndarray, str]:
    if dataset_root:
        loaded = _load_manifest_scene(dataset_root / "demo_scene_source_manifest.json")
        if loaded:
            return loaded
    return _procedural_wall(seed)


def _paste_texture(image: np.ndarray, texture: np.ndarray, center: tuple[int, int]) -> None:
    height, width = texture.shape[:2]
    x0, y0 = center[0] - width // 2, center[1] - height // 2
    image[y0 : y0 + height, x0 : x0 + width] = texture


def _crack_center_x(mask: np.ndarray) -> int:
    _, xs = np.where(mask > 0)
    return int(np.median(xs)) if len(xs) else mask.shape[1] // 2


def _apply_controlled_deformation(
    baseline_plane: np.ndarray,
    crack_mask: np.ndarray,
    opening_delta_mm: float,
    shear_delta_mm: float,
) -> tuple[np.ndarray, np.ndarray]:
    dx = int(round(opening_delta_mm * SYNTHETIC_PIXELS_PER_MM))
    dy = int(round(shear_delta_mm * SYNTHETIC_PIXELS_PER_MM))
    if dx == 0 and dy == 0:
        return baseline_plane.copy(), crack_mask.copy()
    height, width = baseline_plane.shape[:2]
    split_x = _crack_center_x(crack_mask)
    transform = np.asarray([[1.0, 0.0, dx], [0.0, 1.0, dy]], np.float32)
    shifted = cv2.warpAffine(baseline_plane, transform, (width, height), borderMode=cv2.BORDER_REPLICATE)
    shifted_mask = cv2.warpAffine(crack_mask, transform, (width, height), flags=cv2.INTER_NEAREST)
    result = baseline_plane.copy()
    selector = np.zeros((height, width), np.uint8)
    selector[:, split_x + dx :] = 255
    result[selector > 0] = shifted[selector > 0]
    combined_mask = np.maximum(crack_mask, shifted_mask)
    if dx > 0:
        gap = np.zeros_like(crack_mask)
        gap[:, max(0, split_x - 2) : min(width, split_x + dx + 2)] = 255
        combined_mask = np.maximum(combined_mask, gap)
    return result, combined_mask


def _render_crack(image: np.ndarray, mask: np.ndarray, crack_width_mm: float) -> None:
    radius = max(1, int(round(crack_width_mm * SYNTHETIC_PIXELS_PER_MM / 2)))
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (radius * 2 + 1, radius * 2 + 1))
    expanded = cv2.dilate(mask, kernel)
    alpha = (expanded.astype(np.float32) / 255.0 * 0.78)[..., None]
    shadow = np.full_like(image, (46, 49, 47))
    image[:] = np.clip(image * (1.0 - alpha) + shadow * alpha, 0, 255).astype(np.uint8)


def build_canonical_wall_plane(
    opening_delta_mm: float,
    shear_delta_mm: float,
    dataset_root: Path | None,
    seed: int,
    occlusion: str,
) -> tuple[np.ndarray, dict]:
    wall, mask, source = load_wall_source(dataset_root, seed)
    split_x = _crack_center_x(mask)
    center_y = wall.shape[0] // 2
    half_separation_px = int(round(BASELINE_BOARD_SEPARATION_MM * SYNTHETIC_PIXELS_PER_MM / 2))
    _paste_texture(wall, make_board_texture(DEMO_LEFT, SYNTHETIC_PIXELS_PER_MM), (split_x - half_separation_px, center_y))
    _paste_texture(wall, make_board_texture(DEMO_RIGHT, SYNTHETIC_PIXELS_PER_MM), (split_x + half_separation_px, center_y))
    plane, moved_mask = _apply_controlled_deformation(wall, mask, opening_delta_mm, shear_delta_mm)
    _render_crack(plane, moved_mask, BASELINE_CRACK_WIDTH_MM + max(0.0, opening_delta_mm))
    if occlusion in {"small", "right_two"}:
        right_x = split_x + half_separation_px + int(round(opening_delta_mm * SYNTHETIC_PIXELS_PER_MM))
        if occlusion == "small":
            cv2.circle(plane, (right_x + 55, center_y - 26), 23, (130, 130, 127), -1)
        else:
            cv2.rectangle(plane, (right_x - 100, center_y), (right_x + 100, center_y + 60), (139, 140, 136), -1)
    return plane, {
        "background_source": source,
        "canonical_size_px": list(CANONICAL_SIZE),
        "synthetic_scale_px_per_mm": SYNTHETIC_PIXELS_PER_MM,
        "baseline_crack_width_mm": BASELINE_CRACK_WIDTH_MM,
        "baseline_right_center_mm": [BASELINE_BOARD_SEPARATION_MM, 0.0],
        "current_right_center_mm": [BASELINE_BOARD_SEPARATION_MM + opening_delta_mm, shear_delta_mm],
        "coherent_plane": True,
    }


def _camera_homography(yaw_deg: float, pitch_deg: float, roll_deg: float = 0.0) -> np.ndarray:
    width_px, height_px = CANONICAL_SIZE
    width_mm = width_px / SYNTHETIC_PIXELS_PER_MM
    height_mm = height_px / SYNTHETIC_PIXELS_PER_MM
    source = np.asarray([[0, 0], [width_px - 1, 0], [width_px - 1, height_px - 1], [0, height_px - 1]], np.float32)
    object_corners = np.asarray(
        [[-width_mm / 2, -height_mm / 2, 0.0], [width_mm / 2, -height_mm / 2, 0.0], [width_mm / 2, height_mm / 2, 0.0], [-width_mm / 2, height_mm / 2, 0.0]],
        np.float64,
    )
    rotation = _rotation_matrix(yaw_deg, pitch_deg, roll_deg)
    rotated = (rotation @ object_corners.T).T + np.asarray([0.0, 0.0, 900.0])
    projected = np.column_stack(
        [CAMERA_MATRIX[0, 0] * rotated[:, 0] / rotated[:, 2] + CAMERA_MATRIX[0, 2], CAMERA_MATRIX[1, 1] * rotated[:, 1] / rotated[:, 2] + CAMERA_MATRIX[1, 2]]
    ).astype(np.float32)
    return cv2.getPerspectiveTransform(source, projected)


def render_case(
    case: SyntheticCase,
    *,
    baseline_mm: float = BASELINE_BOARD_SEPARATION_MM,
    dataset_root: Path | None = None,
    seed: int = 7,
) -> tuple[np.ndarray, dict]:
    del baseline_mm
    plane, physical = build_canonical_wall_plane(case.delta_mm, case.shear_delta_mm, dataset_root, seed, case.occlusion)
    homography = _camera_homography(case.yaw_deg, case.pitch_deg)
    output = np.full((IMAGE_SIZE[1], IMAGE_SIZE[0], 3), (224, 226, 222), np.uint8)
    warped = cv2.warpPerspective(plane, homography, IMAGE_SIZE)
    mask = cv2.warpPerspective(np.full(plane.shape[:2], 255, np.uint8), homography, IMAGE_SIZE)
    output[mask > 0] = warped[mask > 0]
    if case.brightness != 1.0:
        output = cv2.convertScaleAbs(output, alpha=case.brightness, beta=0)
    if case.blur_sigma > 0:
        kernel = max(3, int(round(case.blur_sigma * 6)) | 1)
        output = cv2.GaussianBlur(output, (kernel, kernel), case.blur_sigma)
    if case.noise_sigma > 0:
        rng = np.random.default_rng(seed + 1000)
        noise = rng.normal(0, case.noise_sigma, output.shape).astype(np.float32)
        output = np.clip(output.astype(np.float32) + noise, 0, 255).astype(np.uint8)
    truth = {
        "name": case.name,
        "opening_delta_mm": case.delta_mm,
        "shear_delta_mm": case.shear_delta_mm,
        "ground_truth_mm": BASELINE_BOARD_SEPARATION_MM + case.delta_mm,
        "legacy_ground_truth_board_distance_mm": BASELINE_BOARD_SEPARATION_MM + case.delta_mm,
        "yaw_deg": case.yaw_deg,
        "pitch_deg": case.pitch_deg,
        "brightness": case.brightness,
        "blur_sigma": case.blur_sigma,
        "occlusion": case.occlusion,
        "expected_gate": case.expected_gate,
        "camera_homography": homography.tolist(),
        **physical,
    }
    return output, truth


def default_cases() -> list[SyntheticCase]:
    cases: list[SyntheticCase] = []
    index = 0
    for opening in (0.0, 1.0, 2.0, 5.0, 10.0):
        for yaw in (0.0, 10.0, 20.0, 30.0):
            for pitch in (0.0, 10.0, 20.0):
                expected_gate = "rejected" if float(np.hypot(yaw, pitch)) > 35.0 else "accepted"
                cases.append(SyntheticCase(f"case_{index:03d}_open_{opening:g}_yaw_{yaw:g}_pitch_{pitch:g}", opening, yaw, pitch, 0.5 if opening == 5.0 else 0.0, expected_gate=expected_gate))
                index += 1
    cases.extend(
        [
            SyntheticCase("brightness_low", 5.0, 15.0, 8.0, 0.5, brightness=0.58),
            SyntheticCase("brightness_high", 5.0, 15.0, 8.0, 0.5, brightness=1.25),
            SyntheticCase("small_occlusion", 5.0, 20.0, 10.0, 0.5, occlusion="small"),
            SyntheticCase("blur_reject", 5.0, 10.0, 5.0, 0.5, blur_sigma=7.0, noise_sigma=0.0, expected_gate="rejected"),
            SyntheticCase("occlusion_reject", 5.0, 10.0, 5.0, 0.5, occlusion="right_two", expected_gate="rejected"),
            SyntheticCase("angle_reject", 5.0, 42.0, 10.0, 0.5, expected_gate="rejected"),
        ]
    )
    return cases
