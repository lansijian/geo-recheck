import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { resolvePython } from "./helpers";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const python = resolvePython(projectRoot);

function resetDemo() {
  execFileSync(python, [path.join(projectRoot, "scripts", "reset_demo.py")], { cwd: projectRoot });
}

test("连续 10 次一分钟 Golden Path 均完成相对张开、确认和记录", async ({ page }) => {
  test.setTimeout(150_000);
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  page.on("console", (message) => { if (message.type() === "error") failures.push(`console: ${message.text()}`); });
  page.on("response", (response) => { if (response.status() >= 400) failures.push(`network ${response.status()}: ${response.url()}`); });

  for (let run = 1; run <= 10; run += 1) {
    resetDemo();
    await page.goto("/");
    await page.getByRole("link", { name: "直接进入技术操作页" }).click();
    const responsePromise = page.waitForResponse((response) => response.url().includes("/api/measure") && response.request().method() === "POST");
    await page.getByRole("button", { name: "开始分析" }).click();
    expect((await responsePromise).status(), `run ${run} measure response`).toBe(200);
    await expect(page).toHaveURL(/\/result\/[0-9a-f-]+$/);
    await expect(page.getByText("较基线累计", { exact: true }), `run ${run} semantics`).toBeVisible();
    const opening = Number((await page.locator(".opening-number").textContent())?.replace(/[^0-9.-]/g, ""));
    expect(opening, `run ${run} opening`).toBeGreaterThanOrEqual(4);
    expect(opening, `run ${run} opening`).toBeLessThanOrEqual(6);
    for (const alt of ["AI 输入的上次裂缝近景", "AI 输入的本次裂缝近景"]) {
      const image = page.getByAltText(alt);
      await expect(image, `run ${run} ${alt}`).toBeVisible();
      await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBeGreaterThan(0);
    }
    await page.getByRole("textbox", { name: "记录人" }).fill(`重复性验收 ${run}`);
    await page.getByRole("button", { name: "确认并生成记录" }).click();
    await expect(page).toHaveURL(/\/record\/[0-9a-f-]+$/);
    await expect(page.getByText("CRACK-W01", { exact: true }), `run ${run} crack id`).toBeVisible();
    await expect(page.locator(".record-opening strong"), `run ${run} opening record`).toContainText("mm");
    const recordImages = page.locator(".record-evidence img");
    await expect(recordImages, `run ${run} record images`).toHaveCount(3);
    for (let index = 0; index < 3; index += 1) {
      await expect.poll(() => recordImages.nth(index).evaluate((node: HTMLImageElement) => node.naturalWidth)).toBeGreaterThan(0);
    }
  }
  expect(failures).toEqual([]);
});
