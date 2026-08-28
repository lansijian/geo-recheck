import type { AIReview, AIStatus, BenchmarkSummary, DemoCase, Measurement, Point, PointCreatePayload } from "../types";
import type { ShowcaseCase } from "../components/showcase/showcaseData";

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(payload?.detail ?? `请求失败（${response.status}）`);
  }
  return response.json() as Promise<T>;
}

export function evidenceUrl(path: string | null | undefined): string | null {
  return path ?? null;
}

export async function getPoints(): Promise<Point[]> {
  return parseResponse<Point[]>(await fetch("/api/points"));
}

export async function getPoint(id: string): Promise<Point> {
  return parseResponse<Point>(await fetch(`/api/points/${encodeURIComponent(id)}`));
}

export async function createPoint(payload: PointCreatePayload): Promise<Point> {
  return parseResponse<Point>(
    await fetch("/api/points", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  );
}

export async function getPointHistory(id: string): Promise<Measurement[]> {
  return parseResponse<Measurement[]>(
    await fetch(`/api/points/${encodeURIComponent(id)}/history`),
  );
}

export function stickerPdfUrl(id: string): string {
  return `/api/points/${encodeURIComponent(id)}/sticker.pdf`;
}

export async function uploadContextPhoto(id: string, file: Blob): Promise<Point> {
  const form = new FormData();
  form.append("image", file, "context.jpg");
  return parseResponse<Point>(
    await fetch(`/api/points/${encodeURIComponent(id)}/context-photo`, {
      method: "PUT",
      body: form,
    }),
  );
}

export async function captureBaseline(id: string, file: Blob): Promise<Measurement> {
  const form = new FormData();
  form.append("image", file, "baseline.png");
  return parseResponse<Measurement>(
    await fetch(`/api/points/${encodeURIComponent(id)}/baseline`, {
      method: "POST",
      body: form,
    }),
  );
}

export async function measureImage(
  file: Blob,
  location?: { latitude: number; longitude: number },
  demoCaseId?: string,
  pointContext?: { point: string; captureMode: "baseline" | "recheck" },
): Promise<Measurement> {
  const form = new FormData();
  const filename = file instanceof File ? file.name : "measurement.png";
  form.append("image", file, filename);
  if (location) {
    form.append("browser_lat", String(location.latitude));
    form.append("browser_lon", String(location.longitude));
  }
  form.append("camera_profile", "demo_webcam_profile");
  if (demoCaseId) form.append("demo_case_id", demoCaseId);
  if (pointContext) {
    form.append("point", pointContext.point);
    form.append("capture_mode", pointContext.captureMode);
  }
  return parseResponse<Measurement>(
    await fetch("/api/measure", { method: "POST", body: form }),
  );
}

export async function confirmMeasurement(
  id: string,
  observerName: string,
  remark: string,
  visibleChangeNote?: string,
): Promise<Measurement> {
  return parseResponse<Measurement>(
    await fetch(`/api/inspections/${id}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ observer_name: observerName, remark, visible_change_note: visibleChangeNote }),
    }),
  );
}

export async function getDemoCases(): Promise<DemoCase[]> {
  return parseResponse<DemoCase[]>(await fetch("/api/demo-cases"));
}

export async function getShowcaseCases(): Promise<ShowcaseCase[]> {
  return parseResponse<ShowcaseCase[]>(await fetch("/api/showcase/cases"));
}

export async function getAIStatus(): Promise<AIStatus> {
  return parseResponse<AIStatus>(await fetch("/api/ai/status"));
}

export async function runAIReview(id: string, caseId?: string): Promise<AIReview> {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), 190_000);
  try {
    return await parseResponse<AIReview>(
      await fetch(`/api/inspections/${id}/ai-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(caseId ? { case_id: caseId } : {}),
        signal: controller.signal,
      }),
    );
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("AI 复核已等待超过 190 秒，请稍后重新运行；几何结果不受影响。");
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeout);
  }
}

export async function replayAIReview(id: string, caseId: string): Promise<AIReview> {
  return parseResponse<AIReview>(
    await fetch(`/api/inspections/${id}/ai-review/replay`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ case_id: caseId }),
    }),
  );
}

export async function decideAIReviewItem(
  inspectionId: string,
  itemId: number,
  decision: "accepted" | "rejected" | "edited",
  editedEvidence?: string,
): Promise<AIReview> {
  return parseResponse<AIReview>(
    await fetch(`/api/inspections/${inspectionId}/ai-review/items/${itemId}/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, edited_evidence: editedEvidence }),
    }),
  );
}

export async function getInspection(id: string): Promise<Measurement> {
  return parseResponse<Measurement>(await fetch(`/api/inspections/${id}`));
}

export async function addBenchmarkTrial(
  mode: "traditional" | "system",
  durationMs: number,
  errors = 0,
): Promise<void> {
  await parseResponse(
    await fetch("/api/benchmark/trial", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, duration_ms: Math.max(1, Math.round(durationMs)), errors }),
    }),
  );
}

export async function getBenchmarkSummary(): Promise<BenchmarkSummary> {
  return parseResponse<BenchmarkSummary>(await fetch("/api/benchmark/summary"));
}

export type CameraProfile = {
  name: string;
  is_demo_profile: boolean;
  calibration_image_size: [number, number];
  rms_reprojection_error_px?: number;
  accepted_images?: number;
  total_images?: number;
  camera_matrix?: number[][];
  distortion_coefficients?: number[] | number[][];
  warning?: string;
};

export async function getCameraProfile(): Promise<CameraProfile> {
  return parseResponse<CameraProfile>(await fetch("/api/calibration/profile"));
}

export async function calibrateCamera(files: File[]): Promise<CameraProfile> {
  const form = new FormData();
  files.forEach((file) => form.append("images", file));
  return parseResponse<CameraProfile>(
    await fetch("/api/calibration", { method: "POST", body: form }),
  );
}
