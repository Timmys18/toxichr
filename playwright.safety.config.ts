import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /ai-safety\.spec\.ts/,
  fullyParallel: true,
  reporter: "list",
});
