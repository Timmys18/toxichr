import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3100";
const serverUrl = new URL(baseURL);
const serverHost = serverUrl.hostname;
const serverPort = serverUrl.port || "3100";
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const localBrowser = executablePath
  ? { launchOptions: { executablePath, args: ["--no-sandbox"] } }
  : {};
const video = process.env.PLAYWRIGHT_DISABLE_VIDEO ? "off" : "retain-on-failure";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI
    ? [["line"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video,
  },
  webServer: {
    command: `npm run start -- --hostname ${serverHost} --port ${serverPort}`,
    url: `${baseURL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      DATABASE_URL: process.env.DATABASE_URL ?? "file:/tmp/toxichr-e2e.db",
      AUTH_SECRET: process.env.AUTH_SECRET ?? "e2e-only-secret-not-for-production",
      AI_PROVIDER: "mock",
      NEXT_PUBLIC_APP_URL: baseURL,
      BETA_PAYWALL_ENABLED: "false",
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], ...localBrowser },
      testIgnore: /mobile\.spec\.ts/,
    },
    {
      name: "mobile-chromium",
      use: executablePath
        ? {
            ...devices["Desktop Chrome"],
            viewport: { width: 412, height: 839 },
            ...localBrowser,
          }
        : { ...devices["Pixel 7"] },
      testMatch: /mobile\.spec\.ts/,
    },
  ],
});
