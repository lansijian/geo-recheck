from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.session import Base


class MonitorPoint(Base):
    __tablename__ = "monitor_points"

    monitor_point_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    hazard_id: Mapped[str] = mapped_column(String(64), index=True)
    hazard_name: Mapped[str] = mapped_column(String(200))
    monitor_point_name: Mapped[str] = mapped_column(String(200))
    structure_id: Mapped[str] = mapped_column(String(64))
    structure_name: Mapped[str] = mapped_column(String(200))
    location_description: Mapped[str] = mapped_column(String(300))
    latitude: Mapped[float] = mapped_column(Float)
    longitude: Mapped[float] = mapped_column(Float)
    elevation: Mapped[float | None] = mapped_column(Float, nullable=True)
    baseline_mm: Mapped[float] = mapped_column(Float)
    left_marker_group: Mapped[str] = mapped_column(String(100))
    right_marker_group: Mapped[str] = mapped_column(String(100))
    is_demo_location: Mapped[bool] = mapped_column(Boolean, default=True)


class Inspection(Base):
    __tablename__ = "inspections"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    monitor_point_id: Mapped[str] = mapped_column(String(64), index=True)
    capture_time: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    observer_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    previous_distance_mm: Mapped[float | None] = mapped_column(Float, nullable=True)
    current_distance_mm: Mapped[float | None] = mapped_column(Float, nullable=True)
    delta_opening_mm: Mapped[float | None] = mapped_column(Float, nullable=True)
    crack_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    scene_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    baseline_crack_width_mm: Mapped[float | None] = mapped_column(Float, nullable=True)
    opening_delta_mm: Mapped[float | None] = mapped_column(Float, nullable=True)
    shear_delta_mm: Mapped[float | None] = mapped_column(Float, nullable=True)
    out_of_plane_delta_mm: Mapped[float | None] = mapped_column(Float, nullable=True)
    measurement_mode: Mapped[str | None] = mapped_column(String(64), nullable=True)
    detector_type: Mapped[str | None] = mapped_column(String(64), nullable=True)
    data_provenance: Mapped[str | None] = mapped_column(Text, nullable=True)
    quality_score: Mapped[float] = mapped_column(Float, default=0.0)
    measurement_status: Mapped[str] = mapped_column(String(50))
    human_confirmed: Mapped[bool] = mapped_column(Boolean, default=False)
    location_match: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    location_mode: Mapped[str] = mapped_column(String(30), default="demo")
    photo_original: Mapped[str | None] = mapped_column(String(500), nullable=True)
    photo_undistorted: Mapped[str | None] = mapped_column(String(500), nullable=True)
    photo_rectified: Mapped[str | None] = mapped_column(String(500), nullable=True)
    photo_overlay: Mapped[str | None] = mapped_column(String(500), nullable=True)
    quality_reasons: Mapped[str | None] = mapped_column(Text, nullable=True)
    visible_change_note: Mapped[str | None] = mapped_column(Text, nullable=True)
    remark: Mapped[str | None] = mapped_column(Text, nullable=True)


class BenchmarkTrial(Base):
    __tablename__ = "benchmark_trials"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    trial_id: Mapped[str] = mapped_column(String(36), index=True)
    mode: Mapped[str] = mapped_column(String(20), index=True)
    duration_ms: Mapped[int] = mapped_column(Integer)
    errors: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
