import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { confirmMeasurement, decideAIReviewItem, getRuntimeHealth, getShowcaseCases, measureImage, replayAIReview, runAIReview } from "../api/client";
import PhoneFrame from "../components/showcase/PhoneFrame";
import ShowcaseScene from "../components/showcase/ShowcaseScene";
import ShowcaseSidebar from "../components/showcase/ShowcaseSidebar";
import { FIELD_STEPS, PUBLIC_PHASES, type ShowcaseCase } from "../components/showcase/showcaseData";
import type { AIReview, Measurement } from "../types";
import { saveShowcaseSessionRecord } from "../utils/showcaseSession";
import "../showcase.css";

type AsyncState = "idle" | "running" | "ready" | "failed";
type Decision = "pending" | "accepted" | "rejected";
type CaptureKind = "context" | "closeup";
type PersistenceMode = "detecting" | "local-durable" | "serverless-ephemeral";

const EXHIBITION_CASES = new Set(["case_03_seepage", "case_04_spalling", "case_05_quality_fail"]);
const PLAYBACK_SPEED = import.meta.env.DEV && new URLSearchParams(window.location.search).get("speed") === "fast" ? 0.02 : 1;

function buildSessionReplay(activeCase: ShowcaseCase, measurement: Measurement): AIReview {
  return {
    id: `showcase-${measurement.id}`,
    inspection_id: measurement.id,
    provider: "stepfun",
    model: activeCase.ai_replay.model,
    status: "completed",
    created_at: new Date().toISOString(),
    latency_ms: activeCase.ai_replay.original_latency_ms,
    attempts: activeCase.ai_replay.attempts,
    error_code: null,
    error_message: null,
    parsed: {
      scene_consistency: activeCase.ai_replay.parsed.scene_consistency,
      coverage_complete: activeCase.ai_replay.parsed.coverage_complete,
      missing_views: activeCase.ai_replay.parsed.missing_views,
      record_draft: activeCase.ai_replay.parsed.record_draft,
      disclaimer: activeCase.ai_replay.parsed.disclaimer,
    },
    items: activeCase.ai_replay.parsed.observations.map((item, index) => ({
      id: index + 1,
      type: item.type,
      state: item.state,
      evidence: item.evidence,
      confidence: item.confidence,
      requires_human_check: true,
      human_status: "pending",
      edited_evidence: null,
    })),
  };
}

function applySessionDecision(review: AIReview | null, decision: Exclude<Decision, "pending">): AIReview | null {
  if (!review) return null;
  return {
    ...review,
    items: review.items.map((item) => {
      const isPositiveFinding = item.type !== "none" && item.state !== "stable" && item.state !== "not_visible";
      return { ...item, human_status: decision === "accepted" && isPositiveFinding ? "accepted" : "rejected" };
    }),
  };
}

function buildSessionRecord(measurement: Measurement, activeCase: ShowcaseCase, review: AIReview | null, observerName: string, remark: string): Measurement {
  const accepted = review?.items.filter((item) => item.human_status === "accepted" || item.human_status === "edited") ?? [];
  const opening = measurement.opening_delta_mm ?? measurement.delta_mm;
  const geometryText = opening == null ? "本次几何测量未通过质量门控，未形成毫米结果。" : `本次裂缝较上期张开 ${opening.toFixed(1)} mm。`;
  const observationText = accepted.map((item) => `${item.edited_evidence ?? item.evidence}，已由监测员人工确认。`).join("");
  return {
    ...measurement,
    observer_name: observerName,
    remark,
    status: measurement.status === "rejected" ? "rejected" : "confirmed",
    human_confirmed: measurement.status !== "rejected",
    demo_case_id: activeCase.case_id,
    ai_review: review,
    record_text: `${geometryText}${observationText}`,
    previous_evidence: { original: activeCase.assets.previous_close, rectified: null, capture_time: measurement.capture_time },
    evidence: { ...measurement.evidence, original: activeCase.assets.current_close, rectified: null, overlay: null },
  };
}

