from __future__ import annotations

import argparse
import json
from pathlib import Path

import cv2
import numpy as np


ROOT = Path(__file__).resolve().parents[1]
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff"}
MASK_HINTS = ("mask", "alpha", "groundtruth", "ground_truth", "label", "_gt")


def read_image(path: Path, flags: int) -> np.ndarray | None:
    """Read images reliably from Windows paths containing non-ASCII text."""
    try:
        return cv2.imdecode(np.fromfile(path, dtype=np.uint8), flags)
    except (OSError, ValueError):
        return None


def write_image(path: Path, image: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    extension = path.suffix or ".jpg"
    ok, encoded = cv2.imencode(extension, image)
    if not ok:
        raise RuntimeError(f"无法编码图像：{path}")
    encoded.tofile(path)


def normalized_stem(path: Path) -> str:
    value = path.stem.lower()
    for token in MASK_HINTS:
        value = value.replace(token, "")
    return value.strip("_- ")


def looks_like_mask(path: Path, image: np.ndarray) -> bool:
    hint = any(token in str(path).lower() for token in MASK_HINTS)
    if image.ndim == 2:
        unique = np.unique(cv2.resize(image, (128, 128), interpolation=cv2.INTER_NEAREST))
        return hint or len(unique) <= 8
    channels_equal = np.mean(np.max(image, axis=2) == np.min(image, axis=2)) > 0.98
    return hint or channels_equal


def discover_pairs(dataset: Path) -> list[tuple[Path, Path]]:
    # The official Özgenel archive uses parallel BW/ and rgb/ folders with
    # identical numeric stems. Prefer that authoritative layout so grayscale
    # concrete photographs are never mistaken for masks by heuristics.
    bw_root = dataset / "BW"
    rgb_root = dataset / "rgb"
    if bw_root.is_dir() and rgb_root.is_dir():
        rgb_by_stem = {
            path.stem.lower(): path
            for path in rgb_root.rglob("*")
            if path.suffix.lower() in IMAGE_EXTENSIONS
        }
        official_pairs = [
            (rgb_by_stem[mask.stem.lower()], mask)
            for mask in sorted(bw_root.rglob("*"))
            if mask.suffix.lower() in IMAGE_EXTENSIONS and mask.stem.lower() in rgb_by_stem
        ]
        if official_pairs:
            return official_pairs

    files = [path for path in dataset.rglob("*") if path.suffix.lower() in IMAGE_EXTENSIONS]
    groups: dict[str, list[tuple[Path, bool]]] = {}
    for path in files:
        image = read_image(path, cv2.IMREAD_UNCHANGED)
        if image is None:
            continue
        groups.setdefault(normalized_stem(path), []).append((path, looks_like_mask(path, image)))
    pairs: list[tuple[Path, Path]] = []
    for items in groups.values():
        images = [path for path, is_mask in items if not is_mask]
        masks = [path for path, is_mask in items if is_mask]
        if images and masks:
            pairs.append((images[0], masks[0]))
    return pairs


def score_pair(image_path: Path, mask_path: Path) -> dict | None:
    image = read_image(image_path, cv2.IMREAD_COLOR)
    mask = read_image(mask_path, cv2.IMREAD_GRAYSCALE)
    if image is None or mask is None:
        return None
    mask = cv2.resize(mask, (image.shape[1], image.shape[0]), interpolation=cv2.INTER_NEAREST)
    binary = mask > 127
    ys, xs = np.where(binary)
    if len(xs) < 30:
        return None
    coverage = float(np.mean(binary))
    x_span = float(xs.max() - xs.min() + 1) / image.shape[1]
    y_span = float(ys.max() - ys.min() + 1) / image.shape[0]
    center_distance = abs(float(np.median(xs)) / image.shape[1] - 0.5)
    verticality = y_span - 0.45 * x_span
    exposure = float(np.mean(cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)))
    score = 4.0 * verticality + 1.8 * (1.0 - center_distance) - abs(coverage - 0.018) * 16.0 - abs(exposure - 155.0) / 255.0
    return {
        "image": image_path.as_posix(),
        "mask": mask_path.as_posix(),
        "score": round(score, 5),
        "mask_coverage": round(coverage, 6),
        "x_span": round(x_span, 4),
        "y_span": round(y_span, 4),
        "median_crack_x_ratio": round(float(np.median(xs)) / image.shape[1], 4),
    }


def make_contact_sheet(records: list[dict], output: Path) -> None:
    cells: list[np.ndarray] = []
    for index, record in enumerate(records):
        image = read_image(Path(record["image"]), cv2.IMREAD_COLOR)
        mask = read_image(Path(record["mask"]), cv2.IMREAD_GRAYSCALE)
        image = cv2.resize(image, (320, 220), interpolation=cv2.INTER_AREA)
        mask = cv2.resize(mask, (320, 220), interpolation=cv2.INTER_NEAREST)
        overlay = image.copy()
        overlay[mask > 127] = (38, 92, 217)
        image = cv2.addWeighted(image, 0.72, overlay, 0.28, 0)
        cv2.rectangle(image, (0, 0), (320, 28), (245, 245, 242), -1)
        cv2.putText(image, f"#{index + 1:02d} score {record['score']:.2f}", (8, 19), cv2.FONT_HERSHEY_SIMPLEX, 0.48, (34, 60, 53), 1, cv2.LINE_AA)
        cells.append(image)
    rows = []
    for start in range(0, len(cells), 4):
        row = cells[start : start + 4]
        while len(row) < 4:
            row.append(np.full_like(cells[0], 242))
        rows.append(np.hstack(row))
    write_image(output, np.vstack(rows))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset", type=Path, default=ROOT / "data" / "datasets" / "ozgenel")
    parser.add_argument("--limit", type=int, default=20)
    args = parser.parse_args()
    candidates = [record for pair in discover_pairs(args.dataset) if (record := score_pair(*pair))]
    candidates.sort(key=lambda item: item["score"], reverse=True)
    selected = candidates[: max(20, args.limit)]
    if len(selected) < 20:
        raise SystemExit(f"仅找到 {len(selected)} 组有效 image/mask，需检查数据集解压目录。")
    artifact_root = ROOT / "artifacts" / "scene_selection"
    artifact_root.mkdir(parents=True, exist_ok=True)
    relative_records = []
    for record in selected:
        relative_records.append({**record, "image": Path(record["image"]).relative_to(ROOT).as_posix(), "mask": Path(record["mask"]).relative_to(ROOT).as_posix()})
    (artifact_root / "candidates.json").write_text(json.dumps(relative_records, ensure_ascii=False, indent=2), encoding="utf-8")
    make_contact_sheet(selected, artifact_root / "contact_sheet.jpg")
    manifest = []
    for index, record in enumerate(relative_records[:3], start=1):
        manifest.append(
            {
                "scene_id": f"wall_scene_{index:03d}",
                "dataset": "Özgenel Concrete Crack Segmentation Dataset",
                "source_file": record["image"],
                "mask_file": record["mask"],
                "source_url": "https://data.mendeley.com/datasets/jwsn7tfbrp/1",
                "doi": "10.17632/jwsn7tfbrp.1",
                "license": "CC BY 4.0",
                "usage": "controlled synthetic hackathon demo",
                "is_real_guizhou_monitoring_data": False,
                "is_golden_path": index == 1,
                "selection_score": record["score"],
            }
        )
    (ROOT / "data" / "demo_scene_source_manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"screened {len(candidates)} pairs; selected {len(selected)}; Golden Path={manifest[0]['source_file']}")


if __name__ == "__main__":
    main()
