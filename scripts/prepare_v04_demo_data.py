from __future__ import annotations

import json
import hashlib
import shutil
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any

import cv2
import numpy as np


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.cv.synthetic import SyntheticCase, render_case  # noqa: E402


WALL_DATASET = {
    "dataset": "Wall Crack Image Dataset for Earthquake and Structural Health Analysis",
    "source_url": "https://data.mendeley.com/datasets/hxrry6krs7/1",
    "doi": "10.17632/hxrry6krs7.1",
    "license": "CC BY 4.0",
}

CURATED_FILENAMES = [
    "SA_crack_78.jpg",
    "OH_crack_7.jpg",
    "RA_CRACK_IMG (131).jpg",
    "RA_CRACK_IMG 32.jpg",
    "OH_crack_56.jpg",
    "RA_CRACK_IMG(79).jpg",
    "RA_CRACK_IMG (142).jpg",
    "RA_CRACK_IMG(91).jpeg",
    "RA_CRACK_IMG(82).jpg",
    "RA_CRACK_IMG(93).jpeg",
    "SA_crack_91.jpg",
    "RA_CRACK_IMG(75).jpg",
]


@dataclass(frozen=True)
class DemoCase:
    case_id: str
    title: str
    context_filename: str
    scene_index: int
    opening_delta_mm: float
    yaw_deg: float
    pitch_deg: float
    expected_geometry_gate: str = "accepted"
    surface_change: str = "none"
    blur_sigma: float = 0.0
    expected_ai_observations: tuple[str, ...] = ()


CASES = [
    DemoCase(
        "case_01_stable",
        "墙体裂缝稳定复测",
        "RA_CRACK_IMG 32.jpg",
        0,
        0.3,
        0.0,
        0.0,
        expected_ai_observations=("none",),
    ),
    DemoCase(
        "case_02_widening",
        "裂缝张开（由几何测量）",
        "RA_CRACK_IMG(91).jpeg",
        1,
        5.0,
        0.0,
        0.0,
        expected_ai_observations=("none",),
    ),
    DemoCase(
        "case_03_seepage",
        "墙体裂缝复测 + 疑似新增水迹",
        "OH_crack_7.jpg",
        0,
        4.8,
        0.0,
        0.0,
        surface_change="controlled_water_stain",
        expected_ai_observations=("seepage_or_water_stain",),
    ),
    DemoCase(
        "case_04_spalling",
        "小位移 + 局部表面剥落",
        "RA_CRACK_IMG (131).jpg",
        2,
        1.2,
        0.0,
        0.0,
        surface_change="controlled_spalling",
        expected_ai_observations=("spalling_or_peeling",),
    ),
    DemoCase(
        "case_05_quality_fail",
        "照片模糊，无法可靠复核",
        "SA_crack_91.jpg",
        1,
        4.8,
        0.0,
        0.0,
        expected_geometry_gate="rejected",
        blur_sigma=9.0,
        expected_ai_observations=("coverage_missing",),
    ),
]


def read_image(path: Path) -> np.ndarray:
    image = cv2.imdecode(np.fromfile(path, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise RuntimeError(f"无法读取图像：{path}")
    return image


def write_jpeg(path: Path, image: np.ndarray, quality: int = 91) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    ok, encoded = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, quality])
    if not ok:
        raise RuntimeError(f"无法编码图像：{path}")
    encoded.tofile(path)


