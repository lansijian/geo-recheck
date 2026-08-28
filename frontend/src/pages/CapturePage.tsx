import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { captureBaseline, getDemoCases, getPoint, measureImage } from "../api/client";
import type { DemoCase, Point } from "../types";

type FileDetails = { name: string; width: number; height: number; size: number; type: string };

const PROCESSING_STEPS = ["识别复测标志", "校正拍摄角度", "与历史基准对齐", "计算相对张开", "保存几何证据"];
const MAX_BYTES = 20 * 1024 * 1024;
const ACCEPTED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

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
  const [searchParams, setSearchParams] = useSearchParams();
  const isDemo = searchParams.get("demo") === "1";
  const requestedCase = searchParams.get("case") ?? "case_03_seepage";
  const pointId = searchParams.get("point") ?? undefined;
  const captureMode = (searchParams.get("mode") as "baseline" | "recheck" | null) ?? undefined;
  const [cases, setCases] = useState<DemoCase[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState(requestedCase);
  const [point, setPoint] = useState<Point | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [details, setDetails] = useState<FileDetails | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [processingStep, setProcessingStep] = useState(-1);
  const [stage, setStage] = useState("选择现场案例");
  const [error, setError] = useState("");
  const [cameraActive, setCameraActive] = useState(false);
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<number | null>(null);

  const selectedCase = cases.find((item) => item.case_id === selectedCaseId) ?? null;

  useEffect(() => {
    if (pointId) return;
    let active = true;
    getDemoCases().then((items) => { if (active) setCases(items); }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "Demo Cases 加载失败。");
    });
    return () => { active = false; };
  }, [pointId]);

  useEffect(() => {
    if (!pointId) return;
    let active = true;
    getPoint(pointId).then((value) => { if (active) setPoint(value); }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : "监测点加载失败。");
    });
    return () => { active = false; };
  }, [pointId]);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
  }, []);

  useEffect(() => () => { if (preview?.startsWith("blob:")) URL.revokeObjectURL(preview); }, [preview]);

  async function prepareFile(blob: Blob, name: string, previewUrl?: string) {
    const type = blob.type || "image/jpeg";
    if (!ACCEPTED_TYPES.has(type) || blob.size > MAX_BYTES) {
      throw new Error(blob.size > MAX_BYTES ? "图片不能超过 20 MB。" : "仅支持 JPG、PNG、WebP 图片。");
    }
    const url = previewUrl ?? URL.createObjectURL(blob);
    const image = new Image();
    const dimensions = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error("图片读取失败。"));
      image.src = url;
    });
    setFile(new File([blob], name, { type }));
    setDetails({ name, size: blob.size, type, ...dimensions });
    setPreview(url);
    setStage("本次近景已就绪");
  }

  async function loadCase(caseId: string) {
    const target = cases.find((item) => item.case_id === caseId);
    if (!target) return;
    setError("");
    setStage("正在准备三图现场案例…");
    const response = await fetch(target.assets.current_close);
    if (!response.ok) throw new Error("Demo Case 图片不可用，请重新生成 V0.4 数据。 ");
    await prepareFile(await response.blob(), `${caseId}_current.jpg`, target.assets.current_close);
  }

  useEffect(() => {
    if (!isDemo || pointId || cases.length === 0 || file) return;
    void loadCase(selectedCaseId).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "案例加载失败。"));
  }, [cases, file, isDemo, pointId, selectedCaseId]);

  async function chooseCase(caseId: string) {
    setSelectedCaseId(caseId);
    setSearchParams({ demo: "1", case: caseId });
    setFile(null);
    setDetails(null);
    setPreview(null);
    setProcessingStep(-1);
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
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraActive(true);
      setStage("摄像头已启动，请让左右复测贴完整入镜");
    } catch { setError("无法启用摄像头，请检查浏览器权限或使用上传照片。"); }
  }

  function captureFrame() {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    canvas.toBlob((blob) => { if (blob) void prepareFile(blob, `wall-recheck-${Date.now()}.png`); }, "image/png");
  }

  async function submit() {
    if (!file) return;
    setBusy(true);
    setError("");
    setProcessingStep(0);
    setStage("正在完成确定性几何测量…");
    sessionStorage.setItem("geo-recheck:system-started", String(Date.now()));
    timerRef.current = window.setInterval(() => setProcessingStep((value) => Math.min(4, value + 1)), 230);
    try {
      const location = isDemo ? undefined : await requestLocation();
      const result = pointId && captureMode === "baseline"
        ? await captureBaseline(pointId, file)
        : await measureImage(
            file,
            location,
            pointId ? undefined : (isDemo ? selectedCaseId : undefined),
            pointId ? { point: pointId, captureMode: captureMode ?? "recheck" } : undefined,
          );
      setProcessingStep(5);
      navigate(`/result/${result.id}`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "测量失败，请重新拍摄。");
      setStage("处理失败");
      setProcessingStep(-1);
    } finally {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      timerRef.current = null;
      setBusy(false);
    }
  }

  return (
    <section className="page capture-page wall-capture">
      <div className="page-heading compact">
        {pointId ? (
          <div>
            <p className="eyebrow">{point ? `${point.hazard_name} · ${point.structure_name}` : "监测点复测"}</p>
            <h1>{captureMode === "baseline" ? "采集基线" : "开始复测"}{point ? `：${point.monitor_point_name}` : ""}</h1>
            <p>{point?.location_description ?? point?.monitor_point_id ?? pointId}</p>
          </div>
        ) : (
          <div><p className="eyebrow">现场全景 → 裂缝近景</p><h1>{isDemo ? "选择一个现场案例" : "拍摄本次裂缝近景"}</h1><p>Golden Path 默认：墙体裂缝复测 + 疑似新增水迹</p></div>
        )}
        <span className="demo-mode-label">{pointId ? (captureMode === "baseline" ? "基线采集" : "复测采集") : isDemo ? "V0.4 Demo" : "现场模式"}</span>
      </div>

      {isDemo && !pointId ? <div className="case-selector" aria-label="五个演示案例">{cases.map((item) => <button type="button" className={item.case_id === selectedCaseId ? "active" : ""} key={item.case_id} onClick={() => void chooseCase(item.case_id)}><span>{item.case_id.replace("case_", "")}</span><strong>{item.title}</strong></button>)}</div> : null}

      {selectedCase ? <section className="case-visuals">
        <figure className="context-panel"><img src={selectedCase.assets.context} alt="本次巡查现场全景" /><figcaption>现场全景</figcaption>{selectedCase.context_callouts.map((item) => <span className="site-callout compact" key={item.id} style={{ left: `${item.x * 100}%`, top: `${item.y * 100}%` }}><b>{item.id}</b>{item.label}</span>)}</figure>
        <figure><img src={selectedCase.assets.previous_close} alt="上次裂缝近景" /><figcaption>上次近景</figcaption></figure>
        <figure><img src={selectedCase.assets.current_close} alt="本次裂缝近景" /><figcaption>本次近景</figcaption></figure>
      </section> : null}

      <div className="capture-primary-actions" aria-label="照片来源">
        <button className="button" type="button" onClick={startCamera}>使用摄像头</button>
        <label className="button upload-primary">上传本次近景<input ref={fileInputRef} data-testid="photo-input" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" onChange={(event) => { const selected = event.target.files?.[0]; event.currentTarget.value = ""; void handleSelected(selected); }} /></label>
      </div>

      <div className="capture-layout compact-capture">
        <div
          className={`camera-panel wall-photo-panel ${dragging ? "dragging" : ""}`}
          role="button"
          tabIndex={0}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            void handleSelected(event.dataTransfer.files?.[0]);
          }}
        >
          {preview ? <img data-testid="upload-preview" src={preview} alt="真实建筑墙面裂缝与左右视觉复测贴" /> : <video ref={videoRef} autoPlay playsInline muted aria-label="摄像头实时画面" />}
          {!preview && !cameraActive ? <div className="camera-empty"><strong>让墙缝和左右复测贴完整入镜</strong><small>拖拽或点击上传 JPG、PNG、WebP，最大 20 MB</small></div> : null}
          {preview ? <span className="sticker-visible-badge" data-testid="recheck-sticker-indicator">待算法核验复测贴</span> : null}
          {busy ? <div className="processing-overlay" role="status"><span className="spinner" /><strong>{stage}</strong><small>毫米值来自几何算法，不由大模型估算</small></div> : null}
        </div>
        <aside className="capture-checks human-steps">
          <p className="eyebrow">几何复测</p>
          <ol>{PROCESSING_STEPS.map((label, index) => <li key={label} className={processingStep > index ? "done" : processingStep === index ? "active" : "pending"}><span>{processingStep > index ? "✓" : `0${index + 1}`}</span><strong>{label}</strong></li>)}</ol>
          {details ? <dl className="file-details" data-testid="file-details"><div><dt>照片</dt><dd>{details.name}</dd></div><div><dt>分辨率</dt><dd>{details.width} × {details.height}</dd></div><div><dt>大小</dt><dd>{formatBytes(details.size)}</dd></div></dl> : null}
          {cameraActive && !preview ? <button className="button" type="button" onClick={captureFrame}>拍摄当前画面</button> : null}
        </aside>
      </div>
      {error ? <div className="notice error" role="alert">{error}</div> : null}
      <div className="sticky-submit"><p><strong>{stage}</strong><br />几何结果先返回；AI 复核失败也不会阻塞测量。</p><button className="button primary large" type="button" onClick={() => void submit()} disabled={!file || busy}>{busy ? "正在分析…" : "开始分析"}</button></div>
      <p className="provenance-note">{selectedCase?.disclosure ?? "上传图片只在本机处理。"}</p>
    </section>
  );
}
