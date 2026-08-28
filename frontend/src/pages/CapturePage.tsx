import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { measureImage } from "../api/client";

type Location = { latitude: number; longitude: number };
type FileDetails = { name: string; width: number; height: number; size: number; type: string };

const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_FILE_BYTES = 20 * 1024 * 1024;

function requestLocation(): Promise<Location | undefined> {
  if (!navigator.geolocation) return Promise.resolve(undefined);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ latitude: position.coords.latitude, longitude: position.coords.longitude }),
      () => resolve(undefined),
      { enableHighAccuracy: true, timeout: 3500, maximumAge: 30_000 },
    );
  });
}

function readImageSize(blob: Blob): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
      URL.revokeObjectURL(url);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("图片预览失败，请确认文件没有损坏。"));
    };
    image.src = url;
  });
}

function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(2)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function CapturePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const demoStartedRef = useRef(false);
  const [file, setFile] = useState<Blob | null>(null);
  const [details, setDetails] = useState<FileDetails | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cameraActive, setCameraActive] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [stage, setStage] = useState("等待照片");

  useEffect(() => () => streamRef.current?.getTracks().forEach((track) => track.stop()), []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function prepareFile(blob: Blob, name: string) {
    setError("");
    if (!ACCEPTED_TYPES.has(blob.type) && !/\.(jpe?g|png|webp)$/i.test(name)) throw new Error("仅支持 JPG、JPEG、PNG 或 WebP 图片。");
    if (blob.size > MAX_FILE_BYTES) throw new Error("图片不能超过 20 MB。");
    const dimensions = await readImageSize(blob);
    if (!dimensions.width || !dimensions.height) throw new Error("无法读取图片分辨率。");
    if (preview) URL.revokeObjectURL(preview);
    setFile(blob);
    setPreview(URL.createObjectURL(blob));
    setDetails({ name, width: dimensions.width, height: dimensions.height, size: blob.size, type: blob.type });
    setStage("照片已就绪");
  }

  async function handleSelected(selected?: File) {
    if (!selected) return;
    try { await prepareFile(selected, selected.name); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "图片读取失败。"); }
  }

  async function startCamera() {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraActive(true);
      setStage("摄像头已启动");
    } catch {
      setError("无法启用摄像头，请检查浏览器权限或使用上传照片。 ");
    }
  }

  async function captureFrame() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (blob) void prepareFile(blob, `camera-${Date.now()}.png`).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "拍摄失败"));
    }, "image/png");
  }

  async function submitBlob(blob: Blob) {
    setBusy(true);
    setError("");
    setStage("正在上传并识别标靶…");
    try {
      const location = searchParams.get("demo") === "1" ? undefined : await requestLocation();
      const result = await measureImage(blob, location);
      setStage("识别与质量门控完成");
      if (sessionStorage.getItem("geo-recheck:system-started") === null && searchParams.get("benchmark") === "1") {
        sessionStorage.setItem("geo-recheck:system-started", String(Date.now()));
      }
      navigate(`/result/${result.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "测量失败，请重新拍摄。 ");
      setStage("处理失败");
    } finally {
      setBusy(false);
    }
  }

  async function loadDemoSample(autoSubmit = false) {
    setError("");
    setStage("正在加载内置样本…");
    const response = await fetch("/demo-assets/014_delta_5_angle_20.png");
    if (!response.ok) throw new Error("内置样本不可用，请先运行 scripts\\setup_windows.cmd。");
    const blob = await response.blob();
    await prepareFile(blob, "014_delta_5_angle_20.png");
    if (autoSubmit) {
      setStage("照片已显示，准备自动测量…");
      await new Promise((resolve) => window.setTimeout(resolve, 650));
      await submitBlob(blob);
    }
  }

  useEffect(() => {
    if (searchParams.get("demo") !== "1" || demoStartedRef.current) return;
    demoStartedRef.current = true;
    void loadDemoSample(true).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : "一键演示启动失败。");
      setStage("演示失败");
    });
  }, [searchParams]);

  function clearFile() {
    setFile(null);
    setDetails(null);
    setPreview(null);
    setStage("等待照片");
  }

  return (
    <section className="page capture-page">
      <div className="page-heading compact">
        <div><p className="eyebrow">MP-03 · WALL-02</p><h1>{searchParams.get("demo") === "1" ? "一键演示处理中" : "拍摄或上传复测照片"}</h1></div>
        <span className="profile-warning">演示相机配置</span>
      </div>

      <div className="capture-primary-actions" aria-label="照片来源">
        <button className="button large" type="button" onClick={startCamera}>使用摄像头</button>
        <label className="button primary large upload-primary">
          上传照片
          <input data-testid="photo-input" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" onChange={(event) => { const selected = event.target.files?.[0]; event.currentTarget.value = ""; void handleSelected(selected); }} />
        </label>
      </div>

      <div className="capture-layout">
        <div
          className={`camera-panel drop-zone ${dragging ? "dragging" : ""}`}
          onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => { event.preventDefault(); setDragging(false); void handleSelected(event.dataTransfer.files?.[0]); }}
        >
          {preview ? <img data-testid="upload-preview" src={preview} alt="本次输入照片预览" /> : <video ref={videoRef} autoPlay playsInline muted aria-label="摄像头实时画面" />}
          {!preview && !cameraActive ? <div className="camera-empty"><strong>拖拽照片到这里，或点击“上传照片”</strong><small>支持 JPG、JPEG、PNG、WebP，最大 20 MB</small></div> : null}
          {!preview ? <div className="guide-frame" aria-hidden="true" /> : null}
          {busy ? <div className="processing-overlay" role="status"><span className="spinner" />{stage}</div> : null}
        </div>

        <aside className="capture-checks">
          <h2>本次输入</h2>
          {details ? (
            <dl className="file-details" data-testid="file-details">
              <div><dt>文件名</dt><dd>{details.name}</dd></div>
              <div><dt>分辨率</dt><dd>{details.width} × {details.height}</dd></div>
              <div><dt>文件大小</dt><dd>{formatBytes(details.size)}</dd></div>
              <div><dt>格式</dt><dd>{details.type.replace("image/", "").toUpperCase()}</dd></div>
            </dl>
          ) : <div className="inline-empty">尚未选择照片</div>}
          <h2>自动处理</h2>
          <ul>
            <li className={file ? "ready" : "pending"}><span>{file ? "✓" : "·"}</span>图片合法性与尺寸读取</li>
            <li className={busy ? "active" : "pending"}><span>{busy ? "●" : "·"}</span>左右 Marker 自动识别</li>
            <li className={busy ? "active" : "pending"}><span>{busy ? "●" : "·"}</span>监测点与构筑物自动匹配</li>
            <li className={busy ? "active" : "pending"}><span>{busy ? "●" : "·"}</span>PnP、质量门控与证据生成</li>
          </ul>
          <div className="capture-actions">
            {cameraActive && !preview ? <button className="button" type="button" onClick={captureFrame}>拍摄当前画面</button> : null}
            <button className="button text" type="button" disabled={busy} onClick={() => void loadDemoSample(false).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "样本加载失败"))}>加载内置 +5 mm / 20° 样本</button>
            {preview ? <button className="button text" type="button" disabled={busy} onClick={clearFile}>清除并重拍</button> : null}
          </div>
        </aside>
      </div>
      {error ? <div className="notice error" role="alert">{error}</div> : null}
      <div className="sticky-submit">
        <p><strong>{stage}</strong><br />照片仅在本机处理；质量不合格时不会生成可确认数值。</p>
        <button className="button primary large" type="button" onClick={() => file && void submitBlob(file)} disabled={!file || busy}>
          {busy ? "正在测量…" : "开始测量"}
        </button>
      </div>
    </section>
  );
}
