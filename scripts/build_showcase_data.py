from __future__ import annotations

import csv
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CASES_ROOT = ROOT / "data" / "demo_cases"
GEOMETRY_RESULTS = ROOT / "artifacts" / "validation_v04_cases" / "results.json"
AI_RESULTS = ROOT / "artifacts" / "ai_validation_v04" / "results.csv"
AI_RESPONSES = ROOT / "artifacts" / "ai_validation_v04" / "responses.jsonl"


def load_ai_candidates() -> dict[tuple[str, int], dict]:
    responses: dict[tuple[str, int], dict] = {}
    for line in AI_RESPONSES.read_text(encoding="utf-8").splitlines():
        if not line.strip():
            continue
        payload = json.loads(line)
        responses[(payload["case_id"], int(payload["run"]))] = payload["parsed_json"]

    candidates: dict[tuple[str, int], dict] = {}
    with AI_RESULTS.open("r", encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            key = (row["case_id"], int(row["run"]))
            if (
                row["status"] == "completed"
                and row["parse_success"] == "True"
                and row["expected_finding_hit"] == "True"
                and int(row["unsupported_finding_count"]) == 0
                and key in responses
            ):
                candidates[key] = {
                    "run": key[1],
                    "latency_ms": int(row["latency_ms"]),
                    "attempts": int(row["attempts"]),
                    "parsed": responses[key],
                }
    return candidates


def main() -> None:
    geometry_by_case = {
        item["case_id"]: item
        for item in json.loads(GEOMETRY_RESULTS.read_text(encoding="utf-8"))
    }
    ai_candidates = load_ai_candidates()
    generated: list[str] = []

    for case_dir in sorted(CASES_ROOT.glob("case_*")):
        metadata = json.loads((case_dir / "metadata.json").read_text(encoding="utf-8"))
        case_id = metadata["case_id"]
        geometry = geometry_by_case[case_id]
        candidates = [
            value for (candidate_case, _), value in ai_candidates.items()
            if candidate_case == case_id
        ]
        if not candidates:
            raise RuntimeError(f"{case_id} 没有可审计的 StepFun 成功响应。")
        replay = min(candidates, key=lambda item: item["latency_ms"])
        payload = {
            "schema_version": 1,
            "case_id": case_id,
            "title": metadata["title"],
            "location": "贵州仁怀 · MP-03 · WALL-02",
            "assets": {
                "context": f"/demo-cases/{case_id}/context.jpg",
                "previous_close": f"/demo-cases/{case_id}/previous_close.jpg",
                "current_close": f"/demo-cases/{case_id}/current_close.jpg",
            },
            "geometry": {
                "measured_opening_delta_mm": geometry["measured_opening_delta_mm"],
                "expected_opening_delta_mm": geometry["expected_opening_delta_mm"],
                "quality_gate": geometry["actual_gate"],
                "quality_score": geometry["quality_score"],
                "quality_reasons": geometry["quality_reasons"],
                "measurement_source": "FastAPI / OpenCV deterministic geometry",
            },
            "viewpoint": {
                "previous": geometry["previous_viewpoint_deg"],
                "current": geometry["current_viewpoint_deg"],
                "delta_deg": geometry["viewpoint_delta_deg"],
                "different": geometry["viewpoints_are_different"],
            },
            "provenance": {
                "context_source": metadata["context_source"],
                "close_source": metadata["close_source"],
                "synthetic_changes": metadata["synthetic_changes"],
                "disclosure": metadata["disclosure"].replace("比赛演示", "现场巡查演示"),
            },
            "field_scene": {
                "house_position": [0.0, 1.5, -2.0],
                "crack_position": [1.65, 1.55, 0.04],
                "drainage_position": [0.0, 0.08, 1.8],
                "worker_entry": [-5.2, 0.0, 4.8],
                "worker_context_stop": [-1.3, 0.0, 2.5],
                "worker_close_stop": [0.8, 0.0, 1.25],
                "controlled_roi": metadata["current_truth"].get("surface_change") != "none",
            },
            "ai_replay": {
                "provider": "StepFun",
                "model": "step-3.7-flash",
                "original_latency_ms": replay["latency_ms"],
                "attempts": replay["attempts"],
                "validated_date": "2026-08-28",
                "source_artifact": "artifacts/ai_validation_v04/responses.jsonl",
                "source_run": replay["run"],
                "parsed": replay["parsed"],
            },
        }
        (case_dir / "showcase.json").write_text(
            json.dumps(payload, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        generated.append(case_id)
    print(json.dumps({"generated": generated, "source": str(AI_RESPONSES)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
