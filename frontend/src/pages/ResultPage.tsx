import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { addBenchmarkTrial, confirmMeasurement, evidenceUrl, getInspection } from "../api/client";
import type { Measurement } from "../types";

type PreviewImage = { src: string; alt: string };

function EvidenceFigure({ src, alt, label, onOpen }: PreviewImage & { label: string; onOpen: (image: PreviewImage) => void }) {
  const url = evidenceUrl(src);
  if (!url) return <div className="evidence-empty">{label}：暂无证据图</div>;
  return (
    <figure className="evidence-figure">
      <button type="button" className="image-button" onClick={() => onOpen({ src: url, alt })} aria-label={`放大${label}`}>
        <img src={url} alt={alt} />
      </button>
      <figcaption>{label}<span>点击放大</span></figcaption>
    </figure>
  );
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
    setLoading(true);
    getInspection(id)
      .then((value) => { if (active) setResult(value); })
      .catch((reason: unknown) => { if (active) setError(reason instanceof Error ? reason.message : "结果加载失败"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  if (!id) return <section className="page"><div className="empty">结果地址缺少记录 ID。<button className="button primary" type="button" onClick={() => navigate("/capture")}>开始复测</button></div></section>;
  if (loading) return <section className="page"><div className="empty">正在从本地数据库读取测量结果…</div></section>;
  if (error && !result) return <section className="page"><div className="notice error">{error}<button className="button" type="button" onClick={() => navigate("/capture")}>重新测量</button></div></section>;
  if (!result) return null;

  const accepted = result.status === "pending";
  const metrics = result.quality_metrics ?? {};
  const markerCount = metrics.marker_count ?? metrics.marker_ids?.length ?? result.marker_ids?.length ?? 0;
  const deltaText = result.delta_mm == null ? "未输出" : `${result.delta_mm >= 0 ? "+" : ""}${result.delta_mm.toFixed(1)} mm`;

  async function confirm() {
    const current = result;
    if (!current) return;
    setBusy(true);
    setError("");
    try {
      const confirmed = await confirmMeasurement(current.id, observer, remark);
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
    <section className="page result-page">
      <div className="result-heading">
        <div><p className="eyebrow">监测点 {result.monitor_point_id} · {result.structure_id}</p><h1>复测结果与影像证据</h1></div>
        <span className={`status-pill ${accepted ? "ok" : "warning"}`}>{accepted ? "质量通过 · 等待人工确认" : "质量未通过 · 请重新拍摄"}</span>
      </div>

      <section className={`measurement-hero ${accepted ? "" : "rejected"}`}>
        <div><span>上一期</span><strong>{result.previous_distance_mm?.toFixed(1) ?? "—"} mm</strong></div>
        <div className="delta-focus"><span>相对位移变化</span><strong>{deltaText}</strong><small>不判断灾害风险</small></div>
        <div><span>本次</span><strong>{result.current_distance_mm?.toFixed(1) ?? "—"} mm</strong></div>
      </section>

      <section className="evidence-stage" aria-label="本次影像证据">
        <EvidenceFigure src={result.evidence.original ?? ""} alt="本次上传的原始照片" label="原始照片" onOpen={setPreviewImage} />
        <EvidenceFigure src={result.evidence.overlay ?? ""} alt="AprilTag 检测叠加图" label="检测叠加图" onOpen={setPreviewImage} />
        <EvidenceFigure src={result.evidence.rectified ?? ""} alt="左右视觉标靶正视化图" label="正视化证据" onOpen={setPreviewImage} />
      </section>

      <div className="result-details">
        <section className="identity-card">
          <h2>自动识别</h2>
          <div className="recognition-checks">
            <p>✓ 左侧标靶 {metrics.marker_ids?.filter((value) => value >= 301 && value <= 304).length ?? Math.min(markerCount, 4)}/4</p>
            <p>✓ 右侧标靶 {metrics.marker_ids?.filter((value) => value >= 305 && value <= 308).length ?? Math.max(0, markerCount - 4)}/4</p>
            <p>✓ 监测点 {result.monitor_point_id}</p>
            <p>✓ 构筑物 {result.structure_id}</p>
            <p>{result.location_match ? "✓" : "!"} 位置校验{result.location_match ? "通过" : "需确认"}</p>
          </div>
        </section>
        <section className="verification-card">
          <h2>质量与几何</h2>
          <dl className="metric-list">
            <div><dt>图像质量</dt><dd>{Math.round(result.quality_score * 100)} / 100</dd></div>
            <div><dt>标靶</dt><dd>{markerCount} / 8</dd></div>
            <div><dt>最大角度</dt><dd>{metrics.view_angle_deg == null ? "—" : `${metrics.view_angle_deg.toFixed(1)}°`}</dd></div>
            <div><dt>PnP RMSE</dt><dd>{metrics.reprojection_rmse_px == null ? "—" : `${metrics.reprojection_rmse_px.toFixed(3)} px`}</dd></div>
            <div><dt>最小标靶边长</dt><dd>{metrics.min_marker_edge_px == null ? "—" : `${metrics.min_marker_edge_px.toFixed(1)} px`}</dd></div>
            <div><dt>相机</dt><dd>{result.camera_profile?.name ?? "已保存配置"}</dd></div>
          </dl>
          {result.camera_profile?.is_demo_profile ? <p className="warning-line">! Demo Profile：实拍毫米结果须先完成相机标定。</p> : null}
          {result.quality_reasons.map((reason) => <p className="warning-line" key={reason}>! {reason}</p>)}
        </section>
      </div>

      {accepted ? (
        <div className="confirm-strip">
          <label>记录人<input value={observer} onChange={(event) => setObserver(event.target.value)} /></label>
          <label>备注（可选）<input value={remark} onChange={(event) => setRemark(event.target.value)} /></label>
          <button className="button primary large" type="button" disabled={busy || !observer.trim()} onClick={() => void confirm()}>{busy ? "正在保存…" : "确认结果并生成记录"}</button>
          <button className="button" type="button" onClick={() => navigate("/capture")}>重新测量</button>
        </div>
      ) : <button className="button primary large" type="button" onClick={() => navigate("/capture")}>重新测量</button>}
      {error ? <div className="notice error" role="alert">{error}</div> : null}

      {previewImage ? (
        <div className="image-modal" role="dialog" aria-modal="true" aria-label="影像证据放大查看" onClick={() => setPreviewImage(null)}>
          <button type="button" onClick={() => setPreviewImage(null)} aria-label="关闭大图">关闭</button>
          <img src={previewImage.src} alt={previewImage.alt} onClick={(event) => event.stopPropagation()} />
        </div>
      ) : null}
    </section>
  );
}
