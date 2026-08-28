import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const python = process.env.GEORECHECK_PYTHON ?? path.join(projectRoot, ".venv", "Scripts", "python.exe");
const sample = path.join(projectRoot, "data", "wall_demo", "images", "current_open_5mm_yaw20.png");

function resetDemo() {
  execFileSync(python, [path.join(projectRoot, "scripts", "reset_demo.py")], { cwd: projectRoot });
}

function collectBrowserFailures(page: Page) {
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  page.on("console", (message) => { if (message.type() === "error") failures.push(`console: ${message.text()}`); });
  page.on("response", (response) => { if (response.status() >= 400) failures.push(`network ${response.status()}: ${response.url()}`); });
  return failures;
}

async function expectLoadedImage(locator: Locator) {
  await expect(locator).toBeVisible();
  await expect.poll(() => locator.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
}

async function runOneMinuteDemo(page: Page) {
  await page.goto("/");
  await page.getByRole("link", { name: "开始 60 秒巡查 Demo" }).click();
  await expect(page.getByRole("heading", { name: "选择一个现场案例" })).toBeVisible();
  await expect(page.getByAltText("本次巡查现场全景")).toBeVisible();
  const responsePromise = page.waitForResponse((response) => response.url().includes("/api/measure") && response.request().method() === "POST");
  await page.getByRole("button", { name: "开始分析" }).click();
  expect((await responsePromise).status()).toBe(200);
  await expect(page).toHaveURL(/\/result\/[0-9a-f-]+$/);
  await expect(page.getByRole("heading", { name: "CRACK-W01" })).toBeVisible();
}

test.beforeEach(() => resetDemo());

test("首页先讲真实监测员与每天巡查至少三次", async ({ page }) => {
  const failures = collectBrowserFailures(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /每天至少巡查 3 次/ })).toBeVisible();
  await expect(page.getByText("丈量墙缝、比对每日数据、看现场变化，再填写巡查台账", { exact: false })).toBeVisible();
  await expect(page.getByText("几何算法负责“量”", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "开始 60 秒巡查 Demo" })).toBeVisible();
  expect(failures).toEqual([]);
});

test("StepFun 不可用时几何结果仍可确认并生成记录", async ({ page }) => {
  const failures = collectBrowserFailures(page);
  await page.route("**/api/ai/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ enabled: true, configured: true, provider: "stepfun", model: "step-3.7-flash" }),
    });
  });
  await page.route("**/api/inspections/**/ai-review", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "fixture-failed-review",
        inspection_id: "browser-fixture",
        provider: "stepfun",
        model: "step-3.7-flash",
        status: "failed",
        created_at: new Date().toISOString(),
        latency_ms: 1851,
        attempts: 0,
        error_code: "quota",
        error_message: "StepFun 配额暂不可用。",
        parsed: null,
        items: [],
      }),
    });
  });
  await runOneMinuteDemo(page);
  await expect(page.getByText("AI 现场复核暂不可用", { exact: true })).toBeVisible();
  await expect(page.getByText(/配额暂不可用.*几何测量结果不受影响/)).toBeVisible();
  await expect(page.locator(".opening-number")).toContainText("mm");
  await page.getByRole("button", { name: "确认并生成记录" }).click();
  await expect(page).toHaveURL(/\/record\/[0-9a-f-]+$/);
  expect(failures).toEqual([]);
});

test("AI 可见变化可由监测员逐条确认或不采纳", async ({ page }) => {
  const statuses: Record<number, "pending" | "accepted" | "rejected"> = { 7001: "pending", 7002: "pending" };
  await page.route("**/api/ai/status", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ enabled: true, configured: true, provider: "stepfun", model: "step-3.7-flash" }),
    });
  });
  const reviewPayload = () => ({
    id: "fixture-review",
    inspection_id: "browser-fixture",
    provider: "stepfun",
    model: "step-3.7-flash",
    status: "completed",
    created_at: new Date().toISOString(),
    latency_ms: 860,
    attempts: 1,
    error_code: null,
    error_message: null,
    parsed: { scene_consistency: "same_location", coverage_complete: true, missing_views: [], record_draft: "待人工确认。", disclaimer: "仅为可见现象辅助复核。" },
    items: [
      { id: 7001, type: "seepage_or_water_stain", state: "new", evidence: "裂缝右下侧可见新增颜色加深区域。", confidence: "medium", requires_human_check: true, human_status: statuses[7001], edited_evidence: null },
      { id: 7002, type: "spalling_or_peeling", state: "uncertain", evidence: "右侧表面疑似局部剥落。", confidence: "low", requires_human_check: true, human_status: statuses[7002], edited_evidence: null },
    ],
  });
  await page.route("**/api/inspections/**/ai-review**", async (route) => {
    const url = route.request().url();
    if (url.includes("/items/7001/")) statuses[7001] = "accepted";
    if (url.includes("/items/7002/")) statuses[7002] = "rejected";
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(reviewPayload()) });
  });
  await runOneMinuteDemo(page);
  await expect(page.getByRole("heading", { name: "疑似新增水迹" })).toBeVisible();
  await page.locator(".finding").nth(0).getByRole("button", { name: "确认" }).click();
  await page.locator(".finding").nth(1).getByRole("button", { name: "不采纳" }).click();
  await expect(page.getByText("已确认", { exact: true })).toBeVisible();
  await expect(page.getByText("未采纳", { exact: true })).toBeVisible();
});

