from __future__ import annotations

import os
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
DATA_ROOT = PROJECT_ROOT / "data"
SEED_ROOT = DATA_ROOT / "seed"
EVIDENCE_ROOT = DATA_ROOT / "images"
BENCHMARK_ROOT = DATA_ROOT / "benchmark"
DATABASE_PATH = DATA_ROOT / "geo_recheck.db"
CAMERA_PROFILE_PATH = DATA_ROOT / "camera_profiles" / "default_camera.json"
DEMO_LOCATION_MODE = os.getenv("DEMO_LOCATION_MODE", "true").lower() == "true"

