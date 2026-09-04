import { defineConfig, devices } from "@playwright/test";

const baseURL = "http://127.0.0.1:3102";
// Тест создаёт подтверждённый пакет напрямую в изолированной test-БД, чтобы
// проверить серверные лимиты без настоящего платёжного провайдера.
process.env.DATABASE_URL = "file:/tmp/toxichr-e2e.db";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /monetization\.spec\.ts/,
  fullyParallel: false,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: "list",
  use: { baseURL, trace: "retain-on-failure", screenshot: "only-on-failure" },
  webServer: {
    command: "npm run db:push && npm run start -- --hostname 127.0.0.1 --port 3102",
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: "file:/tmp/toxichr-e2e.db",
      AUTH_SECRET: "monetization-only-secret-not-for-production",
      AI_PROVIDER: "mock",
      NEXT_PUBLIC_APP_URL: baseURL,
      BETA_PAYWALL_ENABLED: "true",
    },
  },
  projects: [{ name: "chromium", use: devices["Desktop Chrome"] }],
});
