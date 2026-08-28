from __future__ import annotations

import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.cv.image_io import write_image  # noqa: E402
from app.cv.synthetic import SyntheticCase, render_case  # noqa: E402


CASES = [
    SyntheticCase("baseline_front", 0.0, 0.0, 0.0),
    SyntheticCase("current_open_2mm_front", 2.0, 0.0, 0.0),
    SyntheticCase("current_open_5mm_yaw20", 5.0, 20.0, 10.0, 0.5),
    SyntheticCase("current_open_5mm_yaw30", 5.0, 30.0, 12.0, 0.5),
    SyntheticCase("current_blur_reject", 5.0, 10.0, 5.0, 0.5, blur_sigma=7.0, noise_sigma=0.0, expected_gate="rejected"),
    SyntheticCase("current_occlusion_reject", 5.0, 10.0, 5.0, 0.5, occlusion="right_two", expected_gate="rejected"),
]


def main() -> None:
    manifest = ROOT / "data" / "demo_scene_source_manifest.json"
    if not manifest.exists():
        raise SystemExit("缺少 data/demo_scene_source_manifest.json，请先运行 select_wall_scenes.py。")
    output = ROOT / "data" / "wall_demo"
    image_root = output / "images"
    image_root.mkdir(parents=True, exist_ok=True)
    records = []
    for index, case in enumerate(CASES):
        image, truth = render_case(case, dataset_root=ROOT / "data", seed=300 + index)
        filename = f"{case.name}.png"
        write_image(image_root / filename, image)
        records.append({**truth, "image": f"images/{filename}"})
        print(f"generated {filename}: opening={case.delta_mm:+.1f} mm, source={truth['background_source']}")
    (output / "ground_truth.json").write_text(
        json.dumps(
            {
                "description": "Coherent single-wall-plane controlled simulation; millimetre scale belongs to the simulator, not the source dataset.",
                "data_provenance": "public CC BY building crack image + deterministic controlled deformation",
                "cases": records,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
