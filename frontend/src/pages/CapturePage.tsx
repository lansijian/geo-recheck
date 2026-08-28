import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { measureImage } from "../api/client";

type FileDetails = { name: string; width: number; height: number; size: number; type: string };

const PROCESSING_STEPS = [
  "识别裂缝编号",
  "自动修正拍摄角度",
  "与上次观测对齐",
  "计算相对张开",
  "自动生成记录字段",
];
const MAX_BYTES = 20 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const ACCEPTED_EXTENSIONS = /\.(jpe?g|png|webp)$/i;

function formatBytes(value: number): string {
  return value >= 1024 * 1024 ? `${(value / 1024 / 1024).toFixed(1)} MB` : `${Math.round(value / 1024)} KB`;
}

function requestLocation(): Promise<{ latitude: number; longitude: number } | undefined> {
  if (!navigator.geolocation) return Promise.resolve(undefined);
  return new Promise((resolve) => navigator.geolocation.getCurrentPosition(
    (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
    () => resolve(undefined),
    { timeout: 2500 },
  ));
}

export default function CapturePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isDemo = searchParams.get("demo") === "1";
  const [file, setFile] = useState<Blob | null>(null);
  const [details, setDetails] = useState<FileDetails | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [processingStep, setProcessingStep] = useState(-1);
  const [stage, setStage] = useState("等待墙体照片");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);
  const demoStartedRef = useRef(false);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
  }, []);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  async function prepareFile(blob: Blob, name: string) {
    const type = blob.type || (name.match(/\.png$/i) ? "image/png" : "image/jpeg");
    if ((!ACCEPTED_TYPES.has(type) && !ACCEPTED_EXTENSIONS.test(name)) || blob.size > MAX_BYTES) {
      throw new Error(blob.size > MAX_BYTES ? "图片不能超过 20 MB。" : "仅支持 JPG、JPEG、PNG、WebP 图片。");
    }
    const url = URL.createObjectURL(blob);
    const image = new Image();
    const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error("图片读取失败。"));
      image.src = url;
    });
    if (preview) URL.revokeObjectURL(preview);
    setFile(blob instanceof File ? blob : new File([blob], name, { type }));
    setDetails({ name, size: blob.size, type, ...dimensions });
    setPreview(url);
    setStage("墙体照片已就绪");
  }

  async function handleSelected(selected?: File) {
    if (!selected) return;
    setError("");
    try { await prepareFile(selected, selected.name); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "图片读取失败。"); }
  }

  async function startCamera() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraActive(true);
      setStage("摄像头已启动，请让左右复测贴完整入镜");
    } catch {
      setError("无法启用摄像头，请检查浏览器权限或使用上传照片。");
    }
  }

  function captureFrame() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) void prepareFile(blob, `wall-recheck-${Date.now()}.png`).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "拍摄失败"));
    }, "image/png");
  }

  async function submitBlob(blob: Blob) {
    setBusy(true);
    setError("");
    setProcessingStep(0);
    setStage("正在识别 CRACK-W01…");
    timerRef.current = window.setInterval(() => setProcessingStep((value) => Math.min(4, value + 1)), 230);
    try {
      const location = isDemo ? undefined : await requestLocation();
      const result = await measureImage(blob, location);
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      timerRef.current = null;
      setProcessingStep(5);
      setStage("复测完成，正在打开结果");
      await new Promise((resolve) => window.setTimeout(resolve, 280));
      navigate(`/result/${result.id}`);
    } catch (reason) {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      timerRef.current = null;
      setError(reason instanceof Error ? reason.message : "测量失败，请重新拍摄。");
      setStage("处理失败");
      setProcessingStep(-1);
    } finally {
      setBusy(false);
    }
  }

  async function loadDemoSample(autoSubmit = false) {
    setError("");
    setStage("正在加载公开墙面场景复原…");
    const response = await fetch("/wall-assets/current_open_5mm_yaw20.png");
    if (!response.ok) throw new Error("墙体演示样本不可用，请先运行 scripts\\generate_wall_recheck_demo.py。");
    const blob = await response.blob();
    const named = new File([blob], "current_open_5mm_yaw20.png", { type: "image/png" });
    await prepareFile(named, named.name);
    if (autoSubmit) {
      await new Promise((resolve) => window.setTimeout(resolve, 700));
      await submitBlob(named);
    }
  }

  useEffect(() => {
    if (!isDemo || demoStartedRef.current) return;
    demoStartedRef.current = true;
    void loadDemoSample(true).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : "一分钟演示启动失败。");
      setStage("演示失败");
    });
  }, [isDemo]);

  function clearFile() {
    if (preview) URL.revokeObjectURL(preview);
    setFile(null);
    setDetails(null);
    setPreview(null);
    setStage("等待墙体照片");
    setProcessingStep(-1);
  }

  return (
    <section className="page capture-page wall-capture">
      <div className="page-heading compact">
        <div><p className="eyebrow">贵州仁怀 · 公开工作场景复原</p><h1>{isDemo ? "一分钟演示：复测这条墙缝" : "拍摄墙体裂缝复测照片"}</h1><p>裂缝编号 CRACK-W01 · 左右视觉复测贴属于同一墙面</p></div>
        <span className="demo-mode-label">演示模式</span>
      </div>

      <div className="capture-primary-actions" aria-label="照片来源">
        <button className="button large" type="button" onClick={startCamera}>使用摄像头</button>
        <label className="button primary large upload-primary">上传墙体照片<input data-testid="photo-input" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" onChange={(event) => { const selected = event.target.files?.[0]; event.currentTarget.value = ""; void handleSelected(selected); }} /></label>
      </div>

      <div className="capture-layout">
        <div className={`camera-panel wall-photo-panel drop-zone ${dragging ? "dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); void handleSelected(event.dataTransfer.files?.[0]); }}>
          {preview ? <img data-testid="upload-preview" src={preview} alt="真实建筑墙面裂缝与左右视觉复测贴" /> : <video ref={videoRef} autoPlay playsInline muted aria-label="摄像头实时画面" />}
          {!preview && !cameraActive ? <div className="camera-empty"><strong>让墙缝和左右复测贴完整入镜</strong><small>拖拽或上传 JPG、PNG、WebP，最大 20 MB</small></div> : null}
          {preview ? <span className="sticker-visible-badge" data-testid="recheck-sticker-indicator">左右视觉复测贴可见</span> : null}
          {busy ? <div className="processing-overlay" role="status"><span className="spinner" /><strong>{stage}</strong><small>确定性几何测量 · 不进行风险预测</small></div> : null}
        </div>

        <aside className="capture-checks human-steps">
          <p className="eyebrow">系统正在替他完成</p>
          <ol>
            {PROCESSING_STEPS.map((label, index) => (
              <li key={label} className={processingStep > index ? "done" : processingStep === index ? "active" : "pending"}>
                <span>{processingStep > index ? "✓" : `0${index + 1}`}</span><strong>{label}</strong>
              </li>
            ))}
          </ol>
          {details ? <dl className="file-details" data-testid="file-details"><div><dt>照片</dt><dd>{details.name}</dd></div><div><dt>分辨率</dt><dd>{details.width} × {details.height}</dd></div><div><dt>大小</dt><dd>{formatBytes(details.size)}</dd></div></dl> : <div className="inline-empty">等待墙体照片</div>}
          <div className="capture-actions">
            {cameraActive && !preview ? <button className="button" type="button" onClick={captureFrame}>拍摄当前画面</button> : null}
            {!isDemo ? <button className="button text" type="button" disabled={busy} onClick={() => void loadDemoSample(false).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "样本加载失败"))}>加载受控墙体样本</button> : null}
            {preview ? <button className="button text" type="button" disabled={busy} onClick={clearFile}>清除并重拍</button> : null}
          </div>
        </aside>
      </div>
      {error ? <div className="notice error" role="alert">{error}</div> : null}
      <div className="sticky-submit"><p><strong>{stage}</strong><br />质量不合格时不输出可确认的毫米变化。</p><button className="button primary large" type="button" onClick={() => file && void submitBlob(file)} disabled={!file || busy}>{busy ? "正在自动复测…" : "开始复测"}</button></div>
      <p className="provenance-note">墙体图片来自 Özgenel CC BY 4.0 公开建筑裂缝数据；位移为受控仿真；非真实贵州监测记录。</p>
    </section>
  );
}
