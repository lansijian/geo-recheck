import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const sample = path.join(projectRoot, "data", "wall_demo", "images", "current_open_5mm_yaw20.png");

test("拍摄大面板支持拖拽上传", async ({ page }) => {
  await page.goto("/capture");

  const sampleBase64 = readFileSync(sample).toString("base64");
  await page.locator(".camera-panel").evaluate((panel, base64) => {
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
    const file = new File([bytes], "current_open_5mm_yaw20.png", { type: "image/png" });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    panel.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer }));
  }, sampleBase64);

  await expect(page.getByTestId("upload-preview")).toBeVisible();
  await expect(page.getByRole("button", { name: "开始分析" })).toBeEnabled();
});
