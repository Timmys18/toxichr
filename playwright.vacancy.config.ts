import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/vacancy",
  fullyParallel: false,
  reporter: "list",
  timeout: 120_000,
});
