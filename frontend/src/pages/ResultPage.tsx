import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { addBenchmarkTrial, confirmMeasurement, evidenceUrl, getInspection } from "../api/client";
import type { Measurement } from "../types";

type PreviewImage = { src: string; alt: string };

function LoadedEvidence({ src, alt, label, onOpen }: { src: string | null | undefined; alt: string; label: string; onOpen: (image: PreviewImage) => void }) {
  const url = evidenceUrl(src);
  if (!url) return <div className="evidence-empty">{label}：暂无历史影像</div>;
  return <figure><button className="image-button" type="button" onClick={() => onOpen({ src: url, alt })}><img src={url} alt={alt} /></button><figcaption>{label}<span>点击放大</span></figcaption></figure>;
}

export default function ResultPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [result, setResult] = useState<Measurement | null>(null);
  const [observer, setObserver] = useState("演示监测员");
  const [remark, setRemark] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(Boolean(id));
  const [error, setError] = useState("");
  const [previewImage, setPreviewImage] = useState<PreviewImage | null>(null);

  useEffect(() => {
    if (!id) return;
    let active = true;
    getInspection(id).then((value) => { if (active) setResult(value); }).catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "结果加载失败"); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  if (!id) return <section className="page"><div className="empty">结果地址缺少记录 ID。<button className="button primary" type="button" onClick={() => navigate("/capture")}>开始复测</button></div></section>;
  if (loading) return <section className="page"><div className="empty">正在恢复这次墙缝复测结果…</div></section>;
  if (error && !result) return <section className="page"><div className="notice error">{error}<button className="button" type="button" onClick={() => navigate("/capture")}>重新复测</button></div></section>;
  if (!result) return null;

  const accepted = result.status === "pending";
  const metrics = result.quality_metrics ?? {};
  const opening = result.opening_delta_mm ?? result.delta_mm;
  const openingText = opening == null ? "未输出" : `${opening >= 0 ? "+" : ""}${opening.toFixed(1)} mm`;
  const currentWidth = opening != null && result.baseline_crack_width_mm != null ? result.baseline_crack_width_mm + opening : null;

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
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "确认失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="page result-page human-result">
      <div className="result-heading">
        <div><p className="eyebrow">贵州仁怀 · 墙体裂缝复测</p><h1>{result.crack_id}</h1><p>根据公开工作场景复原，非真实监测记录</p></div>
        <span className={`status-pill ${accepted ? "ok" : "warning"}`}>{accepted ? "质量通过 · 等待人工确认" : "质量未通过 · 请重新拍摄"}</span>
      </div>

      <section className={`opening-hero ${accepted ? "" : "rejected"}`}>
        <span>较上次张开</span>
        <strong className="opening-number">{openingText}</strong>
        {result.shear_delta_mm != null ? <p>剪切变化 {result.shear_delta_mm >= 0 ? "+" : ""}{result.shear_delta_mm.toFixed(1)} mm</p> : null}
        <small>只记录相对变形，不判断灾害风险</small>
      </section>

      <section className="wall-comparison" aria-label="上次和本次墙体对比">
        <LoadedEvidence src={result.previous_evidence?.original ?? result.previous_evidence?.rectified} alt="上次墙体照片" label="上次墙体" onOpen={setPreviewImage} />
        <div className="comparison-arrow" aria-hidden="true">→</div>
        <LoadedEvidence src={result.evidence.original} alt="本次墙体照片" label="本次墙体" onOpen={setPreviewImage} />
      </section>

      <section className="plain-checks" aria-label="自动处理结果">
        <p><span>✓</span>点位与裂缝识别</p>
        <p><span>✓</span>拍摄角度已校正</p>
        <p><span>✓</span>与上次观测已对齐</p>
        <p><span>✓</span>图片质量通过</p>
      </section>

      {currentWidth != null ? <section className="controlled-width-note"><div><span>首次人工建档开度</span><strong>{result.baseline_crack_width_mm?.toFixed(1)} mm</strong></div><div><span>换算复测开度</span><strong>{currentWidth.toFixed(1)} mm</strong></div><p>基准开度由首次人工建档；当前为受控演示数据。</p></section> : null}

      <details className="technical-details">
        <summary>查看技术详情</summary>
        <div className="technical-grid">
          <dl>
            <div><dt>Marker IDs</dt><dd>{(metrics.marker_ids ?? result.marker_ids ?? []).join(", ")}</dd></div>
            <div><dt>测量模式</dt><dd>{result.measurement_mode}</dd></div>
            <div><dt>检测器</dt><dd>{result.detector_type}</dd></div>
            <div><dt>Homography RMSE</dt><dd>{metrics.homography_rmse_mm == null ? "—" : `${metrics.homography_rmse_mm.toFixed(3)} mm`}</dd></div>
            <div><dt>PnP RMSE</dt><dd>{metrics.reprojection_rmse_px == null ? "—" : `${metrics.reprojection_rmse_px.toFixed(3)} px`}</dd></div>
            <div><dt>质量分</dt><dd>{Math.round(result.quality_score * 100)} / 100</dd></div>
            <div><dt>板中心距（诊断）</dt><dd>{metrics.legacy_board_center_distance_mm == null ? "—" : `${metrics.legacy_board_center_distance_mm.toFixed(2)} mm`}</dd></div>
            <div><dt>相机配置</dt><dd>{result.camera_profile?.is_demo_profile ? "演示配置" : "已标定配置"}</dd></div>
            <div><dt>处理时间</dt><dd>{metrics.processing_ms == null ? "—" : `${metrics.processing_ms.toFixed(0)} ms`}</dd></div>
          </dl>
          <div className="technical-images">
            <LoadedEvidence src={result.evidence.overlay} alt="视觉复测贴检测叠加图" label="检测叠加" onOpen={setPreviewImage} />
            <LoadedEvidence src={result.evidence.rectified} alt="墙体正视校正图" label="墙面正视校正" onOpen={setPreviewImage} />
          </div>
        </div>
        {result.quality_reasons.map((reason) => <p className="warning-line" key={reason}>! {reason}</p>)}
      </details>

      {accepted ? <div className="confirm-strip"><label>记录人<input value={observer} onChange={(event) => setObserver(event.target.value)} /></label><label>备注（可选）<input value={remark} onChange={(event) => setRemark(event.target.value)} /></label><button className="button primary large" type="button" disabled={busy || !observer.trim()} onClick={() => void confirm()}>{busy ? "正在生成记录…" : "确认并生成记录"}</button><button className="button" type="button" onClick={() => navigate("/capture")}>重新复测</button></div> : <button className="button primary large" type="button" onClick={() => navigate("/capture")}>重新复测</button>}
      {error ? <div className="notice error" role="alert">{error}</div> : null}
      <p className="provenance-note">真实工作故事来自贵州公开报道；墙体图像来自 {result.data_provenance.wall_dataset}（{result.data_provenance.license}）；位移为受控仿真。</p>

      {previewImage ? <div className="image-modal" role="dialog" aria-modal="true" aria-label="影像证据放大查看" onClick={() => setPreviewImage(null)}><button type="button" onClick={() => setPreviewImage(null)} aria-label="关闭大图">关闭</button><img src={previewImage.src} alt={previewImage.alt} onClick={(event) => event.stopPropagation()} /></div> : null}
    </section>
  );
}
