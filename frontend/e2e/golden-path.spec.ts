import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const python = "D:\\Anaconda\\_envs\\PulseWeave\\Scripts\\python.exe";
const sample = path.join(projectRoot, "data", "benchmark", "images", "014_delta_5_angle_20.png");

function resetDemo() {
  execFileSync(python, [path.join(projectRoot, "scripts", "reset_demo.py")], { cwd: projectRoot });
}

function collectBrowserFailures(page: Page) {
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") failures.push(`console: ${message.text()}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) failures.push(`network ${response.status()}: ${response.url()}`);
  });
  return failures;
}

async function expectLoadedImage(locator: Locator) {
  await expect(locator).toBeVisible();
  await expect.poll(() => locator.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
}

async function runOneClickDemo(page: Page) {
  await page.goto("/");
  const responsePromise = page.waitForResponse((response) => response.url().includes("/api/measure") && response.request().method() === "POST");
  await page.getByRole("link", { name: "一键演示：+5 mm / 20°" }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  await expect(page).toHaveURL(/\/result\/[0-9a-f-]+$/);
  await expect(page.getByRole("heading", { name: "复测结果与影像证据" })).toBeVisible();
}

test.beforeEach(() => resetDemo());

test("首页显示 MP-03 和一键演示入口，且无浏览器错误", async ({ page }) => {
  const failures = collectBrowserFailures(page);
  await page.goto("/");
  await expect(page.getByText("MP-03", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("遵义桐梓 · 挡墙裂缝")).toBeVisible();
  await expect(page.getByRole("link", { name: "一键演示：+5 mm / 20°" })).toBeVisible();
  expect(failures).toEqual([]);
});

test("一键 Demo 显示 +4~6 mm 和三张真实证据图", async ({ page }) => {
  const failures = collectBrowserFailures(page);
  await runOneClickDemo(page);
  await expect(page.getByText("243.2 mm", { exact: true })).toBeVisible();
  const delta = page.locator(".delta-focus strong");
  const numericDelta = Number((await delta.textContent())?.replace(/[^0-9.-]/g, ""));
  expect(numericDelta).toBeGreaterThanOrEqual(4);
  expect(numericDelta).toBeLessThanOrEqual(6);
  await expectLoadedImage(page.getByAltText("本次上传的原始照片"));
  await expectLoadedImage(page.getByAltText("AprilTag 检测叠加图"));
  await expectLoadedImage(page.getByAltText("左右视觉标靶正视化图"));
  expect(failures).toEqual([]);
});

test("上传照片显示预览并把该文件提交到真实测量 API", async ({ page }) => {
  const failures = collectBrowserFailures(page);
  await page.goto("/capture");
  await page.setInputFiles('[data-testid="photo-input"]', sample);
  await expect(page.getByText("014_delta_5_angle_20.png", { exact: true })).toBeVisible();
  await expect(page.getByText("1920 × 1080", { exact: true })).toBeVisible();
  await expectLoadedImage(page.getByTestId("upload-preview"));
  const responsePromise = page.waitForResponse((response) => response.url().includes("/api/measure") && response.request().method() === "POST");
  await page.getByRole("button", { name: "开始测量" }).click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  await expect(page).toHaveURL(/\/result\/[0-9a-f-]+$/);
  await expectLoadedImage(page.getByAltText("本次上传的原始照片"));
  expect(failures).toEqual([]);
});

test("确认结果后进入记录页并显示三张证据图", async ({ page }) => {
  const failures = collectBrowserFailures(page);
  await runOneClickDemo(page);
  await page.getByRole("textbox", { name: "记录人" }).fill("Playwright 验收员");
  await page.getByRole("textbox", { name: "备注（可选）" }).fill("Golden Path 浏览器测试");
  await page.getByRole("button", { name: "确认结果并生成记录" }).click();
  await expect(page).toHaveURL(/\/record\/[0-9a-f-]+$/);
  await expect(page.getByText("已确认", { exact: true })).toBeVisible();
  await expectLoadedImage(page.getByAltText("本次上传的原始照片"));
  await expectLoadedImage(page.getByAltText("标靶检测叠加图"));
  await expectLoadedImage(page.getByAltText("透视校正对比图"));
  expect(failures).toEqual([]);
});

test("持久结果 URL 刷新后仍从 API 恢复结果", async ({ page }) => {
  const failures = collectBrowserFailures(page);
  await runOneClickDemo(page);
  const resultUrl = page.url();
  await page.reload();
  await expect(page).toHaveURL(resultUrl);
  await expect(page.getByRole("heading", { name: "复测结果与影像证据" })).toBeVisible();
  await expectLoadedImage(page.getByAltText("本次上传的原始照片"));
  expect(failures).toEqual([]);
});
