import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { expect, test } from "@playwright/test";
import { resolvePython } from "./helpers";

test("路径解析按平台返回正确的 Python", () => {
  const original = process.env.GEORECHECK_PYTHON;
  delete process.env.GEORECHECK_PYTHON;
  try {
    expect(resolvePython("/repo", "win32")).toBe(path.join("/repo", ".venv", "Scripts", "python.exe"));
    expect(resolvePython("/repo", "darwin")).toBe(path.join("/repo", ".venv", "bin", "python"));
    expect(resolvePython("/repo", "linux")).toBe(path.join("/repo", ".venv", "bin", "python"));
  } finally {
    if (original === undefined) delete process.env.GEORECHECK_PYTHON;
    else process.env.GEORECHECK_PYTHON = original;
  }
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
  await expect(page.getByTestId("baseline-status")).toHaveText("基线待建立");
  await expect(page.getByTestId("marker-ids")).toContainText("左");
  await expect(page.getByRole("link", { name: "下载复测贴 PDF" }))
    .toHaveAttribute("href", new RegExp(`/api/points/${pointId}/sticker\\.pdf$`));

  await page.getByRole("link", { name: "采集基线" }).click();
  await expect(page).toHaveURL(new RegExp(`point=${pointId}&mode=baseline`));
});

test("管理列表显示新建的点位与建档状态", async ({ page }) => {
  await page.goto("/points");
  await expect(page.getByRole("heading", { name: "监测点" })).toBeVisible();
  await expect(page.getByTestId("point-row").first()).toBeVisible();
});

test("真实点位完成不同角度基线、复测、AI 人工处置与正式记录", async ({ page, request }) => {
  test.setTimeout(90_000);
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const python = resolvePython(root);
  const pointId = `MP-E2E-FULL-${Date.now()}`;
  const created = await request.post("/api/points", { data: {
    monitor_point_id: pointId, hazard_id: "HZ-E2E-FULL", hazard_name: "路演测试隐患点",
    monitor_point_name: "挡墙固定裂缝", structure_id: "WALL-E2E-FULL",
    structure_name: "试验挡墙", location_description: "路演场地东侧挡墙",
  } });
  expect(created.ok()).toBe(true);
  const point = await created.json() as { left_marker_group: number[]; right_marker_group: number[] };
  const photos = fs.mkdtempSync(path.join(os.tmpdir(), "geo-recheck-e2e-"));
  execFileSync(python, [path.join(root, "scripts", "make_point_photos.py"), "--left", point.left_marker_group.join(","), "--right", point.right_marker_group.join(","), "--output", photos], { cwd: root });

  const contextUpload = await request.put(`/api/points/${pointId}/context-photo`, { multipart: {
    image: { name: "context.png", mimeType: "image/png", buffer: fs.readFileSync(path.join(photos, "baseline-angle-06.png")) },
  } });
  expect(contextUpload.ok()).toBe(true);

  await page.goto(`/points/${pointId}`);
  await expect(page.getByText("点位身份与监测对象")).toBeVisible();
  await expect(page.getByText("较基线累计张开")).toBeVisible();
  await page.getByRole("link", { name: "采集基线" }).click();
  await page.setInputFiles('[data-testid="photo-input"]', path.join(photos, "baseline-angle-06.png"));
  await page.getByRole("button", { name: "开始分析" }).click();
  await expect(page).toHaveURL(/\/result\/[0-9a-f-]+$/);
  await expect(page.getByText("基线已建立", { exact: true }).first()).toBeVisible();
  await page.getByLabel("记录人").fill("路演监测员");
  await page.getByRole("button", { name: "确认并生成记录" }).click();
  await expect(page).toHaveURL(/\/record\/[0-9a-f-]+$/);

  await page.goto(`/points/${pointId}`);
  await page.getByRole("main").getByRole("link", { name: "开始复测" }).click();
  await page.setInputFiles('[data-testid="photo-input"]', path.join(photos, "recheck-angle-17.png"));
  await page.getByRole("button", { name: "开始分析" }).click();
  await expect(page).toHaveURL(/\/result\/[0-9a-f-]+$/);
  await expect(page.getByText("较基线累计", { exact: true })).toBeVisible();
  await expect(page.getByText("图3 · 本次近景（不同角度）")).toBeVisible();
  const inspectionId = page.url().split("/").at(-1)!;
  execFileSync(python, [path.join(root, "scripts", "seed_e2e_ai_review.py"), "--inspection", inspectionId], { cwd: root });
  await page.reload();
  const acceptedFinding = page.locator(".finding").filter({ hasText: "墙面可见变化" });
  await acceptedFinding.getByRole("button", { name: "确认" }).click();
  const rejectedFinding = page.locator(".finding").filter({ hasText: "图片覆盖不足" });
  await rejectedFinding.getByRole("button", { name: "不采纳" }).click();
  await page.getByLabel("记录人").fill("路演监测员");
  await page.getByLabel("备注（可选）").fill("不同角度复测，复测贴完整入镜。");
  await page.getByRole("button", { name: "确认并生成记录" }).click();
  await expect(page).toHaveURL(/\/record\/[0-9a-f-]+$/);
  await expect(page.getByText("用户点位现场采集 / 几何复测")).toBeVisible();
  await expect(page.getByText("已确认写入", { exact: true })).toBeVisible();
  await expect(page.getByText("不同角度复测，复测贴完整入镜。")).toBeVisible();
});

test("真实点位质量失败停留在原点位重拍且不回退演示", async ({ page, request }) => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const python = resolvePython(root);
  const pointId = `MP-E2E-FAIL-${Date.now()}`;
  const created = await request.post("/api/points", { data: { monitor_point_id: pointId, hazard_id: "HZ-E2E-FAIL", hazard_name: "质量门测试", monitor_point_name: "质量门裂缝", structure_id: "WALL-E2E-FAIL", structure_name: "质量门挡墙", location_description: "测试位置" } });
  const point = await created.json() as { left_marker_group: number[]; right_marker_group: number[] };
  const photos = fs.mkdtempSync(path.join(os.tmpdir(), "geo-recheck-fail-"));
  execFileSync(python, [path.join(root, "scripts", "make_point_photos.py"), "--left", point.left_marker_group.join(","), "--right", point.right_marker_group.join(","), "--output", photos], { cwd: root });
  await page.goto(`/capture?point=${pointId}&mode=baseline`);
  await page.setInputFiles('[data-testid="photo-input"]', path.join(photos, "quality-fail.png"));
  await page.getByRole("button", { name: "开始分析" }).click();
  await expect(page).toHaveURL(new RegExp(`point=${pointId}&mode=baseline`));
  await expect(page.getByRole("alert")).toBeVisible();
  expect(page.url()).not.toContain("demo=1");
  await page.setInputFiles('[data-testid="photo-input"]', path.join(photos, "baseline-angle-06.png"));
  await expect(page.getByTestId("upload-preview")).toBeVisible();
});
