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
  const responsePromise = page.waitForResponse((response) => response.url().includes("/api/measure") && response.request().method() === "POST");
  await page.getByRole("link", { name: "一分钟演示：复测这条墙缝" }).click();
  await expect(page.getByText("识别裂缝编号", { exact: true })).toBeVisible();
  expect((await responsePromise).status()).toBe(200);
  await expect(page).toHaveURL(/\/result\/[0-9a-f-]+$/);
  await expect(page.getByRole("heading", { name: "CRACK-W01" })).toBeVisible();
}

test.beforeEach(() => resetDemo());

test("首页先讲真实监测员与每天巡查至少三次", async ({ page }) => {
  const failures = collectBrowserFailures(page);
  await page.goto("/");
  await expect(page.getByText("我每天巡查隐患点不低于3次。", { exact: false })).toBeVisible();
  await expect(page.getByText("丈量墙体裂缝、比对每日数据，再填写巡查台账", { exact: false })).toBeVisible();
  await expect(page.getByText("当地已经有自动化监测设备", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: "一分钟演示：复测这条墙缝" })).toBeVisible();
  expect(failures).toEqual([]);
});

test("墙体照片上传后可见真实建筑表面与复测贴", async ({ page }) => {
  const failures = collectBrowserFailures(page);
  await page.goto("/capture");
  await page.setInputFiles('[data-testid="photo-input"]', sample);
  await expect(page.getByText("current_open_5mm_yaw20.png", { exact: true })).toBeVisible();
  await expectLoadedImage(page.getByAltText("真实建筑墙面裂缝与左右视觉复测贴"));
  await expect(page.getByTestId("recheck-sticker-indicator")).toContainText("左右视觉复测贴可见");
  expect(failures).toEqual([]);
});

test("一分钟 Demo 输出较上次张开 4–6 mm 与 before/after", async ({ page }) => {
  const failures = collectBrowserFailures(page);
  await runOneMinuteDemo(page);
  await expect(page.getByText("较上次张开", { exact: true })).toBeVisible();
  const opening = Number((await page.locator(".opening-number").textContent())?.replace(/[^0-9.-]/g, ""));
  expect(opening).toBeGreaterThanOrEqual(4);
  expect(opening).toBeLessThanOrEqual(6);
  await expectLoadedImage(page.getByAltText("上次墙体照片"));
  await expectLoadedImage(page.getByAltText("本次墙体照片"));
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
  await expect(page.locator(".record-delta")).toContainText("mm");
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
  await expect(page.getByRole("heading", { name: "真实的人" })).toBeVisible();
  await expect(page.getByRole("link", { name: /人民网贵州/ })).toBeVisible();
  await page.goto("/technology");
  await expect(page.getByText("我们没有发明摄影测量", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: /PhotoMicrometer Contrast/ })).toBeVisible();
  expect(failures).toEqual([]);
});
