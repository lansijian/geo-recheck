import { useEffect, useMemo, useState } from "react";
import { calibrateCamera, getCameraProfile, type CameraProfile } from "../api/client";

function matrixValue(profile: CameraProfile | null, row: number, column: number): string {
  const value = profile?.camera_matrix?.[row]?.[column];
  return value == null ? "—" : value.toFixed(3);
}

export default function CalibrationPage() {
  const [profile, setProfile] = useState<CameraProfile | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const previews = useMemo(() => files.map((file) => ({ file, url: URL.createObjectURL(file) })), [files]);

  useEffect(() => { void getCameraProfile().then(setProfile); }, []);
  useEffect(() => () => previews.forEach((item) => URL.revokeObjectURL(item.url)), [previews]);

  async function submitCalibration() {
    setBusy(true);
    setMessage("");
    try {
      const calibrated = await calibrateCamera(files);
      setProfile(calibrated);
      setMessage(`标定完成：重投影误差 ${calibrated.rms_reprojection_error_px?.toFixed(3)} px。`);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : "标定失败");
    } finally {
      setBusy(false);
    }
  }

  const distortion = profile?.distortion_coefficients?.flat?.() ?? profile?.distortion_coefficients ?? [];

  return (
    <section className="page calibration-page">
      <div className="page-heading"><div><p className="eyebrow">实拍前置条件</p><h1>相机标定</h1><p>当前配置：{profile?.name ?? "读取中…"} · {profile?.calibration_image_size?.join("×") ?? "—"}</p></div><span className={`status-pill ${profile?.is_demo_profile === false ? "ok" : "warning"}`}>{profile?.is_demo_profile === false ? "实拍配置已保存" : "实拍标定待完成"}</span></div>
      <div className="calibration-grid">
        <article><span>01</span><h2>打印 ChArUco 标定板</h2><p>必须按 100% 比例打印并用直尺核验尺寸，平整固定。</p><a className="button" href="/calibration-assets/charuco_7x5_print_100_percent.pdf" target="_blank" rel="noreferrer">打开可打印 PDF</a></article>
        <article><span>02</span><h2>采集 12–20 个视角</h2><p>覆盖画面四角、远近和倾斜角度；避免模糊与反光。</p></article>
        <article><span>03</span><h2>计算并核验重投影误差</h2><p>保存 fx、fy、cx、cy 与畸变系数；RMSE 超过 2 px 时拒绝覆盖。</p></article>
      </div>

      <section className="calibration-workspace">
        <div className="calibration-upload">
          <label>上传同一分辨率的标定照片<input data-testid="calibration-input" type="file" accept="image/*" multiple onChange={(event) => { setFiles(Array.from(event.target.files ?? [])); setMessage(""); }} /></label>
          <span>已选择 {files.length} 张</span>
          <button className="button primary" type="button" disabled={busy || files.length < 10} onClick={() => void submitCalibration()}>{busy ? "正在计算…" : "开始标定"}</button>
        </div>
        {previews.length ? <div className="calibration-previews">{previews.map(({ file, url }) => <figure key={`${file.name}-${file.lastModified}`}><img src={url} alt={`标定照片 ${file.name}`} /><figcaption>{file.name}</figcaption></figure>)}</div> : <div className="inline-empty calibration-empty"><strong>尚未上传标定照片</strong><span>建议上传 12–20 张不同距离、不同角度且分辨率一致的照片。</span></div>}
      </section>

      <section className="calibration-result">
        <div><span>fx</span><strong>{matrixValue(profile, 0, 0)}</strong></div>
        <div><span>fy</span><strong>{matrixValue(profile, 1, 1)}</strong></div>
        <div><span>cx</span><strong>{matrixValue(profile, 0, 2)}</strong></div>
        <div><span>cy</span><strong>{matrixValue(profile, 1, 2)}</strong></div>
        <div className="wide"><span>Distortion</span><strong>{distortion.length ? Array.from(distortion as number[]).map((value) => Number(value).toFixed(5)).join(", ") : "—"}</strong></div>
        <div><span>Reprojection RMSE</span><strong>{profile?.rms_reprojection_error_px == null ? "尚未实拍标定" : `${profile.rms_reprojection_error_px.toFixed(3)} px`}</strong></div>
        <div><span>状态</span><strong>{profile?.is_demo_profile === false ? "合格并已保存" : "Demo Profile · 待标定"}</strong></div>
      </section>
      {message ? <div className={`notice ${message.includes("完成") ? "neutral" : "error"}`} role="status">{message}</div> : null}
      <div className="notice neutral">标定成功后保存到 data/camera_profiles/default_camera.json。真实测量仍须用已知位移做实拍验证。</div>
    </section>
  );
}
