from __future__ import annotations

import json
import logging
import math
import statistics
import uuid
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from sqlalchemy import desc, select
from sqlalchemy.orm import Session

import cv2
import numpy as np

from app.config import BENCHMARK_ROOT, CAMERA_PROFILE_PATH, EVIDENCE_ROOT, PROJECT_ROOT
from app.cv.calibration import calibrate_camera
from app.db.session import Base, SessionLocal, engine, get_db, migrate_schema
from app.models import BenchmarkTrial, Inspection, MonitorPoint
from app.services.inspection import (
    create_measurement,
    inspection_to_dict,
    seed_baseline,
)
from app.services.registry import point_to_dict, seed_points


logger = logging.getLogger("uvicorn.error")


@asynccontextmanager
async def lifespan(_: FastAPI):
    EVIDENCE_ROOT.mkdir(parents=True, exist_ok=True)
    Base.metadata.create_all(bind=engine)
    migrate_schema()
    with SessionLocal() as session:
        seed_points(session)
        seed_baseline(session)
    yield


app = FastAPI(
    title="地灾复测 API",
    version="0.3.0",
    description="贵州基层墙体裂缝相对复测与自动留痕电脑 Demo。不是预测、预警或业务管理平台。",
    lifespan=lifespan,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/evidence", StaticFiles(directory=EVIDENCE_ROOT, check_dir=False), name="evidence")
app.mount("/media", StaticFiles(directory=EVIDENCE_ROOT, check_dir=False), name="media")
app.mount(
    "/demo-assets",
    StaticFiles(directory=BENCHMARK_ROOT / "images", check_dir=False),
    name="demo-assets",
)
app.mount(
    "/wall-assets",
    StaticFiles(directory=PROJECT_ROOT / "data" / "wall_demo" / "images", check_dir=False),
    name="wall-assets",
)
app.mount(
    "/calibration-assets",
    StaticFiles(directory=PROJECT_ROOT / "artifacts" / "calibration", check_dir=False),
    name="calibration-assets",
)


class ConfirmationPayload(BaseModel):
    observer_name: str = Field(min_length=1, max_length=100)
    remark: str | None = Field(default=None, max_length=1000)
    visible_change_note: str | None = Field(default=None, max_length=1000)


class BenchmarkTrialPayload(BaseModel):
    trial_id: str | None = None
    mode: str
    duration_ms: int = Field(gt=0, le=3_600_000)
    errors: int = Field(default=0, ge=0)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "service": "geo-recheck", "version": "0.3.0"}


@app.get("/api/calibration/profile")
def calibration_profile() -> dict:
    return json.loads(CAMERA_PROFILE_PATH.read_text(encoding="utf-8"))


@app.post("/api/calibration")
async def run_calibration(images: list[UploadFile] = File(...)) -> dict:
    decoded: list[np.ndarray] = []
    for upload in images:
        raw = await upload.read()
        image = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
        if image is not None:
            decoded.append(image)
    try:
        result = calibrate_camera(decoded)
    except ValueError as error:
        raise HTTPException(422, str(error)) from error
    if result.rms_reprojection_error_px > 2.0:
        raise HTTPException(
            422,
            f"标定重投影误差 {result.rms_reprojection_error_px:.3f} px 过高，未覆盖相机配置。请重新采集。",
        )
    profile = {
        "name": "charuco_calibrated_camera",
        "is_demo_profile": False,
        "calibration_image_size": list(result.image_size),
        "camera_matrix": result.camera_matrix.tolist(),
        "distortion_coefficients": result.distortion.tolist(),
        "rms_reprojection_error_px": result.rms_reprojection_error_px,
        "accepted_images": result.accepted_images,
        "total_images": result.total_images,
    }
    CAMERA_PROFILE_PATH.write_text(json.dumps(profile, ensure_ascii=False, indent=2), encoding="utf-8")
    return profile


@app.get("/api/points")
def list_points(session: Session = Depends(get_db)) -> list[dict]:
    points = session.scalars(select(MonitorPoint)).all()
    response: list[dict] = []
    for point in points:
        last = session.scalar(
            select(Inspection)
            .where(Inspection.monitor_point_id == point.monitor_point_id)
            .order_by(desc(Inspection.capture_time))
        )
        response.append(
            {
                **point_to_dict(point),
                "last_capture_time": last.capture_time.isoformat() if last else None,
                "last_distance_mm": last.current_distance_mm if last else point.baseline_mm,
                "demo_ready": point.monitor_point_id == "MP-03",
            }
        )
    return response


@app.get("/api/points/{monitor_point_id}")
def get_point(monitor_point_id: str, session: Session = Depends(get_db)) -> dict:
    point = session.get(MonitorPoint, monitor_point_id)
    if point is None:
        raise HTTPException(404, "监测点不存在。")
    return point_to_dict(point)


