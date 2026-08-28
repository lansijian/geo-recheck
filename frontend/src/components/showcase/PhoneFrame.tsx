import { useState, type CSSProperties } from "react";
import type { AIReview, Measurement } from "../../types";
import { OBSERVATION_LABELS, type FieldStep, type ShowcaseCase } from "./showcaseData";

type Decision = "pending" | "accepted" | "rejected";
type CaptureSet = { context: string | null; closeup: string | null };

type PhoneFrameProps = {
  activeCase: ShowcaseCase;
  step: FieldStep;
  measurement: Measurement | null;
  review: AIReview | null;
  processMessage: string;
  processBusy: boolean;
  captures: CaptureSet;
  decision: Decision;
  observerName: string;
  remark: string;
  record: Measurement | null;
  liveAIState: "idle" | "running" | "completed" | "failed";
  onPrimary: () => void;
  onDecision: (decision: Exclude<Decision, "pending">) => void;
  onObserverName: (value: string) => void;
  onRemark: (value: string) => void;
  onRunLiveAI: () => void;
  onOpenRecord: () => void;
};

function CameraView({ src, label }: { src: string; label: string }) {
  return <div className="phone-camera"><img src={src} alt={label} /><span className="phone-reticle" /><div><i>●</i>{label}</div></div>;
}

function BeforeAfterSlider({ activeCase }: { activeCase: ShowcaseCase }) {
  const [position, setPosition] = useState(52);
  return (
    <div className="before-after" data-testid="before-after-slider" style={{ "--compare-position": `${position}%` } as CSSProperties}>
      <img src={activeCase.assets.previous_close} alt="上次裂缝近景" />
      <div className="after-layer"><img src={activeCase.assets.current_close} alt="本次不同角度裂缝近景" />{activeCase.field_scene.controlled_roi ? <span className="controlled-roi">变化区域</span> : null}</div>
      <span className="compare-line"><i>↔</i></span><b className="before-label">上次</b><b className="after-label">本次</b>
      <input aria-label="拖动对比上次与本次图片" type="range" min="8" max="92" value={position} onChange={(event) => setPosition(Number(event.target.value))} />
      {activeCase.field_scene.controlled_roi ? <small>受控演示变化区域 · 非模型定位框</small> : null}
    </div>
  );
}

