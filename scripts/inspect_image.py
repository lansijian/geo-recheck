from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.cv.pipeline import measure_image  # noqa: E402
from app.cv.image_io import read_image  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser(description="Detect marker IDs, pose and rectified boards.")
    parser.add_argument("image", type=Path)
    parser.add_argument("--output", type=Path, default=ROOT / "artifacts" / "inspect")
    args = parser.parse_args()
    profile = json.loads(
        (ROOT / "data" / "camera_profiles" / "default_camera.json").read_text(encoding="utf-8")
    )
    image = read_image(args.image)
    if image is None:
        raise SystemExit(f"Cannot read image: {args.image}")
    result = measure_image(
        image,
        np.asarray(profile["camera_matrix"], dtype=np.float64),
        np.asarray(profile["distortion_coefficients"], dtype=np.float64),
        args.output,
    )
    print(json.dumps(result.as_dict(), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
