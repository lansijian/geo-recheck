import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { evidenceUrl, getPoint, getPointHistory, stickerPdfUrl, uploadContextPhoto } from "../api/client";
import type { Measurement, Point } from "../types";

const BASELINE_LABELS: Record<Point["baseline_status"], string> = {
  missing: "未建档",
  confirmed: "已建档",
};

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
      .then(([pointData, historyData]) => {
        setPoint(pointData);
        setHistory(historyData);
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "监测点加载失败。"));
  }

  useEffect(() => {
    if (!monitorPointId) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monitorPointId]);

  async function handleContextPhoto(file: File | null) {
    if (!file || !point) return;
    setPhotoBusy(true);
    setError("");
    try {
      setPoint(await uploadContextPhoto(point.monitor_point_id, file));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "现场全景上传失败。");
    } finally {
      setPhotoBusy(false);
    }
  }

  if (error && !point) return <section className="page"><div className="notice error" role="alert">{error}</div></section>;
  if (!point) return <section className="page"><div className="empty">正在加载监测点…</div></section>;

  const confirmedHistory = history
    .filter((item) => item.human_confirmed)
    .sort((a, b) => (a.capture_time < b.capture_time ? 1 : -1));
  const contextPhotoUrl = evidenceUrl(point.context_photo_path);

  return (
    <section className="page point-detail-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{point.hazard_name} · {point.structure_name}</p>
          <h1>{point.monitor_point_id}</h1>
          <p>{point.monitor_point_name} · {point.location_description}</p>
        </div>
        <span className={`baseline-badge ${point.baseline_status}`} data-testid="baseline-status">
          {BASELINE_LABELS[point.baseline_status]}
        </span>
      </div>

      {error ? <div className="notice error" role="alert">{error}</div> : null}

      <div className="point-detail-columns">
        <section className="point-detail-card">
          <p className="eyebrow">复测贴标靶</p>
          <p data-testid="marker-ids">
            左 {point.left_marker_group.join(", ")} / 右 {point.right_marker_group.join(", ")}
          </p>
          <a className="button" href={stickerPdfUrl(point.monitor_point_id)}>下载复测贴 PDF</a>
        </section>

        <section className="point-detail-card">
          <p className="eyebrow">现场全景</p>
          {contextPhotoUrl ? <img className="context-photo-thumb" src={contextPhotoUrl} alt="现场全景缩略图" /> : <div className="empty">尚未上传现场全景</div>}
          {point.context_photo_is_stale ? (
            <p className="notice" role="status">
              现场全景已是 {point.context_photo_captured_at?.slice(0, 10)} 拍摄，建议更新后再做 AI 复核。
            </p>
          ) : null}
          <label className="button upload-primary">
            {photoBusy ? "正在上传…" : "更新现场全景"}
            <input
              type="file"
              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
              disabled={photoBusy}
              onChange={(event) => { const file = event.target.files?.[0] ?? null; event.currentTarget.value = ""; void handleContextPhoto(file); }}
            />
          </label>
        </section>

        <section className="point-detail-card">
          <p className="eyebrow">下一步</p>
          {point.baseline_status === "confirmed"
            ? <Link className="button primary large" to={`/capture?point=${point.monitor_point_id}&mode=recheck`}>开始复测</Link>
            : <Link className="button primary large" to={`/capture?point=${point.monitor_point_id}&mode=baseline`}>采集基线</Link>}
        </section>
      </div>

      <section className="point-history">
        <p className="eyebrow">复测记录</p>
        {confirmedHistory.length === 0
          ? <div className="empty">暂无已确认的复测记录。</div>
          : (
            <ul className="point-history-list">
              {confirmedHistory.map((item) => (
                <li key={item.id}>
                  <span>{new Date(item.capture_time).toLocaleString("zh-CN", { hour12: false })}</span>
                  <span>较基线累计 {formatMm(item.opening_since_baseline_mm)}</span>
                  <span>较上次 {formatMm(item.opening_delta_mm)}</span>
                </li>
              ))}
            </ul>
          )}
      </section>
    </section>
  );
}
