import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { addBenchmarkTrial, confirmMeasurement, decideAIReviewItem, evidenceUrl, getAIStatus, getInspection, runAIReview } from "../api/client";
import type { AIReview, AIReviewItem, AIStatus, Measurement } from "../types";

type PreviewImage = { src: string; alt: string };

const OBSERVATION_LABELS: Record<AIReviewItem["type"], string> = {
  new_crack: "疑似新裂缝",
  crack_extension: "既有裂缝可见延伸",
  seepage_or_water_stain: "疑似新增水迹",
  spalling_or_peeling: "疑似局部剥落",
  wall_surface_change: "墙面可见变化",
  marker_damage: "复测标志状态",
  coverage_missing: "图片覆盖不足",
  other_visible_change: "其他可见变化",
  none: "未见明确新增变化",
};

const CONFIDENCE_LABELS = { high: "高", medium: "中", low: "低" } as const;

function LoadedEvidence({ src, alt, label, onOpen }: { src: string | null | undefined; alt: string; label: string; onOpen: (image: PreviewImage) => void }) {
  const url = evidenceUrl(src);
  if (!url) return <div className="evidence-empty">{label}：暂无影像</div>;
  return <figure><button className="image-button" type="button" onClick={() => onOpen({ src: url, alt })}><img src={url} alt={alt} /></button><figcaption>{label}<span>点击放大</span></figcaption></figure>;
}