@app.post("/api/measure")
async def measure(
    image: UploadFile = File(...),
    browser_lat: float | None = Form(default=None),
    browser_lon: float | None = Form(default=None),
    camera_profile: str | None = Form(default=None),
    session: Session = Depends(get_db),
) -> dict:
    if image.content_type and not image.content_type.startswith("image/"):
        raise HTTPException(415, "仅支持图片文件。")
    raw = await image.read()
    if len(raw) > 20 * 1024 * 1024:
        raise HTTPException(413, "图片不能超过 20 MB。")
    try:
        logger.info("received filename=%s bytes=%s", image.filename or "unnamed", len(raw))
        result = create_measurement(
            session,
            raw,
            browser_lat,
            browser_lon,
            original_filename=image.filename or "unnamed",
        )
    except ValueError as error:
        raise HTTPException(422, str(error)) from error
    result["requested_camera_profile"] = camera_profile
    return result


@app.post("/api/inspections/{inspection_id}/confirm")
def confirm_inspection(
    inspection_id: str,
    payload: ConfirmationPayload,
    session: Session = Depends(get_db),
) -> dict:
    inspection = session.get(Inspection, inspection_id)
    if inspection is None:
        raise HTTPException(404, "复测记录不存在。")
    if inspection.measurement_status != "pending":
        raise HTTPException(409, "当前测量未通过质量门控，不能确认。")
    inspection.human_confirmed = True
    inspection.measurement_status = "confirmed"
    inspection.observer_name = payload.observer_name
    inspection.remark = payload.remark or inspection.remark
    inspection.visible_change_note = payload.visible_change_note
    session.commit()
    point = session.get(MonitorPoint, inspection.monitor_point_id)
    return inspection_to_dict(inspection, point)


@app.get("/api/inspections/{inspection_id}")
def get_inspection(inspection_id: str, session: Session = Depends(get_db)) -> dict:
    inspection = session.get(Inspection, inspection_id)
    if inspection is None:
        raise HTTPException(404, "复测记录不存在。")
    point = session.get(MonitorPoint, inspection.monitor_point_id)
    payload = inspection_to_dict(inspection, point)
    previous = session.scalar(
        select(Inspection)
        .where(
            Inspection.monitor_point_id == inspection.monitor_point_id,
            Inspection.human_confirmed.is_(True),
            Inspection.capture_time < inspection.capture_time,
        )
        .order_by(desc(Inspection.capture_time))
    )
    payload["previous_evidence"] = (
        {
            "original": previous.photo_original,
            "rectified": previous.photo_rectified,
            "capture_time": previous.capture_time.isoformat(),
        }
        if previous
        else None
    )
    return payload


@app.get("/api/points/{monitor_point_id}/history")
def point_history(monitor_point_id: str, session: Session = Depends(get_db)) -> list[dict]:
    point = session.get(MonitorPoint, monitor_point_id)
    if point is None:
        raise HTTPException(404, "监测点不存在。")
    inspections = session.scalars(
        select(Inspection)
        .where(Inspection.monitor_point_id == monitor_point_id)
        .order_by(desc(Inspection.capture_time))
    ).all()
    return [inspection_to_dict(item, point) for item in inspections]


@app.post("/api/benchmark/trial")
def add_benchmark_trial(
    payload: BenchmarkTrialPayload,
    session: Session = Depends(get_db),
) -> dict:
    if payload.mode not in {"traditional", "system"}:
        raise HTTPException(422, "mode 必须为 traditional 或 system。")
    trial = BenchmarkTrial(
        trial_id=payload.trial_id or str(uuid.uuid4()),
        mode=payload.mode,
        duration_ms=payload.duration_ms,
        errors=payload.errors,
    )
    session.add(trial)
    session.commit()
    return {
        "id": trial.id,
        "trial_id": trial.trial_id,
        "mode": trial.mode,
        "duration_ms": trial.duration_ms,
        "errors": trial.errors,
    }


def _mode_summary(values: list[int]) -> dict | None:
    if not values:
        return None
    ordered = sorted(values)
    p90_index = max(0, math.ceil(len(ordered) * 0.9) - 1)
    return {
        "count": len(values),
        "median_ms": statistics.median(values),
        "p90_ms": ordered[p90_index],
        "min_ms": min(values),
        "max_ms": max(values),
    }


@app.get("/api/benchmark/summary")
def benchmark_summary(session: Session = Depends(get_db)) -> dict:
    trials = session.scalars(select(BenchmarkTrial)).all()
    traditional_values = [item.duration_ms for item in trials if item.mode == "traditional"]
    system_values = [item.duration_ms for item in trials if item.mode == "system"]
    traditional = _mode_summary(traditional_values)
    system = _mode_summary(system_values)
    time_saved = None
    if traditional and system and traditional["median_ms"]:
        time_saved = (traditional["median_ms"] - system["median_ms"]) / traditional["median_ms"] * 100
    return {
        "traditional": traditional,
        "system": system,
        "time_saved_percent": time_saved,
        "total_trials": len(trials),
        "disclaimer": "本页结果来自本机实际测试，不代表真实野外生产效率；PoC 阶段需由真实监测员重新测试。",
    }