def resize_cover(image: np.ndarray, width: int, height: int) -> np.ndarray:
    source_height, source_width = image.shape[:2]
    scale = max(width / source_width, height / source_height)
    resized = cv2.resize(
        image,
        (round(source_width * scale), round(source_height * scale)),
        interpolation=cv2.INTER_AREA,
    )
    x0 = max(0, (resized.shape[1] - width) // 2)
    y0 = max(0, (resized.shape[0] - height) // 2)
    return resized[y0 : y0 + height, x0 : x0 + width]


def relative(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def load_candidate_index() -> dict[str, dict[str, Any]]:
    index_path = ROOT / "artifacts" / "v04_source_selection" / "wall_crack_candidates.json"
    if not index_path.exists():
        raise SystemExit("缺少候选索引，请先运行 scripts/download_v04_sources.py。")
    records = json.loads(index_path.read_text(encoding="utf-8"))
    return {record["source_filename"]: record for record in records}


def prepare_curated_library(candidate_index: dict[str, dict[str, Any]]) -> dict[str, dict[str, Any]]:
    output_root = ROOT / "data" / "curated_scene_library"
    output_root.mkdir(parents=True, exist_ok=True)
    manifest: list[dict[str, Any]] = []
    by_filename: dict[str, dict[str, Any]] = {}
    for index, filename in enumerate(CURATED_FILENAMES, start=1):
        if filename not in candidate_index:
            raise RuntimeError(f"候选素材不存在：{filename}")
        source = candidate_index[filename]
        source_path = Path(source["local_path"])
        image = resize_cover(read_image(source_path), 1440, 960)
        output_path = output_root / f"scene_{index:02d}.jpg"
        write_jpeg(output_path, image)
        record = {
            "scene_id": f"v04_scene_{index:02d}",
            **WALL_DATASET,
            "source_filename": filename,
            "source_file_id": source["source_file_id"],
            "source_sha256": source["source_sha256"],
            "curated_file": relative(output_path),
            "transforms": ["resize_cover_1440x960", "jpeg_quality_91"],
            "is_real_guizhou_monitoring_data": False,
        }
        manifest.append(record)
        by_filename[filename] = record
    facade_context = output_root / "site_overview_cc0.jpg"
    if facade_context.exists():
        manifest.append(
            {
                "scene_id": "v04_facade_context_01",
                "dataset": "Pixnio public-domain architecture image",
                "source_url": "https://pixnio.com/architecture/buildings/architecture-building-city-window-house-wall-urban-street-old-home-brick",
                "license": "CC0",
                "source_filename": "2017-09-11-08-39-51-1536x1024.jpg",
                "source_sha256": hashlib.sha256(facade_context.read_bytes()).hexdigest(),
                "curated_file": relative(facade_context),
                "transforms": ["downloaded_1536x1024_derivative"],
                "usage": "homepage full-facade field context only",
                "is_real_guizhou_monitoring_data": False,
            }
        )
    (output_root / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    return by_filename


def prepare_cases(curated: dict[str, dict[str, Any]]) -> None:
    case_root = ROOT / "data" / "demo_cases"
    close_manifest = json.loads((ROOT / "data" / "demo_scene_source_manifest.json").read_text(encoding="utf-8"))
    expected: dict[str, list[str]] = {}
    for index, case in enumerate(CASES, start=1):
        output = case_root / case.case_id
        output.mkdir(parents=True, exist_ok=True)
        context_record = curated[case.context_filename]
        context_source = ROOT / context_record["curated_file"]
        shutil.copyfile(context_source, output / "context.jpg")

        baseline_case = SyntheticCase(
            f"{case.case_id}_previous",
            0.0,
            0.0,
            0.0,
            noise_sigma=0.8,
            scene_index=case.scene_index,
        )
        current_case = SyntheticCase(
            f"{case.case_id}_current",
            case.opening_delta_mm,
            case.yaw_deg,
            case.pitch_deg,
            shear_delta_mm=0.5 if case.opening_delta_mm >= 4.0 else 0.0,
            blur_sigma=case.blur_sigma,
            noise_sigma=0.0 if case.blur_sigma else 0.8,
            expected_gate=case.expected_geometry_gate,
            scene_index=case.scene_index,
            surface_change=case.surface_change,
        )
        previous, previous_truth = render_case(baseline_case, dataset_root=ROOT / "data", seed=600 + index)
        current, current_truth = render_case(current_case, dataset_root=ROOT / "data", seed=600 + index)
        write_jpeg(output / "previous_close.jpg", previous, quality=94)
        write_jpeg(output / "current_close.jpg", current, quality=94)

        close_source = close_manifest[case.scene_index % len(close_manifest)]
        synthetic_changes = [f"opening_delta_{case.opening_delta_mm:g}mm"]
        if case.surface_change != "none":
            synthetic_changes.append(case.surface_change)
        if case.blur_sigma:
            synthetic_changes.append(f"controlled_blur_sigma_{case.blur_sigma:g}")
        metadata = {
            "case_id": case.case_id,
            "title": case.title,
            "worker_story": "贵州仁怀基层监测员公开工作流的本地 Demo 复原",
            "context_source": context_record,
            "close_source": close_source,
            "synthetic_changes": synthetic_changes,
            "expected_geometry": {
                "opening_delta_mm": case.opening_delta_mm,
                "gate": case.expected_geometry_gate,
                "measurement_source": "deterministic_geometry",
            },
            "expected_ai_observations": list(case.expected_ai_observations),
            "context_callouts": [
                {"id": "01", "label": "裂缝复测点", "x": 0.34, "y": 0.51},
                {"id": "02", "label": "墙面 / 挡墙观察区域", "x": 0.62, "y": 0.36},
                {"id": "03", "label": "排水 / 渗水观察区域", "x": 0.72, "y": 0.76},
            ],
            "previous_truth": previous_truth,
            "current_truth": current_truth,
            "is_real_guizhou_data": False,
            "disclosure": "公开墙体图片与明确受控变化构成的比赛演示，不是真实事故或贵州现场记录。",
        }
        (output / "metadata.json").write_text(
            json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        expected[case.case_id] = list(case.expected_ai_observations)
        print(f"prepared {case.case_id}: opening={case.opening_delta_mm:+.1f} mm, AI={expected[case.case_id]}")
    (case_root / "expected_ai_observations.json").write_text(
        json.dumps(expected, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def main() -> None:
    candidate_index = load_candidate_index()
    curated = prepare_curated_library(candidate_index)
    prepare_cases(curated)
    print(f"已完成 {len(CURATED_FILENAMES)} 张 curated scene images 与 {len(CASES)} 个 Demo Case。")


if __name__ == "__main__":
    main()
