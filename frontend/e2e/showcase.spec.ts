import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const python = process.env.GEORECHECK_PYTHON ?? path.join(projectRoot, ".venv", "Scripts", "python.exe");

function resetDemo() { execFileSync(python, [path.join(projectRoot, "scripts", "reset_demo.py")], { cwd: projectRoot }); }
function collectBrowserFailures(page: Page) {
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  page.on("console", (message) => { if (message.type() === "error") failures.push(`console: ${message.text()}`); });
  page.on("response", (response) => { if (response.status() >= 400) failures.push(`network ${response.status()}: ${response.url()}`); });
  return failures;
}

async function enterResult(page: Page) {
  for (let index = 0; index < 5; index += 1) await page.getByTestId("showcase-next").click();
  await expect(page.getByTestId("showcase-next")).toBeEnabled();
  await page.getByTestId("showcase-next").click();
  await page.getByTestId("showcase-next").click();
  await expect(page.getByTestId("showcase-next")).toBeEnabled();
  const geometryResponse = page.waitForResponse((response) => response.url().endsWith("/api/measure") && response.request().method() === "POST");
  await page.getByTestId("showcase-next").click();
  expect((await geometryResponse).status()).toBe(200);
  await expect(page.getByTestId("showcase-next")).toBeEnabled();
  const replayResponse = page.waitForResponse((response) => response.url().endsWith("/ai-review/replay") && response.request().method() === "POST");
  await page.getByTestId("showcase-next").click();
  expect((await replayResponse).status()).toBe(200);
  await expect(page.getByTestId("showcase-next")).toBeEnabled();
  await page.getByTestId("showcase-next").click();
}

test.beforeEach(() => resetDemo());

test("V0.6 使用真实 Three.js Canvas 和统一三栏现场", async ({ page }) => {
  const failures = collectBrowserFailures(page);
  const externalRequests: string[] = [];
  page.on("request", (request) => { if (!request.url().startsWith("http://127.0.0.1")) externalRequests.push(request.url()); });
  await page.goto("/showcase");
  await expect(page.getByRole("heading", { name: "基层地灾巡查辅助工具" })).toBeVisible();
  await expect(page.getByTestId("showcase-scene")).toBeVisible();
  await expect(page.getByTestId("showcase-phone")).toBeVisible();
  await expect(page.getByTestId("showcase-sidebar")).toBeVisible();
  await expect(page.getByTestId("judge-start")).toHaveText("一键开始体验");
  const canvas = page.getByTestId("field-canvas").locator("canvas");
  await expect(canvas).toBeVisible();
  expect(await canvas.evaluate((node: HTMLCanvasElement) => Boolean(node.getContext("webgl2") || node.getContext("webgl")))).toBe(true);
  await expect(page.getByTestId("showcase-runtime").getByText("FastAPI / OpenCV", { exact: false })).toBeVisible();
  expect(externalRequests).toEqual([]);
  expect(failures).toEqual([]);
});

test("评委首屏能看懂并一键开始，也能直接点击手机", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/showcase?speed=fast");
  await expect(page.getByText("评委从这里开始", { exact: true })).toBeVisible();
  await expect(page.getByTestId("showcase-runtime").getByText("LIVE", { exact: true }).first()).toBeVisible();
  await expect(page.getByTestId("showcase-runtime").getByText("REPLAY", { exact: true })).toBeVisible();
  await expect(page.getByTestId("showcase-phone").getByRole("button", { name: "开始巡查" })).toBeInViewport();
  await page.getByTestId("judge-start").click();
  await expect(page.getByTestId("judge-start")).toHaveText("暂停体验");
  await expect(page.getByText("自动体验运行中", { exact: true })).toBeVisible();
  await page.getByTestId("judge-start").click();
  await expect(page.getByTestId("judge-start")).toHaveText("继续自动体验");
});

