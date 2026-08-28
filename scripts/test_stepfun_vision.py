from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_IMAGES = [
    ROOT / "data" / "demo_cases" / "case_03_seepage" / "context.jpg",
    ROOT / "data" / "demo_cases" / "case_03_seepage" / "previous_close.jpg",
    ROOT / "data" / "demo_cases" / "case_03_seepage" / "current_close.jpg",
]


def load_local_env() -> None:
    for filename in (".env.local", ".env"):
        path = ROOT / filename
        if not path.exists():
            continue
        for line in path.read_text(encoding="utf-8-sig").splitlines():
            if not line or line.lstrip().startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip())


def main() -> None:
    parser = argparse.ArgumentParser(description="StepFun 三图视觉与 JSON 契约真实 smoke test。")
    parser.add_argument("images", nargs="*", type=Path, default=DEFAULT_IMAGES)
    parser.add_argument("--resolve-ip", help="仅在本机 DNS 故障时临时解析 api.stepfun.com。")
    args = parser.parse_args()
    load_local_env()
    if args.resolve_ip:
        os.environ["STEPFUN_RESOLVE_IP"] = args.resolve_ip
    if not os.getenv("STEPFUN_API_KEY", "").strip():
        raise SystemExit("STEPFUN LIVE TEST SKIPPED: No API key configured.")
    images = [path.resolve() for path in args.images]
    if len(images) != 3 or any(not path.exists() for path in images):
        raise SystemExit("smoke test 必须提供存在的 3 张图片。")

    sys.path.insert(0, str(ROOT / "backend"))
    from app import config
    from app.services.stepfun_observer import StepFunReviewError, run_field_review

    output = ROOT / "artifacts" / "stepfun_v04" / "live_smoke.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    started = time.perf_counter()
    try:
        review, latency_ms, attempts = run_field_review(
            images[0],
            images[1],
            images[2],
            {"crack_id": "CRACK-W01", "opening_delta_mm": 4.8},
        )
        result = {
            "status": "passed",
            "provider": "stepfun",
            "model": config.STEPFUN_MODEL,
            "image_count": 3,
            "latency_ms": latency_ms,
            "attempts": attempts,
            "parsed_json": review.model_dump(),
        }
    except StepFunReviewError as error:
        result = {
            "status": "failed",
            "provider": "stepfun",
            "model": config.STEPFUN_MODEL,
            "image_count": 3,
            "latency_ms": round((time.perf_counter() - started) * 1000),
            "error_code": error.code,
            "message": f"{error} 未使用模拟结果代替。",
        }
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    if result["status"] != "passed":
        raise SystemExit(2)


if __name__ == "__main__":
    main()
