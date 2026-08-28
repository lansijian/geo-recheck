from __future__ import annotations

import argparse
import csv
import json
import statistics
import sys
import time
from pathlib import Path

import numpy as np


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.cv.pipeline import measure_image  # noqa: E402
from app.cv.image_io import read_image  # noqa: E402


def percentile(values: list[float], q: float) -> float | None:
    return float(np.percentile(values, q)) if values else None


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--benchmark", type=Path, default=ROOT / "data" / "benchmark")
    parser.add_argument("--output", type=Path, default=ROOT / "artifacts" / "validation")
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)

    truth = json.loads((args.benchmark / "ground_truth.json").read_text(encoding="utf-8"))
    profile = json.loads(
        (ROOT / "data" / "camera_profiles" / "default_camera.json").read_text(encoding="utf-8")
    )
    camera_matrix = np.asarray(profile["camera_matrix"], dtype=np.float64)
    distortion = np.asarray(profile["distortion_coefficients"], dtype=np.float64)

    rows: list[dict] = []
    for index, case in enumerate(truth["cases"]):
        image_path = args.benchmark / case["image"]
        image = read_image(image_path)
        if image is None:
            raise RuntimeError(f"Cannot read benchmark image: {image_path}")
        started = time.perf_counter()
        evidence_dir = args.output / "evidence" / case["name"] if index in (0, 15, 22) else None
        result = measure_image(image, camera_matrix, distortion, evidence_dir)
        elapsed_ms = (time.perf_counter() - started) * 1000
        error = (
            abs(result.distance_mm - case["ground_truth_mm"])
            if result.distance_mm is not None
            else None
        )
        rows.append(
            {
                "case": case["name"],
                "ground_truth_mm": case["ground_truth_mm"],
                "estimated_mm": result.distance_mm,
                "absolute_error_mm": error,
                "yaw_deg": case["yaw_deg"],
                "pitch_deg": case["pitch_deg"],
                "blur_sigma": case["blur_sigma"],
                "occlusion": case["occlusion"],
                "expected_gate": case["expected_gate"],
                "quality_gate": result.status,
                "quality_score": result.quality.score,
                "marker_count": len(result.marker_ids),
                "processing_ms": round(elapsed_ms, 2),
                "gate_reasons": " | ".join(result.quality.reasons),
            }
        )
        print(
            f"{case['name']}: {result.status}, estimated={result.distance_mm}, error={error}, {elapsed_ms:.1f} ms"
        )

    csv_path = args.output / "results.csv"
    with csv_path.open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)

    accepted_errors = [row["absolute_error_mm"] for row in rows if row["absolute_error_mm"] is not None]
    gate_matches = sum(row["expected_gate"] == row["quality_gate"] for row in rows)
    processing = [float(row["processing_ms"]) for row in rows]
    summary = {
        "total_cases": len(rows),
        "accepted_cases": len(accepted_errors),
        "rejected_cases": len(rows) - len(accepted_errors),
        "gate_expectation_matches": gate_matches,
        "mae_mm": statistics.fmean(accepted_errors) if accepted_errors else None,
        "median_error_mm": statistics.median(accepted_errors) if accepted_errors else None,
        "p95_error_mm": percentile(accepted_errors, 95),
        "max_error_mm": max(accepted_errors) if accepted_errors else None,
        "rejection_rate": (len(rows) - len(accepted_errors)) / len(rows),
        "median_processing_ms": statistics.median(processing),
        "p95_processing_ms": percentile(processing, 95),
        "claim_boundary": "Synthetic controlled benchmark only; no field accuracy claim.",
    }
    summary_path = args.output / "summary.json"
    summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