test("人物与摄像机目标在巡查过程中发生真实空间切换", async ({ page }) => {
  await page.goto("/showcase");
  const scene = page.getByTestId("showcase-scene");
  await expect(scene).toHaveAttribute("data-worker-position", "-5.2,0,4.8");
  await page.getByTestId("showcase-next").click();
  await expect(scene).toHaveAttribute("data-worker-position", "-1.3,0,2.5");
  for (let index = 0; index < 6; index += 1) {
    if (index === 4) await expect(page.getByTestId("showcase-next")).toBeEnabled();
    await page.getByTestId("showcase-next").click();
  }
  await expect(scene).toHaveAttribute("data-worker-position", "0.8,0,1.25");
  await expect(scene).toHaveAttribute("data-camera-mode", "close");
});

test("Hybrid Replay 真实运行几何、回放 AI 并支持 Before/After", async ({ page }) => {
  const failures = collectBrowserFailures(page);
  await page.goto("/showcase");
  await enterResult(page);
  await expect(page.getByText("+4.8 mm", { exact: true })).toBeVisible();
  await expect(page.getByTestId("showcase-phone").getByText("疑似新增水迹", { exact: true })).toBeVisible();
  await expect(page.getByText(/StepFun · step-3.7-flash · 原始 41.0 s/)).toBeVisible();
  const slider = page.getByRole("slider", { name: "拖动对比上次与本次图片" });
  await slider.fill("80");
  await expect(slider).toHaveValue("80");
  await expect(page.getByText("受控演示变化区域 · 非模型定位框", { exact: true }).first()).toBeVisible();
  expect(failures).toEqual([]);
});

test("自动巡查在人工确认处强制暂停且用户输入进入正式记录", async ({ page }) => {
  test.setTimeout(45_000);
  await page.goto("/showcase?speed=fast");
  await page.getByTestId("showcase-autoplay").click();
  await expect(page.getByText("自动演示已暂停 · 轮到你操作", { exact: true })).toBeVisible({ timeout: 25_000 });
  await expect(page.getByTestId("showcase-autoplay")).toHaveText("自动巡查");
  await expect(page.getByTestId("judge-start")).toHaveText("去手机完成确认");
  await expect(page.getByRole("button", { name: "确认", exact: true })).not.toHaveClass(/selected/);
  await page.getByRole("button", { name: "一键填入演示信息" }).click();
  await expect(page.getByLabel("监测员姓名")).toHaveValue("路演评委");
  await expect(page.getByLabel("现场备注")).toHaveValue("现场已核对照片与可见变化，复测贴完整。");
  await page.getByLabel("监测员姓名").fill("王复测");
  await page.getByLabel("现场备注").fill("现场核对水迹区域，墙面复测贴完整。");
  await page.getByRole("button", { name: "确认", exact: true }).click();
  const confirmResponse = page.waitForResponse((response) => response.url().endsWith("/confirm") && response.request().method() === "POST");
  await page.getByRole("button", { name: "确认并生成记录" }).click();
  expect((await confirmResponse).status()).toBe(200);
  await expect(page.getByText("巡查记录已生成", { exact: true })).toBeVisible();
  await expect(page.getByText("王复测", { exact: true })).toBeVisible();
  await expect(page.getByText("现场核对水迹区域，墙面复测贴完整。", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "查看正式记录" }).click();
  await expect(page).toHaveURL(/\/record\/[0-9a-f-]+$/);
  await expect(page.getByText("王复测", { exact: true })).toBeVisible();
  await expect(page.getByText("现场核对水迹区域，墙面复测贴完整。", { exact: true })).toBeVisible();
  await expect(page.getByText("已确认写入", { exact: true })).toBeVisible();
});

test("实时 AI 是显式可选动作且失败不覆盖几何结果", async ({ page }) => {
  await page.goto("/showcase");
  await enterResult(page);
  await page.route("**/api/inspections/*/ai-review", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ id: "live-failed", inspection_id: "fixture", provider: "stepfun", model: "step-3.7-flash", status: "failed", created_at: new Date().toISOString(), latency_ms: null, attempts: 0, error_code: "network", error_message: "网络不可用", parsed: null, items: [] }) }));
  await page.getByRole("button", { name: /运行实时 AI/ }).click();
  await expect(page.getByRole("button", { name: /实时 AI 失败/ })).toBeVisible();
  await expect(page.getByText("+4.8 mm", { exact: true })).toBeVisible();
});