export default function ShowcasePage() {
  const navigate = useNavigate();
  const [cases, setCases] = useState<ShowcaseCase[]>([]);
  const [activeCaseId, setActiveCaseId] = useState("case_03_seepage");
  const [stepIndex, setStepIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [captures, setCaptures] = useState<{ context: string | null; closeup: string | null }>({ context: null, closeup: null });
  const [captureTransfer, setCaptureTransfer] = useState<{ url: string; kind: CaptureKind; token: number } | null>(null);
  const [measurement, setMeasurement] = useState<Measurement | null>(null);
  const [review, setReview] = useState<AIReview | null>(null);
  const [record, setRecord] = useState<Measurement | null>(null);
  const [geometryState, setGeometryState] = useState<AsyncState>("idle");
  const [replayState, setReplayState] = useState<AsyncState>("idle");
  const [liveAIState, setLiveAIState] = useState<"idle" | "running" | "completed" | "failed">("idle");
  const [processMessage, setProcessMessage] = useState("");
  const [decision, setDecision] = useState<Decision>("pending");
  const [observerName, setObserverName] = useState("");
  const [remark, setRemark] = useState("");
  const [error, setError] = useState("");
  const [persistenceMode, setPersistenceMode] = useState<PersistenceMode>("detecting");
  const geometryRun = useRef("");
  const replayRun = useRef("");
  const transferTimer = useRef<number | null>(null);

  const activeCase = useMemo(() => cases.find((item) => item.case_id === activeCaseId) ?? cases[0], [activeCaseId, cases]);
  const step = FIELD_STEPS[stepIndex];
  const publicPhaseIndex = PUBLIC_PHASES.findIndex((phase) => phase.id === step.publicPhase);
  const isHumanTurn = step.id === "human_confirm";
  const isFinished = step.id === "record";
  const runtimeLabel = playing ? "自动体验运行中" : isHumanTurn ? "轮到评委操作" : isFinished ? "体验完成" : stepIndex === 0 ? "等待开始" : "已暂停，可继续";
  const isServerlessSession = persistenceMode === "serverless-ephemeral";

  useEffect(() => {
    void getShowcaseCases().then((items) => setCases(items.filter((item) => EXHIBITION_CASES.has(item.case_id)))).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Showcase 数据加载失败。"));
    void getRuntimeHealth().then((health) => setPersistenceMode(health.persistence)).catch(() => setPersistenceMode(window.location.hostname.endsWith(".vercel.app") ? "serverless-ephemeral" : "local-durable"));
    return () => { if (transferTimer.current) window.clearTimeout(transferTimer.current); };
  }, []);

  const resetRun = useCallback(() => {
    setPlaying(false); setStepIndex(0); setCaptures({ context: null, closeup: null }); setCaptureTransfer(null);
    setMeasurement(null); setReview(null); setRecord(null); setGeometryState("idle"); setReplayState("idle"); setLiveAIState("idle");
    setProcessMessage(""); setDecision("pending"); setObserverName(""); setRemark(""); setError("");
    geometryRun.current = ""; replayRun.current = "";
  }, []);

  useEffect(() => { if (activeCase) resetRun(); }, [activeCase?.case_id, resetRun]);

  const handleCapture = useCallback((kind: CaptureKind, dataUrl: string) => {
    setCaptures((current) => ({ ...current, [kind]: dataUrl }));
    setCaptureTransfer({ url: dataUrl, kind, token: Date.now() });
    if (transferTimer.current) window.clearTimeout(transferTimer.current);
    transferTimer.current = window.setTimeout(() => setCaptureTransfer(null), 1150);
  }, []);

  const runGeometry = useCallback(async () => {
    if (!activeCase || geometryRun.current === activeCase.case_id) return;
    geometryRun.current = activeCase.case_id;
    setGeometryState("running"); setProcessMessage("正在将墙面近景送入 FastAPI / OpenCV 实时接口…");
    try {
      const response = await fetch(activeCase.assets.current_close);
      if (!response.ok) throw new Error("无法读取 Canonical Field Scene 的裂缝证据纹理。");
      const image = await response.blob();
      const result = await measureImage(new File([image], `${activeCase.case_id}_current.jpg`, { type: image.type || "image/jpeg" }), undefined, activeCase.case_id);
      setMeasurement(result); setGeometryState("ready");
      setProcessMessage(result.status === "rejected" ? "质量门控已拒绝毫米输出；失败证据已写入 SQLite。" : `真实几何完成：${(result.opening_delta_mm ?? result.delta_mm ?? 0).toFixed(1)} mm。`);
    } catch (reason) {
      setGeometryState("failed"); setPlaying(false); setError(reason instanceof Error ? reason.message : "真实几何测量失败。");
    }
  }, [activeCase]);

  const runReplay = useCallback(async () => {
    if (!activeCase || !measurement || replayRun.current === measurement.id) return;
    replayRun.current = measurement.id;
    if (persistenceMode === "detecting") return;
    setReplayState("running"); setProcessMessage(isServerlessSession ? "正在载入已审计的 StepFun 实测回放…" : "正在把已审计的 StepFun 成功响应写入本次 SQLite 记录…");
    try {
      const replay = isServerlessSession ? buildSessionReplay(activeCase, measurement) : await replayAIReview(measurement.id, activeCase.case_id);
      setReview(replay); setReplayState("ready");
      setProcessMessage(isServerlessSession ? `AI 实测回放已载入浏览器会话：${activeCase.ai_replay.model}，原始 ${(activeCase.ai_replay.original_latency_ms / 1000).toFixed(1)} 秒。` : `AI 实测回放已落库：${activeCase.ai_replay.model}，原始 ${(activeCase.ai_replay.original_latency_ms / 1000).toFixed(1)} 秒。`);
    } catch (reason) {
      setReplayState("failed"); setPlaying(false); setError(reason instanceof Error ? reason.message : "AI 实测回放失败。");
    }
  }, [activeCase, isServerlessSession, measurement, persistenceMode]);

  useEffect(() => { if (step.id === "geometry") void runGeometry(); }, [runGeometry, step.id]);
  useEffect(() => { if (step.id === "ai_review" && geometryState === "ready") void runReplay(); }, [geometryState, runReplay, step.id]);

  const canAdvance = useMemo(() => {
    if (step.id === "capture_context") return Boolean(captures.context);
    if (step.id === "capture_closeup") return Boolean(captures.closeup);
    if (step.id === "geometry") return geometryState === "ready";
    if (step.id === "ai_review") return replayState === "ready";
    return step.id !== "human_confirm" && step.id !== "record";
  }, [captures, geometryState, replayState, step.id]);

  const advance = useCallback(() => {
    if (!canAdvance || stepIndex >= FIELD_STEPS.length - 1) return;
    setStepIndex((value) => value + 1);
  }, [canAdvance, stepIndex]);

  useEffect(() => {
    if (!playing) return;
    if (step.id === "human_confirm" || step.id === "record") { setPlaying(false); return; }
    if (!canAdvance) return;
    const timer = window.setTimeout(advance, Math.max(40, step.durationMs * PLAYBACK_SPEED));
    return () => window.clearTimeout(timer);
  }, [advance, canAdvance, playing, step.durationMs, step.id]);

  async function runLiveAI() {
    if (!activeCase || !measurement || liveAIState === "running") return;
    if (isServerlessSession) {
      setProcessMessage("稳定路演模式使用已审计 AI 回放；实时 StepFun 请在本地一键启动版中运行。");
      return;
    }
    setLiveAIState("running"); setProcessMessage("正在运行实时 StepFun，预计 30–60 秒；几何结果不会被修改。");
    try {
      const live = await runAIReview(measurement.id, activeCase.case_id);
      if (live.status !== "completed") throw new Error(live.error_message || "实时 AI 未成功完成。");
      setReview(live); setLiveAIState("completed"); setProcessMessage("实时 StepFun 已完成，当前人工确认将使用实时结果。");
    } catch (reason) {
      setLiveAIState("failed"); setProcessMessage(reason instanceof Error ? `${reason.message} 几何和记录不受影响。` : "实时 AI 失败；几何和记录不受影响。");
    }
  }

  async function finishConfirmation() {
    if (!measurement || !observerName.trim() || !remark.trim()) return;
    if (!activeCase) return;
    if (measurement.status === "rejected") {
      const failedRecord = isServerlessSession ? buildSessionRecord(measurement, activeCase, review, observerName.trim(), remark.trim()) : measurement;
      if (isServerlessSession) saveShowcaseSessionRecord(failedRecord);
      setRecord(failedRecord); setStepIndex(FIELD_STEPS.length - 1); return;
    }
    if (decision === "pending") return;
    try {
      if (isServerlessSession) {
        const decidedReview = applySessionDecision(review, decision);
        const sessionRecord = buildSessionRecord(measurement, activeCase, decidedReview, observerName.trim(), remark.trim());
        saveShowcaseSessionRecord(sessionRecord);
        setReview(decidedReview); setRecord(sessionRecord); setStepIndex(FIELD_STEPS.length - 1); setPlaying(false);
        setProcessMessage("人工决定与路演记录已保存在当前浏览器会话，不再依赖 Vercel 临时 SQLite。");
        return;
      }
      let latestReview = review;
      if (latestReview?.status === "completed") {
        for (const item of latestReview.items.filter((entry) => entry.human_status === "pending")) {
          const isPositiveFinding = item.type !== "none" && item.state !== "stable" && item.state !== "not_visible";
          latestReview = await decideAIReviewItem(measurement.id, item.id, decision === "accepted" && isPositiveFinding ? "accepted" : "rejected");
        }
        setReview(latestReview);
      }
      const confirmed = await confirmMeasurement(measurement.id, observerName.trim(), remark.trim(), decision === "accepted" ? "现场已核对并确认所选可见变化。" : "现场核对后未采纳 AI 可见变化提示。");
      setRecord(confirmed); setStepIndex(FIELD_STEPS.length - 1); setPlaying(false);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "人工确认保存失败。"); }
  }

  function handlePrimary() { if (step.id === "human_confirm") void finishConfirmation(); else if (step.id === "record") record && navigate(`/record/${record.id}`); else advance(); }
  function startAutoplay() { if (step.id === "record") resetRun(); setPlaying(true); }
  function focusPhone() { document.getElementById("judge-phone")?.scrollIntoView({ behavior: "smooth", block: "center" }); }
  function handleJudgeExperience() {
    if (isHumanTurn) { focusPhone(); return; }
    if (playing) { setPlaying(false); return; }
    startAutoplay();
  }

  if (error && !activeCase) return <section className="page"><div className="notice error">{error}</div></section>;
  if (!activeCase) return <section className="page"><div className="empty">正在载入 Field Inspector Simulator…</div></section>;

  return (
    <section className="showcase-page v06" data-testid="showcase-page">
      <header className="showcase-hero">
        <div className="showcase-title"><p>GeoReCheck · LIVE DEMO</p><h1>基层地灾巡查辅助工具</h1><span>人走到现场拍照，几何量毫米，AI 补人眼，人来做确认。</span></div>
        <div className="judge-launcher" aria-label="评委体验入口">
          <div><span>评委从这里开始</span><strong>{isHumanTurn ? "请在手机中完成最后确认" : isFinished ? "一条巡查记录已经生成" : "一键运行，约 60 秒到人工确认"}</strong><small>也可以直接点击下方手机里的绿色按钮逐步体验。</small></div>
          <div className="judge-actions">
            <button data-testid="judge-start" className="judge-primary" onClick={handleJudgeExperience}>{playing ? "暂停体验" : isHumanTurn ? "去手机完成确认" : isFinished ? "重新体验" : stepIndex === 0 ? "一键开始体验" : "继续自动体验"}</button>
            <button data-testid="judge-manual" className="judge-secondary" onClick={focusPhone}>亲手点手机</button>
          </div>
        </div>
      </header>
      <div className="showcase-casebar"><div><span>巡查案例</span>{cases.map((item) => <button data-testid={`case-${item.case_id}`} className={item.case_id === activeCaseId ? "active" : ""} key={item.case_id} onClick={() => setActiveCaseId(item.case_id)}><strong>{item.title.replace("墙体裂缝复测 + ", "")}</strong><small>{item.case_id}</small></button>)}</div><div className="showcase-playback"><button onClick={() => { setPlaying(false); setStepIndex((value) => Math.max(0, value - 1)); }} disabled={stepIndex === 0}>上一步</button><button data-testid="showcase-autoplay" className="play" onClick={() => playing ? setPlaying(false) : startAutoplay()}>{playing ? "暂停" : "自动巡查"}</button><button data-testid="showcase-next" onClick={advance} disabled={!canAdvance}>下一步</button><button onClick={resetRun}>重新开始</button></div></div>
      <div className="showcase-progress public-progress">{PUBLIC_PHASES.map((phase, index) => <div key={phase.id} className={index === publicPhaseIndex ? "active" : index < publicPhaseIndex ? "done" : ""}><span>{index < publicPhaseIndex ? "✓" : phase.number}</span><b>{phase.label}</b></div>)}</div>
      <div className={`showcase-runtime ${playing ? "running" : isHumanTurn ? "human-turn" : ""}`} role="status" aria-live="polite" data-testid="showcase-runtime">
        <div className="runtime-current"><i aria-hidden="true" /><span><strong>{runtimeLabel}</strong><b>{step.label}</b><small>{processMessage || step.explanation}</small></span></div>
        <div className="runtime-proof" aria-label="运行方式"><span><b>LIVE</b> Three.js 现场</span><span><b>LIVE</b> FastAPI / OpenCV</span><span><b className="replay">REPLAY</b> StepFun 实测</span><span><b className="write">{isServerlessSession ? "SESSION" : "WRITE"}</b> {isServerlessSession ? "路演记录" : "巡查记录"}</span></div>
        <small className="runtime-disclosure">{isServerlessSession ? "Vercel 路演将 AI 回放、人工决定与记录保存在当前浏览器会话；几何仍实时调用 API。" : "几何实时调用 API；AI 默认回放已审计实测响应，结果页可主动运行实时 StepFun。"}</small>
      </div>
      {error ? <div className="notice error showcase-error">{error}</div> : null}
      <div className="showcase-layout">
        <ShowcaseScene activeCase={activeCase} step={step} onCapture={handleCapture} />
        {captureTransfer ? <div key={captureTransfer.token} className={`capture-transfer ${captureTransfer.kind}`}><img src={captureTransfer.url} alt="现场照片正在进入手机" /><span>照片进入手机</span></div> : null}
        <PhoneFrame activeCase={activeCase} step={step} measurement={measurement} review={review} processMessage={processMessage} processBusy={geometryState === "running" || replayState === "running"} captures={captures} decision={decision} observerName={observerName} remark={remark} record={record} liveAIState={liveAIState} sessionMode={isServerlessSession} onPrimary={handlePrimary} onDecision={setDecision} onObserverName={setObserverName} onRemark={setRemark} onRunLiveAI={() => void runLiveAI()} onOpenRecord={() => record && navigate(`/record/${record.id}`)} />
        <ShowcaseSidebar step={step} activeCase={activeCase} isPlaying={playing} />
      </div>
    </section>
  );
}
