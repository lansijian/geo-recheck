import type { AIObservationType } from "../../types";

export type FieldStepId = "task" | "walking" | "arrive" | "inspect_context" | "raise_phone" | "capture_context" | "approach_crack" | "capture_closeup" | "geometry" | "ai_review" | "result" | "human_confirm" | "record";
export type PublicPhaseId = "arrival" | "capture" | "analysis" | "confirm" | "record";
export type FieldStep = { id: FieldStepId; publicPhase: PublicPhaseId; label: string; sceneTitle: string; explanation: string; durationMs: number };

export type ShowcaseCase = {
  schema_version: number; case_id: string; title: string; location: string;
  assets: { context: string; previous_close: string; current_close: string };
  geometry: { measured_opening_delta_mm: number | null; expected_opening_delta_mm: number; quality_gate: "accepted" | "rejected"; quality_score: number; quality_reasons: string[]; measurement_source: string };
  viewpoint: { previous: { yaw: number; pitch: number }; current: { yaw: number; pitch: number }; delta_deg: number; different: boolean };
  provenance: { synthetic_changes: string[]; disclosure: string };
  field_scene: { house_position: [number, number, number]; crack_position: [number, number, number]; drainage_position: [number, number, number]; worker_entry: [number, number, number]; worker_context_stop: [number, number, number]; worker_close_stop: [number, number, number]; controlled_roi: boolean };
  ai_replay: { provider: "StepFun"; model: string; original_latency_ms: number; attempts: number; validated_date: string; source_artifact: string; source_run: number; parsed: { scene_consistency: "same_location" | "likely_same" | "uncertain"; observations: Array<{ type: AIObservationType; state: "new" | "worsened" | "stable" | "uncertain" | "not_visible"; evidence: string; confidence: "high" | "medium" | "low"; requires_human_check: true }>; coverage_complete: boolean | null; missing_views: string[]; record_draft: string; disclaimer: string } };
};

export const FIELD_STEPS: FieldStep[] = [
  { id: "task", publicPhase: "arrival", label: "接到任务", sceneTitle: "巡查员从村道入口出发", explanation: "确认 MP-03 与 CRACK-W01 后进入统一现场。", durationMs: 1800 },
  { id: "walking", publicPhase: "arrival", label: "走向房屋", sceneTitle: "沿山地巡查路径走向房屋", explanation: "3D 人物和摄像机在同一个空间内移动。", durationMs: 8000 },
  { id: "arrive", publicPhase: "arrival", label: "到达现场", sceneTitle: "停在房屋与挡墙前", explanation: "先建立房屋、挡墙、排水沟与裂缝点的空间关系。", durationMs: 1800 },
  { id: "inspect_context", publicPhase: "capture", label: "观察现场", sceneTitle: "朝向墙面巡查区域", explanation: "巡查员先看完整现场，再拍摄局部。", durationMs: 2200 },
  { id: "raise_phone", publicPhase: "capture", label: "举起手机", sceneTitle: "手机取景框对准房屋", explanation: "人物手臂抬起，现场摄像机进入拍摄机位。", durationMs: 1500 },
  { id: "capture_context", publicPhase: "capture", label: "拍摄全景", sceneTitle: "记录同一房屋的现场全景", explanation: "WebGL 场景快照通过闪光与缩略图动画进入手机。", durationMs: 2800 },
  { id: "approach_crack", publicPhase: "capture", label: "靠近裂缝", sceneTitle: "继续走到墙面复测点前", explanation: "人物与摄像机真实靠近房屋墙面上的裂缝区域。", durationMs: 4300 },
  { id: "capture_closeup", publicPhase: "capture", label: "拍摄近景", sceneTitle: "从不同角度拍摄 CRACK-W01", explanation: "近景纹理就是墙面明确位置的测量证据源。", durationMs: 3000 },
  { id: "geometry", publicPhase: "analysis", label: "几何测量", sceneTitle: "FastAPI / OpenCV 真实运行", explanation: "本次图片真实进入质量门控与确定性几何测量。", durationMs: 1800 },
  { id: "ai_review", publicPhase: "analysis", label: "AI 实测回放", sceneTitle: "回放已审计的 StepFun 成功响应", explanation: "响应来自真实验证 artifact，并写入本次 SQLite 记录。", durationMs: 3200 },
  { id: "result", publicPhase: "analysis", label: "查看结果", sceneTitle: "毫米结果与可见变化分开展示", explanation: "拖动 Before / After 滑块可直接观察受控变化。", durationMs: 10000 },
  { id: "human_confirm", publicPhase: "confirm", label: "等待人工确认", sceneTitle: "自动演示在此强制暂停", explanation: "只有监测员输入姓名、备注并点击确认或不采纳后才能继续。", durationMs: 0 },
  { id: "record", publicPhase: "record", label: "自动留痕", sceneTitle: "真实 SQLite 巡查记录已生成", explanation: "几何、AI 人工决定和用户输入进入同一条正式记录。", durationMs: 0 },
];

export const PUBLIC_PHASES: Array<{ id: PublicPhaseId; number: string; label: string }> = [
  { id: "arrival", number: "01", label: "到达现场" }, { id: "capture", number: "02", label: "拍照复测" }, { id: "analysis", number: "03", label: "几何 + AI" }, { id: "confirm", number: "04", label: "人工确认" }, { id: "record", number: "05", label: "自动留痕" },
];

export const OBSERVATION_LABELS: Record<string, string> = { new_crack: "疑似新裂缝", crack_extension: "既有裂缝可见延伸", seepage_or_water_stain: "疑似新增水迹", spalling_or_peeling: "疑似局部剥落", wall_surface_change: "墙面可见变化", marker_damage: "复测标志状态变化", coverage_missing: "图片覆盖不足", other_visible_change: "其他可见变化", none: "未见明确新增变化" };