test("墙体照片上传后可见真实建筑表面与复测贴", async ({ page }) => {
  const failures = collectBrowserFailures(page);
  await page.goto("/capture");
  await page.setInputFiles('[data-testid="photo-input"]', sample);
  await expect(page.getByText("current_open_5mm_yaw20.png", { exact: true })).toBeVisible();
  await expectLoadedImage(page.getByAltText("真实建筑墙面裂缝与左右视觉复测贴"));
  await expect(page.getByTestId("recheck-sticker-indicator")).toContainText("待算法核验复测贴");
  expect(failures).toEqual([]);
});

test("一分钟 Demo 输出较上次张开 4–6 mm 与 before/after", async ({ page }) => {
  const failures = collectBrowserFailures(page);
  await runOneMinuteDemo(page);
  await expect(page.getByText("较上次张开", { exact: true })).toBeVisible();
  const opening = Number((await page.locator(".opening-number").textContent())?.replace(/[^0-9.-]/g, ""));
  expect(opening).toBeGreaterThanOrEqual(4);
  expect(opening).toBeLessThanOrEqual(6);
  await expectLoadedImage(page.getByAltText("AI 输入的上次裂缝近景"));
  await expectLoadedImage(page.getByAltText("AI 输入的本次裂缝近景"));
  expect(failures).toEqual([]);
});

test("质量失败案例拒绝毫米输出", async ({ page }) => {
  const failures = collectBrowserFailures(page);
  await page.goto("/capture?demo=1&case=case_05_quality_fail");
  await expect(page.getByAltText("本次裂缝近景")).toBeVisible();
  await page.getByRole("button", { name: "开始分析" }).click();
  await expect(page).toHaveURL(/\/result\/[0-9a-f-]+$/);
  await expect(page.getByText("几何质量未通过 · 请重新拍摄", { exact: true })).toBeVisible();
  await expect(page.locator(".opening-number")).toHaveText("未输出");
  await expect(page.getByRole("button", { name: "确认并生成记录" })).toHaveCount(0);
  expect(failures).toEqual([]);
});

test("确认后记录包含 CRACK-W01、张开变化与影像证据", async ({ page }) => {
  const failures = collectBrowserFailures(page);
  await runOneMinuteDemo(page);
  await page.getByRole("textbox", { name: "记录人" }).fill("Playwright 验收员");
  await page.getByRole("button", { name: "确认并生成记录" }).click();
  await expect(page).toHaveURL(/\/record\/[0-9a-f-]+$/);
  await expect(page.getByText("CRACK-W01", { exact: true })).toBeVisible();
  await expect(page.getByText("通过 · 已确认", { exact: true })).toBeVisible();
  await expect(page.locator(".record-opening strong")).toContainText("mm");
  await expectLoadedImage(page.getByAltText("记录中的本次原始墙体照片"));
  await expectLoadedImage(page.getByAltText("记录中的墙面正视校正图"));
  expect(failures).toEqual([]);
});

test("V0.2 持久化能力保留：结果刷新后仍恢复", async ({ page }) => {
  const failures = collectBrowserFailures(page);
  await runOneMinuteDemo(page);
  const url = page.url();
  await page.reload();
  await expect(page).toHaveURL(url);
  await expect(page.getByRole("heading", { name: "CRACK-W01" })).toBeVisible();
  await expect(page.getByText("较上次张开", { exact: true })).toBeVisible();
  expect(failures).toEqual([]);
});

test("真实场景与技术依据页面公开来源可见", async ({ page }) => {
  const failures = collectBrowserFailures(page);
  await page.goto("/scenario");
  await expect(page.getByRole("heading", { name: /基层监测员看的是整个现场/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /人民网贵州/ })).toBeVisible();
  await page.goto("/technology");
  await expect(page.getByText("一个系统里，两种能力各守边界", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: /阶跃星辰官方图片理解文档/ })).toBeVisible();
  expect(failures).toEqual([]);
});
