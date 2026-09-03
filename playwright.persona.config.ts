import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/persona",
  fullyParallel: true,
  reporter: "list",
});
