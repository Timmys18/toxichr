import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const folder = dirname(fileURLToPath(import.meta.url));
const output = join(folder, "screenshots");
await mkdir(output, { recursive: true });

const browser = await chromium.launch({ headless: true });
try {
  for (const [view, width, height, suffix] of [
    ["report", 1440, 1000, "desktop"],
    ["cabinet", 1440, 1000, "desktop"],
    ["report", 390, 844, "mobile"],
    ["cabinet", 390, 844, "mobile"],
  ]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.goto(`http://127.0.0.1:5175/prototypes/release-mockups/v2/#${view}`, { waitUntil: "load" });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: join(output, `${view}-${suffix}.png`), fullPage: true });
    await page.close();
  }
} finally {
  await browser.close();
}
