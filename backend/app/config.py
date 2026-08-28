from __future__ import annotations

import os
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]


def _load_local_env() -> None:
    for filename in (".env.local", ".env"):
        path = PROJECT_ROOT / filename
        if not path.exists():
            continue
        for line in path.read_text(encoding="utf-8-sig").splitlines():
            if not line or line.lstrip().startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            os.environ.setdefault(key.strip(), value.strip())


_load_local_env()
DATA_ROOT = PROJECT_ROOT / "data"
SEED_ROOT = DATA_ROOT / "seed"
EVIDENCE_ROOT = DATA_ROOT / "images"
BENCHMARK_ROOT = DATA_ROOT / "benchmark"
DATABASE_PATH = DATA_ROOT / "geo_recheck.db"
CAMERA_PROFILE_PATH = DATA_ROOT / "camera_profiles" / "default_camera.json"
DEMO_LOCATION_MODE = os.getenv("DEMO_LOCATION_MODE", "true").lower() == "true"
DEMO_CASES_ROOT = DATA_ROOT / "demo_cases"
STEPFUN_API_KEY = os.getenv("STEPFUN_API_KEY", "").strip()
STEPFUN_BASE_URL = os.getenv(
    "STEPFUN_BASE_URL", "https://api.stepfun.com/step_plan/v1"
).rstrip("/")
STEPFUN_MODEL = os.getenv("STEPFUN_MODEL", "step-3.7-flash").strip()
STEPFUN_TIMEOUT_SECONDS = float(os.getenv("STEPFUN_TIMEOUT_SECONDS", "180"))
STEPFUN_AI_REVIEW_ENABLED = os.getenv("STEPFUN_AI_REVIEW_ENABLED", "false").lower() == "true"
STEPFUN_RESOLVE_IP = os.getenv("STEPFUN_RESOLVE_IP", "").strip() or None
