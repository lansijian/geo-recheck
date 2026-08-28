from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator


ObservationType = Literal[
    "new_crack",
    "crack_extension",
    "seepage_or_water_stain",
    "spalling_or_peeling",
    "wall_surface_change",
    "marker_damage",
    "coverage_missing",
    "other_visible_change",
    "none",
]
ObservationState = Literal["new", "worsened", "stable", "uncertain", "not_visible"]
Confidence = Literal["high", "medium", "low"]

FORBIDDEN_DECISION_LANGUAGE = (
    "安全",
    "危险",
    "高风险",
    "低风险",
    "风险等级",
    "撤离",
    "预警",
    "结构稳定",
    "滑坡将",
    "崩塌将",
)


def reject_decision_language(value: str) -> str:
    if any(term in value for term in FORBIDDEN_DECISION_LANGUAGE):
        raise ValueError("AI 观察只能描述可见现象，不得包含风险、安全或行动决策语言。")
    return value


class AIObservation(BaseModel):
    type: ObservationType
    state: ObservationState
    evidence: str = Field(min_length=1, max_length=500)
    confidence: Confidence
    requires_human_check: bool = True

    @field_validator("evidence")
    @classmethod
    def visible_evidence_only(cls, value: str) -> str:
        return reject_decision_language(value)

    @field_validator("requires_human_check")
    @classmethod
    def always_require_human_check(cls, value: bool) -> bool:
        if value is not True:
            raise ValueError("每一条 AI 观察都必须要求人工确认。")
        return value


class AIFieldReview(BaseModel):
    scene_consistency: Literal["same_location", "likely_same", "uncertain"]
    observations: list[AIObservation] = Field(max_length=12)
    coverage_complete: bool | None
    missing_views: list[str] = Field(default_factory=list, max_length=12)
    record_draft: str = Field(max_length=1000)
    disclaimer: str = Field(min_length=1, max_length=300)

    @field_validator("record_draft")
    @classmethod
    def draft_must_not_make_decisions(cls, value: str) -> str:
        return reject_decision_language(value)
