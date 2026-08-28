import path from "node:path";
import { expect, test } from "@playwright/test";
import { resolvePython } from "./helpers";

test("路径解析按平台返回正确的 Python", () => {
  delete process.env.GEORECHECK_PYTHON;
  expect(resolvePython("/repo", "win32")).toBe(path.join("/repo", ".venv", "Scripts", "python.exe"));
  expect(resolvePython("/repo", "darwin")).toBe(path.join("/repo", ".venv", "bin", "python"));
  expect(resolvePython("/repo", "linux")).toBe(path.join("/repo", ".venv", "bin", "python"));
});

test("可创建点位、下载复测贴并进入基线采集", async ({ page }) => {
  const pointId = `MP-E2E-${Date.now()}`;
  await page.goto("/points/new");
  await page.getByLabel("监测点编号").fill(pointId);
  await page.getByLabel("隐患点编号").fill("HZ-E2E-001");
  await page.getByLabel("隐患点名称").fill("E2E 隐患点");
  await page.getByLabel("监测点名称").fill("E2E 墙缝");
  await page.getByLabel("构筑物编号").fill("WALL-E2E");
  await page.getByLabel("构筑物名称").fill("E2E 墙体");
  await page.getByLabel("位置描述").fill("E2E 位置描述");
  await page.getByRole("button", { name: "创建监测点" }).click();

  await expect(page).toHaveURL(new RegExp(`/points/${pointId}$`));
  await expect(page.getByTestId("baseline-status")).toHaveText("未建档");
  await expect(page.getByTestId("marker-ids")).toContainText("左");
  await expect(page.getByRole("link", { name: "下载复测贴 PDF" }))
    .toHaveAttribute("href", new RegExp(`/api/points/${pointId}/sticker\\.pdf$`));

  await page.getByRole("link", { name: "采集基线" }).click();
  await expect(page).toHaveURL(new RegExp(`point=${pointId}&mode=baseline`));
});

test("管理列表显示新建的点位与建档状态", async ({ page }) => {
  await page.goto("/points");
  await expect(page.getByRole("heading", { name: "裂缝管理" })).toBeVisible();
  await expect(page.getByTestId("point-row").first()).toBeVisible();
});
