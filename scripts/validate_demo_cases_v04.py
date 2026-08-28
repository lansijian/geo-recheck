from __future__ import annotations

import json
import sys
from pathlib import Path

import cv2
import numpy as np


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.cv.pipeline import measure_image  # noqa: E402


def main() -> None:
    profile = json.loads((ROOT / "data" / "camera_profiles" / "default_camera.json").read_text(encoding="utf-8"))
    matrix_base = np.asarray(profile["camera_matrix"], dtype=np.float64)
    distortion = np.asarray(profile["distortion_coefficients"], dtype=np.float64)
    calibration_width, calibration_height = profile["calibration_image_size"]
    output_root = ROOT / "artifacts" / "validation_v04_cases"
    results: list[dict] = []
    for case_dir in sorted((ROOT / "data" / "demo_cases").glob("case_*")):
        metadata = json.loads((case_dir / "metadata.json").read_text(encoding="utf-8"))
        measured = []
        for name in ("previous_close", "current_close"):
            image_path = case_dir / f"{name}.jpg"
            image = cv2.imdecode(np.frombuffer(image_path.read_bytes(), np.uint8), cv2.IMREAD_COLOR)
            if image is None:
                raise RuntimeError(f"无法读取 {case_dir.name}/{name}.jpg")
            height, width = image.shape[:2]
            matrix = matrix_base.copy()
            matrix[0, 0] *= width / calibration_width
            matrix[0, 2] *= width / calibration_width
            matrix[1, 1] *= height / calibration_height
            matrix[1, 2] *= height / calibration_height
            measured.append(measure_image(image, matrix, distortion, output_root / "evidence" / case_dir.name / name))
        previous, current = measured
        previous_view = metadata["previous_truth"]
        current_view = metadata["current_truth"]
        viewpoint_delta_deg = float(
            np.hypot(
                current_view["yaw_deg"] - previous_view["yaw_deg"],
                current_view["pitch_deg"] - previous_view["pitch_deg"],
            )
        )
        delta = (
            current.planar_position_mm[0] - previous.planar_position_mm[0]
            if current.planar_position_mm is not None and previous.planar_position_mm is not None
            else None
        )
        actual_gate = "accepted" if current.status == "accepted" else "rejected"
        expected_delta = float(metadata["expected_geometry"]["opening_delta_mm"])
        results.append(
            {
                "case_id": metadata["case_id"],
                "expected_gate": metadata["expected_geometry"]["gate"],
                "actual_gate": actual_gate,
                "expected_opening_delta_mm": expected_delta,
                "measured_opening_delta_mm": round(delta, 3) if delta is not None else None,
                "absolute_error_mm": round(abs(delta - expected_delta), 3) if delta is not None else None,
                "quality_score": current.quality.score,
                "quality_reasons": current.quality.reasons,
                "previous_viewpoint_deg": {
                    "yaw": previous_view["yaw_deg"],
                    "pitch": previous_view["pitch_deg"],
                },
                "current_viewpoint_deg": {
                    "yaw": current_view["yaw_deg"],
                    "pitch": current_view["pitch_deg"],
                },
                "viewpoint_delta_deg": round(viewpoint_delta_deg, 3),
                "viewpoints_are_different": viewpoint_delta_deg >= 8.0,
            }
        )
    summary = {
        "case_count": len(results),
        "gate_matches": sum(row["expected_gate"] == row["actual_gate"] for row in results),
        "different_viewpoint_cases": sum(row["viewpoints_are_different"] for row in results),
        "accepted_case_max_absolute_error_mm": max(
            row["absolute_error_mm"]
            for row in results
            if row["actual_gate"] == "accepted" and row["absolute_error_mm"] is not None
        ),
        "disclaimer": "Controlled synthetic case validation only; not field accuracy.",
    }
    output_root.mkdir(parents=True, exist_ok=True)
    (output_root / "results.json").write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    (output_root / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({"summary": summary, "cases": results}, ensure_ascii=False, indent=2))
    if summary["gate_matches"] != len(results):
        raise SystemExit(2)
    if summary["different_viewpoint_cases"] != len(results):
        raise SystemExit(3)


if __name__ == "__main__":
    main()
