from __future__ import annotations

import argparse
import csv
import json
import os
import statistics
import sys
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend"))

from app.schemas.ai_review import AIFieldReview  # noqa: E402
from app.services.stepfun_observer import StepFunReviewError, run_field_review  # noqa: E402


POSITIVE_STATES = {"new", "worsened", "uncertain"}


def score_review(expected: set[str], review: AIFieldReview) -> tuple[bool, set[str]]:
    expected_positive = expected - {"none"}
    if review.coverage_complete is False:
        observed = (
            {"coverage_missing"}
            if any(item.type == "coverage_missing" for item in review.observations)
            else set()
        )
    else:
        observed = {
            item.type
            for item in review.observations
            if item.type != "none" and item.state in POSITIVE_STATES
        }
    expected_hit = not observed if expected == {"none"} else expected_positive.issubset(observed)
    return expected_hit, observed


def rescore_existing(case_root: Path, output_root: Path) -> None:
    expected_by_case = {
        metadata["case_id"]: set(metadata["expected_ai_observations"])
        for metadata in (
            json.loads(path.read_text(encoding="utf-8"))
            for path in sorted(case_root.glob("case_*/metadata.json"))
        )
    }
    responses = [
        json.loads(line)
        for line in (output_root / "responses.jsonl").read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    response_by_run = {
        (item["case_id"], str(item["run"])): AIFieldReview.model_validate(item["parsed_json"])
        for item in responses
    }
    with (output_root / "results.csv").open("r", encoding="utf-8-sig", newline="") as handle:
        rows = list(csv.DictReader(handle))
    for row in rows:
        if row["status"] != "completed":
            continue
        review = response_by_run[(row["case_id"], row["run"])]
        expected = expected_by_case[row["case_id"]]
        expected_hit, observed = score_review(expected, review)
        row["expected_finding_hit"] = expected_hit
        row["unsupported_finding_count"] = len(observed - (expected - {"none"}))
        row["observed_findings"] = json.dumps(sorted(observed), ensure_ascii=False)
    write_outputs(output_root, rows, responses, max(int(row["run"]) for row in rows))


def write_outputs(
    output_root: Path,
    rows: list[dict[str, object]],
    responses: list[dict[str, object]],
    runs_per_case: int,
) -> None:
    fields = list(rows[0])
    with (output_root / "results.csv").open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)
    with (output_root / "responses.jsonl").open("w", encoding="utf-8", newline="\n") as handle:
        for response in responses:
            handle.write(json.dumps(response, ensure_ascii=False) + "\n")
    completed = [row for row in rows if row["status"] == "completed"]
    summary = {
        "cases": 5,
        "runs_per_case": runs_per_case,
        "total_runs": len(rows),
        "completed_runs": len(completed),
        "json_parse_success_rate": len(completed) / len(rows),
        "expected_finding_hit_rate": (
            sum(str(row["expected_finding_hit"]).lower() == "true" for row in completed)
            / len(completed)
            if completed
            else None
        ),
        "unsupported_finding_rate": (
            sum(int(row["unsupported_finding_count"]) > 0 for row in completed) / len(completed)
            if completed
            else None
        ),
        "unsupported_finding_count": sum(
            int(row["unsupported_finding_count"]) for row in completed
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


def main() -> None:
    parser = argparse.ArgumentParser(description="Run live StepFun validation cases.")
    parser.add_argument("--runs-per-case", type=int, default=3)
    parser.add_argument("--output-dir", default="artifacts/ai_validation_v04")
    parser.add_argument("--rescore", action="store_true")
    args = parser.parse_args()
    if args.runs_per_case < 1:
        raise SystemExit("--runs-per-case must be at least 1")
    case_root = ROOT / "data" / "demo_cases"
    output_root = ROOT / args.output_dir
    if args.rescore:
        rescore_existing(case_root, output_root)
        return
    if os.getenv("RUN_STEPFUN_LIVE_TEST") != "1":
        raise SystemExit("LIVE VALIDATION SKIPPED: set RUN_STEPFUN_LIVE_TEST=1 explicitly.")
    output_root.mkdir(parents=True, exist_ok=True)
    rows: list[dict[str, object]] = []
    responses: list[dict[str, object]] = []
    for case_dir in sorted(case_root.glob("case_*")):
        metadata = json.loads((case_dir / "metadata.json").read_text(encoding="utf-8"))
        expected = set(metadata["expected_ai_observations"])
        for run in range(1, args.runs_per_case + 1):
            started = time.perf_counter()
            try:
                review, latency_ms, attempts = run_field_review(
                    case_dir / "context.jpg",
                    case_dir / "previous_close.jpg",
                    case_dir / "current_close.jpg",
                    {
                        "crack_id": "CRACK-W01",
                        "opening_delta_mm": (
                            metadata["expected_geometry"]["opening_delta_mm"]
                            if metadata["expected_geometry"]["gate"] == "accepted"
                            else None
                        ),
                        "measurement_status": metadata["expected_geometry"]["gate"],
                    },
                )
                expected_hit, observed = score_review(expected, review)
                rows.append(
                    {
                        "case_id": metadata["case_id"],
                        "run": run,
                        "status": "completed",
                        "parse_success": True,
                        "expected_finding_hit": expected_hit,
                        "unsupported_finding_count": len(observed - (expected - {"none"})),
                        "observed_findings": json.dumps(sorted(observed), ensure_ascii=False),
                        "latency_ms": latency_ms,
                        "attempts": attempts,
                        "error_code": "",
                    }
                )
                responses.append(
                    {
                        "case_id": metadata["case_id"],
                        "run": run,
                        "parsed_json": review.model_dump(mode="json"),
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
                        "observed_findings": "",
                        "latency_ms": round((time.perf_counter() - started) * 1000),
                        "attempts": 0,
                        "error_code": error.code,
                    }
                )
            latest = rows[-1]
            print(
                f"{metadata['case_id']} run {run}/{args.runs_per_case}: {latest['status']} "
                f"({latest['latency_ms']} ms)",
                flush=True,
            )

    write_outputs(output_root, rows, responses, args.runs_per_case)


if __name__ == "__main__":
    main()
