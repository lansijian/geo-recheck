from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

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
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    elevation: Mapped[float | None] = mapped_column(Float, nullable=True)
    baseline_mm: Mapped[float] = mapped_column(Float)  # legacy: board-centre distance, write-only
    left_marker_group: Mapped[str] = mapped_column(String(100))   # legacy: derived, never read
    right_marker_group: Mapped[str] = mapped_column(String(100))  # legacy: derived, never read
    is_demo_location: Mapped[bool] = mapped_column(Boolean, default=True)
    baseline_inspection_id: Mapped[str | None] = mapped_column(
        ForeignKey("inspections.id", ondelete="SET NULL", use_alter=True),
        nullable=True,
    )
    context_photo_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    context_photo_captured_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    context_callouts: Mapped[str | None] = mapped_column(Text, nullable=True)

    marker_assignments: Mapped[list["MarkerAssignment"]] = relationship(
        back_populates="point",
        order_by="MarkerAssignment.slot",
        lazy="selectin",
        cascade="all, delete-orphan",
    )


class MarkerAssignment(Base):
    __tablename__ = "marker_assignments"
    __table_args__ = (
        UniqueConstraint("monitor_point_id", "side", "slot", name="uq_marker_point_side_slot"),
        CheckConstraint("side IN ('left', 'right')", name="ck_marker_side"),
        CheckConstraint("slot BETWEEN 0 AND 3", name="ck_marker_slot"),
    )

    marker_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    monitor_point_id: Mapped[str] = mapped_column(
        ForeignKey("monitor_points.monitor_point_id", ondelete="RESTRICT"), index=True
    )
    side: Mapped[str] = mapped_column(String(8))
    slot: Mapped[int] = mapped_column(Integer)

    point: Mapped["MonitorPoint"] = relationship(back_populates="marker_assignments")


class Inspection(Base):
    __tablename__ = "inspections"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    monitor_point_id: Mapped[str] = mapped_column(
        ForeignKey("monitor_points.monitor_point_id", ondelete="RESTRICT"), index=True
    )
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
    demo_case_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    capture_mode: Mapped[str] = mapped_column(String(16), default="recheck")
    planar_x_mm: Mapped[float | None] = mapped_column(Float, nullable=True)
    planar_y_mm: Mapped[float | None] = mapped_column(Float, nullable=True)
    opening_since_baseline_mm: Mapped[float | None] = mapped_column(Float, nullable=True)
    shear_since_baseline_mm: Mapped[float | None] = mapped_column(Float, nullable=True)
    camera_profile_is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    context_photo_used: Mapped[str | None] = mapped_column(String(500), nullable=True)


class AIReview(Base):
    __tablename__ = "ai_reviews"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    inspection_id: Mapped[str] = mapped_column(
        ForeignKey("inspections.id", ondelete="CASCADE"), index=True
    )
    provider: Mapped[str] = mapped_column(String(30), default="stepfun")
    model: Mapped[str] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(30), index=True)
    parsed_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    error_code: Mapped[str | None] = mapped_column(String(50), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)


class AIReviewItem(Base):
    __tablename__ = "ai_review_items"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    review_id: Mapped[str] = mapped_column(
        ForeignKey("ai_reviews.id", ondelete="CASCADE"), index=True
    )
    inspection_id: Mapped[str] = mapped_column(
        ForeignKey("inspections.id", ondelete="CASCADE"), index=True
    )
    item_index: Mapped[int] = mapped_column(Integer)
    observation_type: Mapped[str] = mapped_column(String(50))
    observation_state: Mapped[str] = mapped_column(String(30))
    evidence: Mapped[str] = mapped_column(Text)
    confidence: Mapped[str] = mapped_column(String(20))
    requires_human_check: Mapped[bool] = mapped_column(Boolean, default=True)
    human_status: Mapped[str] = mapped_column(String(20), default="pending", index=True)
    edited_evidence: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class BenchmarkTrial(Base):
    __tablename__ = "benchmark_trials"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    trial_id: Mapped[str] = mapped_column(String(36), index=True)
    mode: Mapped[str] = mapped_column(String(20), index=True)
    duration_ms: Mapped[int] = mapped_column(Integer)
    errors: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
