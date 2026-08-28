from __future__ import annotations

import csv
import json
import os
import statistics
import sys
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.services.stepfun_observer import StepFunReviewError, run_field_review  # noqa: E402


def main() -> None:
    if os.getenv("RUN_STEPFUN_LIVE_TEST") != "1":
        raise SystemExit("LIVE VALIDATION SKIPPED: set RUN_STEPFUN_LIVE_TEST=1 explicitly.")
    case_root = ROOT / "data" / "demo_cases"
    output_root = ROOT / "artifacts" / "ai_validation_v04"
    output_root.mkdir(parents=True, exist_ok=True)
    rows: list[dict[str, object]] = []
    for case_dir in sorted(case_root.glob("case_*")):
        metadata = json.loads((case_dir / "metadata.json").read_text(encoding="utf-8"))
        expected = set(metadata["expected_ai_observations"])
        for run in range(1, 4):
            started = time.perf_counter()
            try:
                review, latency_ms, attempts = run_field_review(
                    case_dir / "context.jpg",
                    case_dir / "previous_close.jpg",
                    case_dir / "current_close.jpg",
                    {
                        "crack_id": "CRACK-W01",
                        "opening_delta_mm": metadata["expected_geometry"]["opening_delta_mm"],
                    },
                )
                observed = {item.type for item in review.observations if item.type != "none"}
                rows.append(
                    {
                        "case_id": metadata["case_id"],
                        "run": run,
                        "status": "completed",
                        "parse_success": True,
                        "expected_finding_hit": expected.issubset(observed),
                        "unsupported_finding_count": len(observed - expected),
                        "latency_ms": latency_ms,
                        "attempts": attempts,
                        "error_code": "",
                    }
                )
            except StepFunReviewError as error:
                rows.append(
                    {
                        "case_id": metadata["case_id"],
                        "run": run,
                        "status": "failed",
                        "parse_success": False,
                        "expected_finding_hit": "",
                        "unsupported_finding_count": "",
                        "latency_ms": round((time.perf_counter() - started) * 1000),
                        "attempts": 0,
                        "error_code": error.code,
                    }
                )

    fields = list(rows[0])
    with (output_root / "results.csv").open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)
    completed = [row for row in rows if row["status"] == "completed"]
    summary = {
        "cases": 5,
        "runs_per_case": 3,
        "total_runs": len(rows),
        "completed_runs": len(completed),
        "json_parse_success_rate": len(completed) / len(rows),
        "expected_finding_hit_rate": (
            sum(bool(row["expected_finding_hit"]) for row in completed) / len(completed)
            if completed
            else None
        ),
        "unsupported_finding_rate": (
            sum(int(row["unsupported_finding_count"]) > 0 for row in completed) / len(completed)
            if completed
            else None
        ),
        "median_latency_ms": statistics.median(int(row["latency_ms"]) for row in rows),
        "failure_codes": {
            code: sum(row["error_code"] == code for row in rows)
            for code in sorted({str(row["error_code"]) for row in rows if row["error_code"]})
        },
        "note": "Live results only. Failed calls are not replaced with fixtures.",
    }
    (output_root / "summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    if not completed:
        raise SystemExit(2)


if __name__ == "__main__":
    main()
