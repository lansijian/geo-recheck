from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.cv.image_io import write_image  # noqa: E402
from app.cv.synthetic import default_cases, render_case  # noqa: E402


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=ROOT / "data" / "benchmark")
    parser.add_argument(
        "--dataset", type=Path, default=ROOT / "data" / "datasets" / "crackforest"
    )
    args = parser.parse_args()
    image_dir = args.output / "images"
    image_dir.mkdir(parents=True, exist_ok=True)

    records: list[dict] = []
    for index, case in enumerate(default_cases()):
        image, truth = render_case(case, dataset_root=args.dataset, seed=7 + index)
        filename = f"{index:03d}_{case.name}.png"
        write_image(image_dir / filename, image)
        records.append({**truth, "image": f"images/{filename}"})
        print(f"generated {filename} ({truth['background_source']})")

    payload = {
        "description": "Synthetic two-board metric benchmark. CrackForest is texture only when available.",
        "camera_profile": "data/camera_profiles/default_camera.json",
        "cases": records,
    }
    (args.output / "ground_truth.json").write_text(
        json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(f"wrote {args.output / 'ground_truth.json'}")


if __name__ == "__main__":
    main()