export default function ResultPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [result, setResult] = useState<Measurement | null>(null);
  const [aiReview, setAIReview] = useState<AIReview | null>(null);
  const [aiStatus, setAIStatus] = useState<AIStatus | null>(null);
  const [observer, setObserver] = useState("演示监测员");
  const [remark, setRemark] = useState("");
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAIBusy] = useState(false);
  const [loading, setLoading] = useState(Boolean(id));
  const [error, setError] = useState("");
  const [previewImage, setPreviewImage] = useState<PreviewImage | null>(null);
  const autoReviewStarted = useRef(false);

  useEffect(() => {
    if (!id) return;
    let active = true;
    Promise.all([getInspection(id), getAIStatus()])
      .then(([measurement, status]) => {
        if (!active) return;
        setResult(measurement);
        setAIReview(measurement.ai_review ?? null);
        setAIStatus(status);
      })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "结果加载失败"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  async function triggerAIReview(measurement = result) {
    if (!measurement) return;
    if (!measurement.demo_case_id && measurement.capture_mode !== "recheck") return;
    setAIBusy(true);
    setError("");
    try { setAIReview(await runAIReview(measurement.id, measurement.demo_case_id ?? undefined)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "AI 现场复核请求失败"); }
    finally { setAIBusy(false); }
  }

  useEffect(() => {
    if (!result?.demo_case_id || result.ai_review || !aiStatus?.enabled || !aiStatus.configured || autoReviewStarted.current) return;
    autoReviewStarted.current = true;
    void triggerAIReview(result);
  }, [aiStatus, result]);

  async function decide(itemId: number, decision: "accepted" | "rejected") {
    if (!result) return;
    setError("");
    try { setAIReview(await decideAIReviewItem(result.id, itemId, decision)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "人工确认保存失败"); }
  }

  async function confirm() {
    if (!result) return;
    setBusy(true);
    setError("");
    try {
      const confirmed = await confirmMeasurement(result.id, observer, remark);
      const started = sessionStorage.getItem("geo-recheck:system-started");
      if (started) {
        await addBenchmarkTrial("system", Date.now() - Number(started));
        sessionStorage.removeItem("geo-recheck:system-started");
      }
      navigate(`/record/${confirmed.id}`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "确认失败"); }
    finally { setBusy(false); }
  }

  if (!id) return <section className="page"><div className="empty">结果地址缺少记录 ID。</div></section>;
  if (loading) return <section className="page"><div className="empty">正在恢复本次复测结果…</div></section>;
  if (error && !result) return <section className="page"><div className="notice error">{error}</div></section>;
  if (!result) return null;

  const accepted = result.status === "pending";
  const metrics = result.quality_metrics ?? {};
  const isBaselineCapture = result.capture_mode === "baseline";
  const cumulative = result.opening_since_baseline_mm;
  const cumulativeText = cumulative == null ? "未输出" : `${cumulative >= 0 ? "+" : ""}${cumulative.toFixed(1)} mm`;
  const perPeriod = result.opening_delta_mm;
  const perPeriodText = perPeriod == null ? "—" : `${perPeriod >= 0 ? "+" : ""}${perPeriod.toFixed(1)} mm`;
  const caseBase = result.demo_case_id ? `/demo-cases/${result.demo_case_id}` : null;
  const canRunAIReview = Boolean(result.demo_case_id) || result.capture_mode === "recheck";
  const contextEvidenceSrc = caseBase ? `${caseBase}/context.jpg` : result.context_photo_path;
  const pendingCount = aiReview?.items.filter((item) => item.human_status === "pending").length ?? 0;

  return (
    <section className="page result-page human-result">
      <div className="result-heading">
        <div><p className="eyebrow">定量：OpenCV · 定性：StepFun · 决策：监测员</p><h1>{result.crack_id}</h1><p>公开场景复原与受控变化，非真实监测记录</p></div>
        <span className={`status-pill ${accepted ? "ok" : "warning"}`}>{accepted ? "几何质量通过 · 等待人工确认" : "几何质量未通过 · 请重新拍摄"}</span>
      </div>

      {result.camera_profile_is_demo ? <div className="notice error" role="alert">未标定相机，毫米值仅供参考。</div> : null}

      <div className="result-columns">
        <section className={`geometry-card ${accepted ? "" : "rejected"}`}>
          <p className="eyebrow">几何复测</p>
          {isBaselineCapture ? (
            <>
              <h2>基线已建立</h2>
              <strong className="opening-number">基线已建立</strong>
            </>
          ) : (
            <>
              <h2>较基线累计</h2>
              <strong className="opening-number">{cumulativeText}</strong>
              <p>较上次 {perPeriodText}</p>
              {result.shear_delta_mm != null ? <p>剪切变化 {result.shear_delta_mm >= 0 ? "+" : ""}{result.shear_delta_mm.toFixed(1)} mm</p> : null}
            </>
          )}
          <small>来自视觉标志 + 几何校正，不是大模型估算</small>
          {result.baseline_crack_width_mm != null ? (
            <div className="controlled-width-note">
              <div><span>首次人工建档开度</span><strong>{result.baseline_crack_width_mm.toFixed(1)} mm</strong></div>
              <div><span>换算复测开度</span><strong>{(result.baseline_crack_width_mm + (cumulative ?? 0)).toFixed(1)} mm</strong></div>
              <p>首次开度为人工卷尺记录，仅用于与本系统相对复测结果做延续性参照，不代表系统输出的绝对精度。</p>
            </div>
          ) : null}
          <div className="geometry-proof"><span>标志识别</span><span>正视校正</span><span>质量门控</span></div>
        </section>

        <section className="ai-review-card" aria-live="polite">
          <header><div><p className="eyebrow">AI 现场复核 · 阶跃星辰</p><h2>补充肉眼要看的变化</h2></div>{aiStatus ? <span>{aiStatus.model}</span> : null}</header>
          {result.context_photo_is_stale ? (
            <p className="notice" role="status">
              现场全景已是 {result.context_photo_captured_at?.slice(0, 10)} 拍摄，建议更新后再做 AI 复核。
            </p>
          ) : null}
          {aiBusy ? <div className="ai-loading"><span className="spinner" /><p>正在比较现场全景、上次近景与本次近景…</p></div> : null}
          {!aiBusy && (!aiStatus?.enabled || !aiStatus.configured) ? <div className="ai-unavailable"><strong>AI 现场复核未启用</strong><p>几何测量结果不受影响。</p></div> : null}
          {!aiBusy && aiReview?.status === "failed" ? <div className="ai-unavailable"><strong>AI 现场复核暂不可用</strong><p>{aiReview.error_message} 几何测量结果不受影响。</p><button className="button" type="button" onClick={() => void triggerAIReview()}>重新运行 AI 复核</button></div> : null}
          {!aiBusy && aiReview?.status === "completed" ? <div className="finding-list">
            {aiReview.items.map((item) => <article className={`finding ${item.human_status}`} key={item.id}>
              <div><span className="finding-mark">{item.type === "none" || item.state === "stable" ? "✓" : "!"}</span><div><h3>{OBSERVATION_LABELS[item.type]}</h3><p>{item.edited_evidence ?? item.evidence}</p><small>置信度：{CONFIDENCE_LABELS[item.confidence]} · 必须人工确认</small></div></div>
              <div className="finding-actions">
                {item.human_status === "pending" ? <><button type="button" onClick={() => void decide(item.id, "accepted")}>确认</button><button type="button" onClick={() => void decide(item.id, "rejected")}>不采纳</button></> : <span>{item.human_status === "accepted" ? "已确认" : item.human_status === "rejected" ? "未采纳" : "已编辑确认"}</span>}
              </div>
            </article>)}
            <button className="button text" type="button" onClick={() => void triggerAIReview()}>重新运行 AI 复核</button>
          </div> : null}
          {!aiBusy && !aiReview && aiStatus?.enabled && aiStatus.configured && canRunAIReview ? <button className="button" type="button" onClick={() => void triggerAIReview()}>运行 AI 现场复核</button> : null}
          <p className="ai-boundary">AI 只提供可见变化提示；不估算毫米、不判断风险，所有条目由监测员决定是否写入记录。</p>
        </section>
      </div>

      <section className="three-image-evidence" aria-label="AI 三图输入与几何证据">
        <LoadedEvidence src={contextEvidenceSrc} alt="AI 输入的现场全景" label="图1 · 本次现场全景" onOpen={setPreviewImage} />
        <LoadedEvidence src={caseBase ? `${caseBase}/previous_close.jpg` : result.previous_evidence?.original} alt="AI 输入的上次裂缝近景" label="图2 · 上次裂缝近景" onOpen={setPreviewImage} />
        <LoadedEvidence src={result.evidence.original} alt="AI 输入的本次裂缝近景" label="图3 · 本次裂缝近景" onOpen={setPreviewImage} />
      </section>

      <details className="technical-details"><summary>查看几何技术证据</summary><div className="technical-grid"><dl>
        <div><dt>Marker IDs</dt><dd>{(metrics.marker_ids ?? result.marker_ids ?? []).join(", ")}</dd></div><div><dt>测量模式</dt><dd>{result.measurement_mode}</dd></div><div><dt>检测器</dt><dd>{result.detector_type}</dd></div><div><dt>Homography RMSE</dt><dd>{metrics.homography_rmse_mm == null ? "—" : `${metrics.homography_rmse_mm.toFixed(3)} mm`}</dd></div><div><dt>质量分</dt><dd>{Math.round(result.quality_score * 100)} / 100</dd></div><div><dt>处理时间</dt><dd>{metrics.processing_ms == null ? "—" : `${metrics.processing_ms.toFixed(0)} ms`}</dd></div>
      </dl><div className="technical-images"><LoadedEvidence src={result.evidence.overlay} alt="视觉标志检测叠加图" label="检测叠加" onOpen={setPreviewImage} /><LoadedEvidence src={result.evidence.rectified} alt="墙面正视校正图" label="正视校正" onOpen={setPreviewImage} /></div></div>{result.quality_reasons.map((reason) => <p className="warning-line" key={reason}>! {reason}</p>)}</details>

      {accepted ? <div className="confirm-strip"><label>记录人<input value={observer} onChange={(event) => setObserver(event.target.value)} /></label><label>备注（可选）<input value={remark} onChange={(event) => setRemark(event.target.value)} /></label><p>{aiBusy ? "AI 复核仍在运行，完成或失败后即可生成记录。" : pendingCount > 0 ? `还有 ${pendingCount} 条 AI 提示未处理；未处理项不会写入记录。` : "正式记录只包含几何结果与人工采纳项。"}</p><button className="button primary large" type="button" disabled={busy || aiBusy || !observer.trim()} onClick={() => void confirm()}>{busy ? "正在生成记录…" : "确认并生成记录"}</button></div> : <button className="button primary large" type="button" onClick={() => navigate("/capture?demo=1&case=case_05_quality_fail")}>重新拍摄</button>}
      {error ? <div className="notice error" role="alert">{error}</div> : null}

      {previewImage ? <div className="image-modal" role="dialog" aria-modal="true" aria-label="影像证据放大查看" onClick={() => setPreviewImage(null)}><button type="button" onClick={() => setPreviewImage(null)}>关闭</button><img src={previewImage.src} alt={previewImage.alt} onClick={(event) => event.stopPropagation()} /></div> : null}
    </section>
  );
}
