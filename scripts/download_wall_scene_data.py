from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATASET_ID = "jwsn7tfbrp"
VERSION = 1
FILE_ID = "88e685a6-e3c5-423d-845f-89e35a457867"
EXPECTED_SIZE = 745_914_150
EXPECTED_SHA256 = "1b8458ab6f84dc5086e9af8579e2cabccd3d209df97b46622096a4c105d5a6b2"
PUBLIC_API = f"https://data.mendeley.com/public-api/datasets/{DATASET_ID}/files?folder_id=root&version={VERSION}"
DOWNLOAD_URL = f"https://data.mendeley.com/public-files/datasets/{DATASET_ID}/files/{FILE_ID}/file_downloaded"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def download(archive: Path) -> None:
    part = archive.with_suffix(archive.suffix + ".part")
    existing = part.stat().st_size if part.exists() else 0
    headers = {"User-Agent": "geo-recheck-v0.3/1.0"}
    if existing:
        headers["Range"] = f"bytes={existing}-"
    request = urllib.request.Request(DOWNLOAD_URL, headers=headers)
    with urllib.request.urlopen(request, timeout=60) as response:
        append = existing > 0 and response.status == 206
        mode = "ab" if append else "wb"
        if not append:
            existing = 0
        total = int(response.headers.get("Content-Length", "0")) + existing
        downloaded = existing
        with part.open(mode) as target:
            while chunk := response.read(1024 * 1024):
                target.write(chunk)
                downloaded += len(chunk)
                print(f"\rdownloaded {downloaded / 1024 / 1024:.1f}/{total / 1024 / 1024:.1f} MiB", end="", flush=True)
    print()
    part.replace(archive)


def extract(archive: Path, output: Path) -> bool:
    marker = output / ".extracted"
    if marker.exists():
        return True
    completed = subprocess.run(["tar", "-xf", str(archive), "-C", str(output)], check=False)
    if completed.returncode != 0:
        print("自动解压失败。请用可信的 RAR 工具把文件解压到 data\\datasets\\ozgenel\\。")
        return False
    marker.write_text("official Mendeley archive extracted\n", encoding="utf-8")
    return True


def main() -> None:
    parser = argparse.ArgumentParser(description="Download the official Özgenel wall/concrete crack dataset.")
    parser.add_argument("--metadata-only", action="store_true")
    args = parser.parse_args()
    output = ROOT / "data" / "datasets" / "ozgenel"
    output.mkdir(parents=True, exist_ok=True)
    archive = output / "concreteCrackSegmentationDataset.rar"
    metadata = {
        "dataset": "Concrete Crack Segmentation Dataset",
        "contributor": "Çağlar Fırat Özgenel",
        "doi": "10.17632/jwsn7tfbrp.1",
        "license": "CC BY 4.0",
        "source_url": "https://data.mendeley.com/datasets/jwsn7tfbrp/1",
        "public_api": PUBLIC_API,
        "file_id": FILE_ID,
        "expected_size": EXPECTED_SIZE,
        "expected_sha256": EXPECTED_SHA256,
    }
    (output / "source_metadata.json").write_text(json.dumps(metadata, ensure_ascii=False, indent=2), encoding="utf-8")
    if args.metadata_only:
        print(json.dumps(metadata, ensure_ascii=False, indent=2))
        return
    if not archive.exists() or archive.stat().st_size != EXPECTED_SIZE:
        print("正在从 Mendeley Data 官方文件地址下载，支持 .part 断点续传。")
        download(archive)
    actual_hash = sha256(archive)
    if actual_hash != EXPECTED_SHA256:
        raise SystemExit(f"SHA-256 校验失败：{actual_hash}")
    print("SHA-256 verified.")
    extract(archive, output)


if __name__ == "__main__":
    main()
