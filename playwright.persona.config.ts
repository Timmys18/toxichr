import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/persona",
  // Database-backed persona tests share a single SQLite file in CI.
  fullyParallel: false,
  workers: 1,
  reporter: "list",
});
