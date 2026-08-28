from __future__ import annotations

import csv
import json
import statistics
import sys
import time
from pathlib import Path

import numpy as np

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.cv.image_io import read_image  # noqa: E402
from app.cv.pipeline import measure_image  # noqa: E402
from app.cv.synthetic import (  # noqa: E402
    CAMERA_MATRIX,
    DISTORTION,
    SyntheticCase,
    default_cases,
    render_case,
)


def percentile(values: list[float], q: float) -> float | None:
    return float(np.percentile(values, q)) if values else None


def method_summary(rows: list[dict], method: str) -> dict:
    # Method accuracy is evaluated only where the quality gate is expected to
    # accept. Deliberate blur/occlusion/angle rejections are counted separately.
    method_rows = [
        row for row in rows
        if row["method"] == method and row["expected_gate"] == "accepted"
    ]
    errors = [float(row["absolute_error_mm"]) for row in method_rows if row["absolute_error_mm"] != ""]
    processing = [float(row["processing_ms"]) for row in method_rows]
    return {
        "method": method,
        "total_cases": len(method_rows),
        "successful_cases": len(errors),
        "failure_rate": round(1.0 - len(errors) / len(method_rows), 6),
        "mae_opening_mm": round(statistics.fmean(errors), 6) if errors else None,
        "median_error_mm": round(statistics.median(errors), 6) if errors else None,
        "p95_error_mm": round(percentile(errors, 95), 6) if errors else None,
        "variance_mm2": round(statistics.pvariance(errors), 6) if len(errors) > 1 else 0.0 if errors else None,
        "median_processing_ms": round(statistics.median(processing), 3),
        "p95_processing_ms": round(percentile(processing, 95), 3),
    }


def main() -> None:
    output = ROOT / "artifacts" / "validation_v03"
    evidence = output / "evidence"
    output.mkdir(parents=True, exist_ok=True)
    rows: list[dict] = []
    baseline_image, _ = render_case(
        SyntheticCase("validation_baseline_front", 0.0, 0.0, 0.0, noise_sigma=0.0),
        dataset_root=ROOT / "data",
        seed=699,
    )
    baseline_result = measure_image(
        baseline_image,
        CAMERA_MATRIX,
        DISTORTION,
        evidence / "validation_baseline_front",
    )
    if baseline_result.status != "accepted" or not baseline_result.planar_position_mm or not baseline_result.dual_pnp_position_mm:
        raise RuntimeError(f"基线图未通过测量：{baseline_result.reasons}")
    baseline_positions = {
        "planar_rectified_2d": baseline_result.planar_position_mm[0],
        "dual_pnp_3d": baseline_result.dual_pnp_position_mm[0],
    }
    for index, case in enumerate(default_cases()):
        image, truth = render_case(case, dataset_root=ROOT / "data", seed=700 + index)
        started = time.perf_counter()
        result = measure_image(image, CAMERA_MATRIX, DISTORTION, evidence / case.name if index in {0, 38, 59, 63, 64} else None)
        elapsed_ms = (time.perf_counter() - started) * 1000
        estimates = {
            "planar_rectified_2d": result.planar_position_mm[0] - baseline_positions["planar_rectified_2d"] if result.planar_position_mm else None,
            "dual_pnp_3d": result.dual_pnp_position_mm[0] - baseline_positions["dual_pnp_3d"] if result.dual_pnp_position_mm else None,
        }
        for method, estimate in estimates.items():
            error = abs(float(estimate) - case.delta_mm) if estimate is not None else None
            rows.append(
                {
                    "case": case.name,
                    "method": method,
                    "ground_truth_opening_mm": case.delta_mm,
                    "estimated_opening_mm": round(float(estimate), 6) if estimate is not None else "",
                    "absolute_error_mm": round(error, 6) if error is not None else "",
                    "ground_truth_shear_mm": case.shear_delta_mm,
                    "yaw_deg": case.yaw_deg,
                    "pitch_deg": case.pitch_deg,
                    "brightness": case.brightness,
                    "blur_sigma": case.blur_sigma,
                    "occlusion": case.occlusion,
                    "expected_gate": case.expected_gate,
                    "actual_gate": result.status,
                    "marker_count": len(result.marker_ids),
                    "processing_ms": round(elapsed_ms, 3),
                }
            )
        print(f"{case.name}: gate={result.status} planar={estimates['planar_rectified_2d']} pnp={estimates['dual_pnp_3d']}")
    with (output / "results.csv").open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    comparison = [method_summary(rows, method) for method in ("planar_rectified_2d", "dual_pnp_3d")]
    gate_rows = [row for row in rows if row["method"] == "planar_rectified_2d"]
    gate_correct = sum(row["expected_gate"] == row["actual_gate"] for row in gate_rows)
    with (output / "method_comparison.csv").open("w", newline="", encoding="utf-8-sig") as handle:
        writer = csv.DictWriter(handle, fieldnames=list(comparison[0]))
        writer.writeheader()
        writer.writerows(comparison)
    summary = {
        "methods": comparison,
        "baseline_positions_mm": {key: round(value, 6) for key, value in baseline_positions.items()},
        "quality_gate": {
            "correct_cases": gate_correct,
            "total_cases": len(gate_rows),
            "accuracy": round(gate_correct / len(gate_rows), 6),
        },
        "selected_for_golden_path": min(
            (item for item in comparison if item["mae_opening_mm"] is not None),
            key=lambda item: (item["failure_rate"], item["mae_opening_mm"], item["p95_error_mm"]),
        )["method"],
        "detector": "opencv_aruco_apriltag_36h11",
        "native_apriltag_benchmark": "not_run_p2",
        "claim_boundary": "Controlled synthetic wall-plane benchmark only; not field accuracy evidence.",
        "data_provenance": "Özgenel CC BY 4.0 source texture; deformation and millimetre scale are synthetic.",
    }
    (output / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
