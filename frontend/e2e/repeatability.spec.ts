import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { expect, test } from "@playwright/test";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const python = "D:\\Anaconda\\_envs\\PulseWeave\\Scripts\\python.exe";

function resetDemo() {
  execFileSync(python, [path.join(projectRoot, "scripts", "reset_demo.py")], { cwd: projectRoot });
}

test("连续 10 次 Golden Path 均完成测量、图片加载、确认和记录", async ({ page }) => {
  test.setTimeout(120_000);
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(`pageerror: ${error.message}`));
  page.on("console", (message) => { if (message.type() === "error") failures.push(`console: ${message.text()}`); });
  page.on("response", (response) => { if (response.status() >= 400) failures.push(`network ${response.status()}: ${response.url()}`); });

  for (let run = 1; run <= 10; run += 1) {
    resetDemo();
    await page.goto("/");
    const responsePromise = page.waitForResponse((response) => response.url().includes("/api/measure") && response.request().method() === "POST");
    await page.getByRole("link", { name: "一键演示：+5 mm / 20°" }).click();
    expect((await responsePromise).status(), `run ${run} measure response`).toBe(200);
    await expect(page).toHaveURL(/\/result\/[0-9a-f-]+$/);
    await expect(page.getByText("243.2 mm", { exact: true }), `run ${run} baseline`).toBeVisible();
    const delta = Number((await page.locator(".delta-focus strong").textContent())?.replace(/[^0-9.-]/g, ""));
    expect(delta, `run ${run} delta`).toBeGreaterThanOrEqual(4);
    expect(delta, `run ${run} delta`).toBeLessThanOrEqual(6);
    const resultImages = page.locator(".evidence-stage img");
    await expect(resultImages, `run ${run} result images`).toHaveCount(3);
    for (let index = 0; index < 3; index += 1) {
      await expect.poll(() => resultImages.nth(index).evaluate((image: HTMLImageElement) => image.naturalWidth), { message: `run ${run} image ${index}` }).toBeGreaterThan(0);
    }
    await page.getByRole("textbox", { name: "记录人" }).fill(`重复性验收 ${run}`);
    await page.getByRole("button", { name: "确认结果并生成记录" }).click();
    await expect(page).toHaveURL(/\/record\/[0-9a-f-]+$/);
    const recordImages = page.locator(".record-evidence img");
    await expect(recordImages, `run ${run} record images`).toHaveCount(3);
    for (let index = 0; index < 3; index += 1) {
      await expect.poll(() => recordImages.nth(index).evaluate((image: HTMLImageElement) => image.naturalWidth), { message: `run ${run} record image ${index}` }).toBeGreaterThan(0);
    }
  }

  expect(failures).toEqual([]);
});
