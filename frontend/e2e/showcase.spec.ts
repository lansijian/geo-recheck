import { expect, test, type Page } from "@playwright/test";

function collectBrowserFailures(page: Page) {
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  page.on("console", (message) => { if (message.type() === "error") failures.push(`console: ${message.text()}`); });
  page.on("response", (response) => { if (response.status() >= 400) failures.push(`network ${response.status()}: ${response.url()}`); });
  return failures;
}

async function moveTo(page: Page, stepNumber: number) {
  for (let index = 1; index < stepNumber; index += 1) {
    await page.getByTestId("showcase-next").click();
  }
}

test("V0.5 展示页包含现场、手机与解释三列且默认不访问外部 AI", async ({ page }) => {
  const failures = collectBrowserFailures(page);
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (!url.startsWith("http://127.0.0.1:5173") && !url.startsWith("http://127.0.0.1:8000")) externalRequests.push(url);
  });
  await page.goto("/showcase");
  await expect(page.getByTestId("showcase-page")).toBeVisible();
  await expect(page.getByTestId("showcase-scene")).toBeVisible();
  await expect(page.getByTestId("showcase-phone")).toBeVisible();
  await expect(page.getByTestId("showcase-sidebar")).toBeVisible();
  await expect(page.getByText("演示模式 · 本地已验证样例", { exact: true })).toBeVisible();
  expect(externalRequests).toEqual([]);
  expect(failures).toEqual([]);
});

test("默认渗水案例可手动完成八步并生成展示记录", async ({ page }) => {
  const failures = collectBrowserFailures(page);
  await page.goto("/showcase");
  await moveTo(page, 6);
  await expect(page.getByText("+4.8 mm", { exact: true })).toBeVisible();
  await expect(page.getByText("疑似新增水迹", { exact: true })).toBeVisible();
  await page.getByTestId("showcase-next").click();
  await page.getByRole("button", { name: "确认可见" }).click();
  await page.getByRole("button", { name: "确认并生成记录" }).click();
  await expect(page.getByText("SHOW-20260828-003", { exact: true })).toBeVisible();
  await expect(page.getByText("疑似新增水迹 · 已确认", { exact: true })).toBeVisible();
  expect(failures).toEqual([]);
});

test("质量失败故事拒绝输出毫米数且自动播放可暂停", async ({ page }) => {
  await page.goto("/showcase");
  await page.getByTestId("case-case_05_quality_fail").click();
  await page.getByTestId("showcase-autoplay").click();
  await expect(page.getByTestId("showcase-autoplay")).toHaveText("暂停");
  await page.getByTestId("showcase-autoplay").click();
  await moveTo(page, 6);
  await expect(page.getByText("未输出", { exact: true })).toBeVisible();
  await expect(page.getByText("图片质量不合格", { exact: true })).toBeVisible();
});

test("自动演示可在约一分钟内走到留痕页", async ({ page }) => {
  test.setTimeout(70_000);
  await page.goto("/showcase");
  await page.getByTestId("showcase-autoplay").click();
  await page.waitForTimeout(52_000);
  await expect(page.getByText("SHOW-20260828-003", { exact: true })).toBeVisible();
  await expect(page.getByText("记录已生成", { exact: true })).toBeVisible();
});

test("展示与实时模式边界明确分离", async ({ page }) => {
  await page.goto("/showcase");
  await page.getByTestId("live-mode").click();
  await expect(page.getByText("实时模式", { exact: true }).last()).toBeVisible();
  await expect(page.getByText(/真实调用本机 FastAPI/)).toBeVisible();
  await expect(page.getByText("实时模式 · 本机后端 + StepFun", { exact: true })).toBeVisible();
});