export default function PhoneFrame({ activeCase, step, measurement, review, processMessage, processBusy, captures, decision, observerName, remark, record, liveAIState, onPrimary, onDecision, onObserverName, onRemark, onRunLiveAI, onOpenRecord }: PhoneFrameProps) {
  const opening = measurement?.opening_delta_mm ?? measurement?.delta_mm ?? null;
  const qualityPassed = measurement ? measurement.status !== "rejected" : activeCase.geometry.quality_gate === "accepted";
  const replayObservations = activeCase.ai_replay.parsed.observations;
  const finding = review?.items.find((item) => item.type !== "none" && item.state !== "not_visible") ?? replayObservations.find((item) => item.type !== "none" && item.state !== "not_visible") ?? review?.items[0] ?? replayObservations[0];
  const aiLabel = OBSERVATION_LABELS[finding?.type ?? "none"] ?? finding?.type ?? "未见明确新增变化";
  const aiEvidence = finding?.evidence ?? "未形成可见变化描述。";
  const isCaptureContext = ["inspect_context", "raise_phone", "capture_context"].includes(step.id);
  const isCaptureClose = ["approach_crack", "capture_closeup"].includes(step.id);
  const isProcessing = ["geometry", "ai_review"].includes(step.id);

  return (
    <section className="showcase-phone-column" aria-label="巡查员手机模拟器" data-testid="showcase-phone">
      <div className="phone-mode-label"><strong>HYBRID REPLAY</strong> 几何实时运行 · AI 实测回放 · 记录真实落库</div>
      <div className="phone-frame"><div className="phone-hardware"><span /></div><div className="phone-screen">
        <div className="phone-status"><span>19:45</span><b>GeoReCheck</b><span>▮▮▮</span></div>
        <div className="phone-appbar"><span>本次巡查</span><strong>MP-03</strong></div>

        {["task", "walking", "arrive"].includes(step.id) ? <div className="phone-content phone-task"><span className="phone-kicker">今日任务 · CRACK-W01</span><h2>{step.id === "walking" ? "正在走向现场" : step.id === "arrive" ? "已到达房屋前" : "复测墙体裂缝"}</h2><dl><div><dt>位置</dt><dd>{activeCase.location}</dd></div><div><dt>对象</dt><dd>墙体裂缝与可见变化</dd></div><div><dt>拍摄</dt><dd>同一 3D 现场全景 + 近景</dd></div></dl><div className={`phone-route ${step.id}`}><span>入口</span><i /><b>房屋</b></div><button onClick={onPrimary}>{step.id === "task" ? "开始巡查" : step.id === "walking" ? "到达现场" : "开始拍照"}</button></div> : null}

        {isCaptureContext ? <div className="phone-content phone-capture"><CameraView src={captures.context ?? activeCase.assets.current_close} label="同一 3D 现场全景" /><span className="phone-kicker">现场与手机同步</span><h2>{step.id === "capture_context" ? "全景已进入手机" : "对准房屋与排水区域"}</h2><p>画面来自左侧 Three.js Canonical Field Scene。</p><button onClick={onPrimary}>{step.id === "capture_context" ? "继续靠近裂缝" : "拍摄现场全景"}</button></div> : null}

        {isCaptureClose ? <div className="phone-content phone-capture"><CameraView src={captures.closeup ?? captures.context ?? activeCase.assets.current_close} label="同一 3D 墙面裂缝近景" /><span className="phone-kicker">不同角度 · {activeCase.viewpoint.delta_deg.toFixed(1)}°</span><h2>{step.id === "capture_closeup" ? "近景已进入手机" : "靠近 CRACK-W01"}</h2><p>墙面纹理与几何测量证据来自同一个明确裂缝位置。</p><button onClick={onPrimary}>{step.id === "capture_closeup" ? "运行几何测量" : "拍摄裂缝近景"}</button></div> : null}

        {isProcessing ? <div className="phone-content phone-processing"><div className="processing-orbit"><span /><i /></div><span className="phone-kicker">{step.id === "geometry" ? "FastAPI / OpenCV" : "AI 实测回放"}</span><h2>{processMessage || "正在建立可审计结果"}</h2><ul><li className={measurement ? "done" : "active"}><b>{measurement ? "✓" : "…"}</b>真实几何接口</li><li className={measurement ? "done" : "pending"}><b>{measurement ? "✓" : "02"}</b>质量门控</li><li className={review ? "done" : step.id === "ai_review" ? "active" : "pending"}><b>{review ? "✓" : "03"}</b>StepFun 成功响应回放</li><li className={review ? "done" : "pending"}><b>{review ? "✓" : "04"}</b>SQLite AI 条目</li></ul><small>{processBusy ? "正在等待本机处理…" : "几何与记录是真实运行；AI 内容来自已保存的真实调用。"}</small></div> : null}

        {step.id === "result" ? <div className="phone-content phone-result"><span className={`quality-chip ${qualityPassed ? "passed" : "failed"}`}>{qualityPassed ? "图片质量通过" : "图片质量不合格"}</span><div className="phone-opening"><small>裂缝较上次变化</small><strong>{opening == null ? "未输出" : `${opening >= 0 ? "+" : ""}${opening.toFixed(1)} mm`}</strong><span>本机 OpenCV 几何测量</span></div><BeforeAfterSlider activeCase={activeCase} /><div className="phone-ai-result"><span>AI 实测回放</span><strong>{qualityPassed ? aiLabel : "图片覆盖不足"}</strong><p>{qualityPassed ? aiEvidence : activeCase.geometry.quality_reasons.join("；")}</p><small>{activeCase.ai_replay.provider} · {activeCase.ai_replay.model} · 原始 {(activeCase.ai_replay.original_latency_ms / 1000).toFixed(1)} s · {activeCase.ai_replay.validated_date}</small></div><button className="live-ai-button" onClick={onRunLiveAI} disabled={!measurement || !qualityPassed || liveAIState === "running"}>{liveAIState === "running" ? "实时 AI 运行中…" : liveAIState === "failed" ? "实时 AI 失败，可重试" : "运行实时 AI（预计 30–60 秒）"}</button><button onClick={onPrimary}>进入人工确认</button></div> : null}

        {step.id === "human_confirm" ? <div className="phone-content phone-confirm"><span className="human-waiting">等待人工确认</span><h2>{qualityPassed ? aiLabel : "本次不能形成毫米结果"}</h2><div className="confirm-evidence"><img src={activeCase.assets.current_close} alt="待人工确认的本次近景" /><p>{qualityPassed ? aiEvidence : activeCase.geometry.quality_reasons.join("；")}</p></div>{qualityPassed ? <div className="phone-decision"><button className={decision === "accepted" ? "selected" : ""} onClick={() => onDecision("accepted")}>确认</button><button className={decision === "rejected" ? "selected" : ""} onClick={() => onDecision("rejected")}>不采纳</button></div> : null}<label>监测员姓名<input aria-label="监测员姓名" value={observerName} onChange={(event) => onObserverName(event.target.value)} placeholder="请输入姓名" /></label><label>现场备注<textarea aria-label="现场备注" value={remark} onChange={(event) => onRemark(event.target.value)} placeholder="输入现场核对情况" /></label><button className="primary-action" onClick={onPrimary} disabled={!observerName.trim() || !remark.trim() || (qualityPassed && decision === "pending")}>{qualityPassed ? "确认并生成记录" : "保存失败证据"}</button></div> : null}

        {step.id === "record" ? <div className="phone-content phone-record"><div className={`record-check ${qualityPassed ? "" : "rejected"}`}>{qualityPassed ? "✓" : "!"}</div><span className="phone-kicker">{qualityPassed ? "巡查记录已生成" : "失败证据已落库"}</span><h2>{record?.id ?? measurement?.id}</h2><dl><div><dt>裂缝变化</dt><dd>{opening == null ? "未输出" : `${opening >= 0 ? "+" : ""}${opening.toFixed(1)} mm`}</dd></div><div><dt>监测员</dt><dd>{record?.observer_name ?? observerName}</dd></div><div><dt>人工决定</dt><dd>{decision === "accepted" ? `${aiLabel} · 已确认` : "AI 提示未采纳"}</dd></div><div><dt>现场备注</dt><dd>{record?.remark || remark || "无"}</dd></div></dl><p>几何、AI 人工处置与输入内容已进入同一条 SQLite 记录。</p><button onClick={onOpenRecord}>查看正式记录</button><div className="final-comparison"><span>传统：量 → 翻 → 比 → 拍 → 填</span><strong>GeoReCheck：拍 → 确认</strong><b>几何量毫米，AI补人眼，人来做确认。</b></div></div> : null}
      </div></div>
      <p className="phone-disclaimer">DEMO · 受控场景；不做风险判断，不替代专业设备</p>
    </section>
  );
}
