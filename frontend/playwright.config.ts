import { defineConfig, devices } from "@playwright/test";

const devServerCommand =
  process.platform === "win32"
    ? "set STEPFUN_AI_REVIEW_ENABLED=false&& ..\\scripts\\run_dev.cmd"
    : "STEPFUN_AI_REVIEW_ENABLED=false ../.venv/bin/python ../scripts/run_dev.py";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { outputFolder: "../artifacts/playwright-report", open: "never" }]],
  outputDir: "../artifacts/playwright",
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Keep browser regression deterministic and prevent a developer's local
    // StepFun credentials from triggering live requests during database resets.
    command: devServerCommand,
    url: "http://127.0.0.1:5173",
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
