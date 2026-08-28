import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { evidenceUrl, getPoint, getPointHistory, stickerPdfUrl, uploadContextPhoto } from "../api/client";
import type { Measurement, Point } from "../types";

const BASELINE_LABELS: Record<Point["baseline_status"], string> = {
  missing: "基线待建立",
  confirmed: "可进行周期复测",
};

const LIFECYCLE = [
  ["01", "安装复测贴", "下载并固定左右两组 Marker"],
  ["02", "建立基线", "上传现场全景并确认首次近景"],
  ["03", "基线已建立", "固定同一监测对象与几何基准"],
  ["04", "周期复测", "累计、环比、AI 与人工留痕"],
] as const;

function formatMm(value: number | null): string {
  return value == null ? "—" : `${value >= 0 ? "+" : ""}${value.toFixed(1)} mm`;
}

export default function PointDetailPage() {
  const { monitorPointId = "" } = useParams();
  const [point, setPoint] = useState<Point | null>(null);
  const [history, setHistory] = useState<Measurement[]>([]);
  const [error, setError] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);

  function load() {
    setError("");
    Promise.all([getPoint(monitorPointId), getPointHistory(monitorPointId)])
      .then(([pointData, historyData]) => { setPoint(pointData); setHistory(historyData); })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "监测点加载失败。"));
  }

  useEffect(() => {
    if (!monitorPointId) return;
    load();
    // monitorPointId is the only request identity; load intentionally refreshes both resources.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monitorPointId]);

  async function handleContextPhoto(file: File | null) {
    if (!file || !point) return;
    setPhotoBusy(true);
    setError("");
    try { setPoint(await uploadContextPhoto(point.monitor_point_id, file)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "现场全景上传失败。"); }
    finally { setPhotoBusy(false); }
  }

  if (error && !point) return <section className="page"><div className="notice error" role="alert">{error}</div></section>;
  if (!point) return <section className="page"><div className="empty">正在加载监测点…</div></section>;

  const confirmedHistory = history.filter((item) => item.human_confirmed).sort((a, b) => (a.capture_time < b.capture_time ? 1 : -1));
  const contextPhotoUrl = evidenceUrl(point.context_photo_path);
  const latest = confirmedHistory[0] ?? null;
  const hasBaseline = point.baseline_status === "confirmed";
  const lifecycleStep = !contextPhotoUrl ? 0 : !hasBaseline ? 1 : confirmedHistory.length <= 1 ? 2 : 3;

  return (
    <section className="page point-detail-page">
      <div className="page-heading">
        <div><p className="eyebrow">{point.hazard_name} · {point.structure_name}</p><h1>{point.monitor_point_name}</h1><p>{point.monitor_point_id} · {point.location_description}</p></div>
        <span className={`baseline-badge ${point.baseline_status}`} data-testid="baseline-status">{BASELINE_LABELS[point.baseline_status]}</span>
      </div>

      {error ? <div className="notice error" role="alert">{error}</div> : null}

      <section className="point-lifecycle" aria-label="点位生命周期">
        {LIFECYCLE.map(([index, title, description], step) => (
          <div className={step < lifecycleStep ? "done" : step === lifecycleStep ? "current" : ""} key={index}>
            <span>{step < lifecycleStep ? "✓" : index}</span><strong>{title}</strong><small>{description}</small>
          </div>
        ))}
      </section>

      <section className="point-workbench-metrics" aria-label="点位最新状态">
        <div><span>较基线累计张开</span><strong>{latest?.capture_mode === "recheck" ? formatMm(latest.opening_since_baseline_mm) : "—"}</strong><small>主指标 · 从首次确认基线起</small></div>
        <div><span>较上次张开</span><strong>{latest?.capture_mode === "recheck" ? formatMm(latest.opening_delta_mm) : "—"}</strong><small>辅助指标 · 以上次已确认记录为准</small></div>
        <div><span>最近确认</span><strong className="metric-text">{latest ? new Date(latest.capture_time).toLocaleDateString("zh-CN") : "暂无记录"}</strong><small>{latest?.observer_name ? `监测员：${latest.observer_name}` : "等待首次人工确认"}</small></div>
      </section>

      <div className="point-workbench-grid">
        <section className="point-detail-card identity-card">
          <p className="eyebrow">点位身份与监测对象</p>
          <dl className="point-facts">
            <div><dt>隐患点</dt><dd>{point.hazard_name}（{point.hazard_id}）</dd></div><div><dt>构筑物</dt><dd>{point.structure_name}（{point.structure_id}）</dd></div>
            <div><dt>固定点位</dt><dd>{point.monitor_point_id}</dd></div><div><dt>位置</dt><dd>{point.location_description}</dd></div>
            <div><dt>坐标</dt><dd>{point.latitude == null || point.longitude == null ? "未录入" : `${point.latitude.toFixed(6)}, ${point.longitude.toFixed(6)}`}</dd></div>
          </dl>
        </section>

        <section className="point-detail-card marker-card">
          <p className="eyebrow">复测贴与 Marker 分配</p>
          <p className="marker-readout" data-testid="marker-ids"><span>左板<strong>{point.left_marker_group.join(" · ")}</strong></span><span>右板<strong>{point.right_marker_group.join(" · ")}</strong></span></p>
          <p className="muted">8 枚 Marker 已唯一绑定到本点位，测量时自动识别归属。</p>
          <a className="button" href={stickerPdfUrl(point.monitor_point_id)}>下载复测贴 PDF</a>
        </section>

        <section className="point-detail-card">
          <p className="eyebrow">现场全景</p>
          {contextPhotoUrl ? <img className="context-photo-thumb" src={contextPhotoUrl} alt="现场全景缩略图" /> : <div className="empty">尚未上传现场全景</div>}
          {point.context_photo_is_stale ? <p className="notice" role="status">现场全景拍摄于 {point.context_photo_captured_at?.slice(0, 10)}，建议更新后再做 AI 复核。</p> : null}
          <label className="button upload-primary">{photoBusy ? "正在上传…" : "更新现场全景"}<input type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" disabled={photoBusy} onChange={(event) => { const file = event.target.files?.[0] ?? null; event.currentTarget.value = ""; void handleContextPhoto(file); }} /></label>
        </section>

        <section className="point-detail-card action-card">
          <p className="eyebrow">现场下一步</p>
          {hasBaseline ? <Link className="button primary large" to={`/capture?point=${point.monitor_point_id}&mode=recheck`}>开始复测</Link> : <Link className="button primary large" to={`/capture?point=${point.monitor_point_id}&mode=baseline`}>采集基线</Link>}
          <p>{hasBaseline ? "拍摄本次近景，系统将同时给出较基线累计值与较上次变化。" : "请先安装复测贴、上传现场全景，再拍摄并人工确认首次基线。"}</p>
        </section>
      </div>

      <section className="point-history">
        <div className="section-heading"><div><p className="eyebrow">复测记录</p><h2>已确认历史</h2></div><span>未确认或质量不通过的拍摄不会成为下一期基准</span></div>
        {confirmedHistory.length === 0 ? <div className="empty">暂无已确认的复测记录。</div> : <ul className="point-history-list">{confirmedHistory.map((item) => (
          <li key={item.id}><span>{new Date(item.capture_time).toLocaleString("zh-CN", { hour12: false })}</span><span>{item.observer_name ?? "—"}</span><span>较基线累计 {formatMm(item.opening_since_baseline_mm)}</span><span>较上次 {formatMm(item.opening_delta_mm)}</span>{item.camera_profile_is_demo ? <span className="notice error compact" role="alert">未标定相机，毫米值仅供参考。</span> : null}</li>
        ))}</ul>}
      </section>
    </section>
  );
}
