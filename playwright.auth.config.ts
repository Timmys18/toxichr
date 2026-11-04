import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/auth",
  fullyParallel: false,
  workers: 1,
  reporter: "list",
});
