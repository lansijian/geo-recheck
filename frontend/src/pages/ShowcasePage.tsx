import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { confirmMeasurement, decideAIReviewItem, getAIStatus, measureImage, runAIReview } from "../api/client";
import PhoneFrame from "../components/showcase/PhoneFrame";
import ShowcaseScene from "../components/showcase/ShowcaseScene";
import ShowcaseSidebar from "../components/showcase/ShowcaseSidebar";
import { SHOWCASE_CASES, SHOWCASE_STEPS, type ShowcaseCase } from "../components/showcase/showcaseData";
import type { AIReview, AIStatus, Measurement } from "../types";
import "../showcase.css";

type PlaybackMode = "showcase" | "live";
type LiveState = "idle" | "measuring" | "reviewing" | "ready" | "failed";

export default function ShowcasePage() {
  const navigate = useNavigate();
  const [activeCaseId, setActiveCaseId] = useState<ShowcaseCase["id"]>("case_03_seepage");
  const [mode, setMode] = useState<PlaybackMode>("showcase");
  const [stepIndex, setStepIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [decision, setDecision] = useState<"pending" | "accepted" | "rejected">("pending");
  const [liveState, setLiveState] = useState<LiveState>("idle");
  const [liveMessage, setLiveMessage] = useState("");
  const [liveMeasurement, setLiveMeasurement] = useState<Measurement | null>(null);
  const [liveReview, setLiveReview] = useState<AIReview | null>(null);
  const [aiStatus, setAIStatus] = useState<AIStatus | null>(null);
  const [recordId, setRecordId] = useState<string | null>(null);
  const activeCase = useMemo(() => SHOWCASE_CASES.find((item) => item.id === activeCaseId) ?? SHOWCASE_CASES[0], [activeCaseId]);
  const step = SHOWCASE_STEPS[stepIndex];

  const resetRun = useCallback((nextStep = 0) => {
    setPlaying(false);
    setStepIndex(nextStep);
    setDecision("pending");
    setLiveState("idle");
    setLiveMessage("");
    setLiveMeasurement(null);
    setLiveReview(null);
    setRecordId(null);
  }, []);

  useEffect(() => {
    void getAIStatus().then(setAIStatus).catch(() => setAIStatus(null));
  }, []);

  useEffect(() => {
    resetRun();
  }, [activeCaseId, mode, resetRun]);

  const runLiveProcessing = useCallback(async () => {
    if (liveState !== "idle") return;
    setLiveState("measuring");
    setLiveMessage("正在运行 OpenCV 几何测量…");
    try {
      const imageResponse = await fetch(activeCase.current);
      if (!imageResponse.ok) throw new Error("无法读取当前演示近景。");
      const image = await imageResponse.blob();
      const measurement = await measureImage(
        new File([image], `${activeCase.id}_current.jpg`, { type: image.type || "image/jpeg" }),
        undefined,
        activeCase.id,
      );
      setLiveMeasurement(measurement);
      if (measurement.status === "rejected") {
        setLiveMessage("质量门控已拒绝毫米结果。");
        setLiveState("ready");
        return;
      }
      const status = aiStatus ?? await getAIStatus();
      setAIStatus(status);
      if (!status.enabled || !status.configured) {
        setLiveMessage("几何已完成；StepFun 未启用，AI 复核已跳过。");
        setLiveState("ready");
        return;
      }
      setLiveState("reviewing");
      setLiveMessage("几何已完成，正在等待 StepFun 三图复核…");
      const review = await runAIReview(measurement.id, activeCase.id);
      setLiveReview(review);
      setLiveMessage(review.status === "completed" ? "几何与 AI 复核均已完成。" : "几何已完成；AI 复核未成功。");
      setLiveState("ready");
    } catch (error) {
      setLiveMessage(error instanceof Error ? error.message : "实时处理失败。几何演示数据不受影响。");
      setLiveState("failed");
      setPlaying(false);
    }
  }, [activeCase, aiStatus, liveState]);

  useEffect(() => {
    if (mode === "live" && step.id === "processing" && liveState === "idle") {
      void runLiveProcessing();
    }
  }, [liveState, mode, runLiveProcessing, step.id]);

  const canAdvance = !(mode === "live" && step.id === "processing" && liveState !== "ready");

  const advance = useCallback(() => {
    if (stepIndex >= SHOWCASE_STEPS.length - 1) {
      setPlaying(false);
      return;
    }
    if (mode === "live" && SHOWCASE_STEPS[stepIndex].id === "processing" && liveState !== "ready") return;
    if (mode === "live" && SHOWCASE_STEPS[stepIndex + 1]?.id === "confirm") setPlaying(false);
    setStepIndex((value) => Math.min(SHOWCASE_STEPS.length - 1, value + 1));
  }, [liveState, mode, stepIndex]);

  useEffect(() => {
    if (!playing || step.id === "record") return;
    if (mode === "live" && step.id === "processing" && liveState !== "ready") return;
    if (mode === "live" && step.id === "confirm") {
      setPlaying(false);
      return;
    }
    const timer = window.setTimeout(() => {
      if (step.id === "confirm" && decision === "pending") setDecision("accepted");
      advance();
    }, step.durationMs);
    return () => window.clearTimeout(timer);
  }, [advance, decision, liveState, mode, playing, step]);

  async function finishConfirmation() {
    if (!activeCase.qualityPassed && mode === "showcase") {
      setRecordId(activeCase.recordCode);
      setStepIndex(SHOWCASE_STEPS.length - 1);
      return;
    }
    if (mode === "showcase") {
      if (decision === "pending") setDecision("accepted");
      setRecordId(activeCase.recordCode);
      setStepIndex(SHOWCASE_STEPS.length - 1);
      return;
    }
    if (!liveMeasurement) return;
    if (liveMeasurement.status === "rejected") {
      setRecordId(liveMeasurement.id);
      setStepIndex(SHOWCASE_STEPS.length - 1);
      return;
    }
    setLiveMessage("正在保存人工决定并生成正式记录…");
    try {
      let review = liveReview;
      if (review?.status === "completed") {
        for (const item of review.items.filter((entry) => entry.human_status === "pending")) {
          const itemDecision = item.type === "none" ? "rejected" : decision === "rejected" ? "rejected" : "accepted";
          review = await decideAIReviewItem(liveMeasurement.id, item.id, itemDecision);
        }
        setLiveReview(review);
      }
      const confirmed = await confirmMeasurement(liveMeasurement.id, "展示模式监测员", "V0.5 Showcase 实时模式人工确认");
      setRecordId(confirmed.id);
      setDecision(decision === "pending" ? "accepted" : decision);
      setStepIndex(SHOWCASE_STEPS.length - 1);
    } catch (error) {
      setLiveMessage(error instanceof Error ? error.message : "确认记录失败。");
      setLiveState("failed");
    }
  }

  function handlePhonePrimary() {
    if (step.id === "confirm") {
      void finishConfirmation();
      return;
    }
    if (step.id === "record") {
      if (mode === "live" && recordId && liveMeasurement?.status !== "rejected") navigate(`/record/${recordId}`);
      else resetRun();
      return;
    }
    advance();
  }

  function startAutoplay() {
    if (step.id === "record") resetRun();
    setPlaying(true);
  }

  const completedPercent = Math.round((stepIndex / (SHOWCASE_STEPS.length - 1)) * 100);
  const liveReady = aiStatus ? aiStatus.enabled && aiStatus.configured : false;

  return (
    <section className="showcase-page" data-testid="showcase-page">
      <header className="showcase-hero">
        <div><p>GeoReCheck V0.5 · 比赛展示模式</p><h1>巡查员到现场后，先看房，再量缝，最后留记录。</h1><span>左边看现场，中间看手机怎么用，右边看每一步为什么做。</span></div>
        <div className="showcase-mode-switch" aria-label="展示与实时模式切换">
          <button data-testid="showcase-mode" className={mode === "showcase" ? "active" : ""} onClick={() => setMode("showcase")}><strong>展示模式</strong><small>本地样例 · 稳定无网络</small></button>
          <button data-testid="live-mode" className={mode === "live" ? "active" : ""} onClick={() => setMode("live")}><strong>实时模式</strong><small>后端 + StepFun {liveReady ? "· 已就绪" : "· 请检查配置"}</small></button>
        </div>
      </header>

      <div className="showcase-casebar">
        <div><span>选择故事</span>{SHOWCASE_CASES.map((item) => <button data-testid={`case-${item.id}`} className={item.id === activeCaseId ? "active" : ""} key={item.id} onClick={() => setActiveCaseId(item.id)}><strong>{item.shortLabel}</strong><small>{item.id}</small></button>)}</div>
        <div className="showcase-playback">
          <button onClick={() => setStepIndex((value) => Math.max(0, value - 1))} disabled={stepIndex === 0}>上一步</button>
          <button data-testid="showcase-autoplay" className="play" onClick={() => playing ? setPlaying(false) : startAutoplay()}>{playing ? "暂停" : "自动演示"}</button>
          <button data-testid="showcase-next" onClick={advance} disabled={!canAdvance || stepIndex === SHOWCASE_STEPS.length - 1}>下一步</button>
          <button onClick={() => resetRun()}>重新开始</button>
        </div>
      </div>

      <div className="showcase-progress"><span style={{ width: `${completedPercent}%` }} /><small>{step.number} · {step.label}</small><b>{completedPercent}%</b></div>

      {mode === "showcase" ? <div className="mode-disclosure"><strong>演示模式</strong> 当前读取仓库内置、已通过几何验证的样例结果；不会伪装成实时 StepFun 调用。</div> : <div className="mode-disclosure live"><strong>实时模式</strong> 当前会真实调用本机 FastAPI；StepFun 是否运行取决于本地配置和网络，失败时仍保留几何结果。</div>}

      <div className="showcase-layout">
        <ShowcaseScene activeCase={activeCase} stepIndex={stepIndex} step={step} />
        <PhoneFrame activeCase={activeCase} step={step} mode={mode} liveBusy={liveState === "measuring" || liveState === "reviewing"} liveMessage={liveMessage} liveMeasurement={liveMeasurement} liveReview={liveReview} decision={decision} recordId={recordId} onPrimary={handlePhonePrimary} onDecision={setDecision} onOpenRecord={handlePhonePrimary} />
        <ShowcaseSidebar stepIndex={stepIndex} step={step} />
      </div>
    </section>
  );
}
