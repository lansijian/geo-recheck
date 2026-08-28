from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import urllib.request
from pathlib import Path
from typing import Any

import cv2
import numpy as np


ROOT = Path(__file__).resolve().parents[1]
DATASET_ID = "hxrry6krs7"
DATASET_VERSION = 1
DATASET_URL = f"https://data.mendeley.com/datasets/{DATASET_ID}/{DATASET_VERSION}"
PUBLIC_API = f"https://data.mendeley.com/public-api/datasets/{DATASET_ID}"
EXPECTED_DOI = "10.17632/hxrry6krs7.1"
EXPECTED_LICENSE = "CC BY 4.0"
DEFAULT_CANDIDATE_LIMIT = 48


def read_image(path: Path) -> np.ndarray | None:
    try:
        return cv2.imdecode(np.fromfile(path, dtype=np.uint8), cv2.IMREAD_COLOR)
    except (OSError, ValueError):
        return None


def write_image(path: Path, image: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    ok, encoded = cv2.imencode(path.suffix or ".jpg", image)
    if not ok:
        raise RuntimeError(f"无法编码图像：{path}")
    encoded.tofile(path)


def fetch_bytes(url: str, *, resolve_ip: str | None = None) -> bytes:
    if resolve_ip:
        completed = subprocess.run(
            [
                "curl.exe",
                "--resolve",
                f"data.mendeley.com:443:{resolve_ip}",
                "--max-time",
                "90",
                "--silent",
                "--show-error",
                "--location",
                url,
            ],
            check=True,
            capture_output=True,
        )
        return completed.stdout
    request = urllib.request.Request(url, headers={"User-Agent": "geo-recheck-v0.4/1.0"})
    with urllib.request.urlopen(request, timeout=90) as response:
        return response.read()


def download_file(url: str, target: Path, expected_size: int, *, resolve_ip: str | None = None) -> None:
    if target.exists() and target.stat().st_size == expected_size:
        return
    payload = fetch_bytes(url, resolve_ip=resolve_ip)
    if len(payload) != expected_size:
        raise RuntimeError(f"文件长度不匹配：{target.name} expected={expected_size} actual={len(payload)}")
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(payload)


def deterministic_candidates(files: list[dict[str, Any]], limit: int) -> list[dict[str, Any]]:
    images = [
        item
        for item in files
        if item.get("content_details", {}).get("content_type", "").startswith("image/")
        and 50_000 <= int(item.get("size", 0)) <= 2_500_000
    ]
    images.sort(key=lambda item: hashlib.sha256(item["filename"].encode("utf-8")).hexdigest())
    return images[:limit]


def image_metrics(path: Path) -> dict[str, Any] | None:
    image = read_image(path)
    if image is None:
        return None
    height, width = image.shape[:2]
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    return {
        "width": width,
        "height": height,
        "sharpness": round(float(cv2.Laplacian(gray, cv2.CV_64F).var()), 2),
        "mean_luma": round(float(gray.mean()), 2),
    }


def contact_sheet(records: list[dict[str, Any]], output: Path) -> None:
    cells: list[np.ndarray] = []
    for index, record in enumerate(records, start=1):
        source = Path(record["local_path"])
        image = read_image(source)
        if image is None:
            continue
        height, width = image.shape[:2]
        scale = max(320 / width, 220 / height)
        resized = cv2.resize(image, (round(width * scale), round(height * scale)), interpolation=cv2.INTER_AREA)
        y0 = max(0, (resized.shape[0] - 220) // 2)
        x0 = max(0, (resized.shape[1] - 320) // 2)
        cell = resized[y0 : y0 + 220, x0 : x0 + 320].copy()
        cv2.rectangle(cell, (0, 0), (320, 30), (244, 244, 239), -1)
        label = f"#{index:02d} {source.name[:26]}"
        cv2.putText(cell, label, (8, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.46, (35, 54, 48), 1, cv2.LINE_AA)
        cells.append(cell)
    if not cells:
        raise RuntimeError("候选图片均无法解码。")
    rows: list[np.ndarray] = []
    for start in range(0, len(cells), 4):
        row = cells[start : start + 4]
        while len(row) < 4:
            row.append(np.full_like(cells[0], 239))
        rows.append(np.hstack(row))
    write_image(output, np.vstack(rows))


def main() -> None:
    parser = argparse.ArgumentParser(description="下载并筛选 V0.4 官方开放墙裂缝候选素材。")
    parser.add_argument("--candidate-limit", type=int, default=DEFAULT_CANDIDATE_LIMIT)
    parser.add_argument(
        "--mendeley-ip",
        help="仅用于本机 DNS 故障时传给 curl --resolve；不会改系统或 Git 配置。",
    )
    args = parser.parse_args()

    raw_root = ROOT / "data" / "datasets" / "wall_crack_526"
    candidate_root = raw_root / "candidates"
    artifact_root = ROOT / "artifacts" / "v04_source_selection"
    raw_root.mkdir(parents=True, exist_ok=True)
    artifact_root.mkdir(parents=True, exist_ok=True)

    snapshot = json.loads(fetch_bytes(PUBLIC_API, resolve_ip=args.mendeley_ip).decode("utf-8"))
    if snapshot.get("doi", {}).get("id") != EXPECTED_DOI:
        raise RuntimeError("Mendeley 数据集 DOI 与预期不一致。")
    if len(snapshot.get("files", [])) < 526:
        raise RuntimeError("Mendeley 数据集文件清单不完整。")
    (raw_root / "dataset.json").write_text(
        json.dumps(snapshot, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    candidates = deterministic_candidates(snapshot["files"], max(12, args.candidate_limit))
    records: list[dict[str, Any]] = []
    for index, item in enumerate(candidates, start=1):
        target = candidate_root / item["filename"]
        download_file(
            item["content_details"]["download_url"],
            target,
            int(item["size"]),
            resolve_ip=args.mendeley_ip,
        )
        metrics = image_metrics(target)
        if metrics is None:
            continue
        records.append(
            {
                "candidate_index": index,
                "dataset": snapshot["name"],
                "source_url": DATASET_URL,
                "doi": EXPECTED_DOI,
                "license": EXPECTED_LICENSE,
                "source_filename": item["filename"],
                "source_file_id": item["id"],
                "source_sha256": item["content_details"]["sha256_hash"],
                "local_path": target.as_posix(),
                **metrics,
            }
        )
        print(f"[{index:02d}/{len(candidates):02d}] {item['filename']} {metrics['width']}x{metrics['height']}")

    index_path = artifact_root / "wall_crack_candidates.json"
    index_path.write_text(json.dumps(records, ensure_ascii=False, indent=2), encoding="utf-8")
    contact_sheet(records, artifact_root / "wall_crack_candidates.jpg")
    print(f"已下载并核验 {len(records)} 张候选图；索引：{index_path}")


if __name__ == "__main__":
    main()
