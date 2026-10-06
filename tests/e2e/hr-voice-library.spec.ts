import { expect, test } from "@playwright/test";
import corpus from "../../src/lib/ai/voice/corpus.json";
import { runAnalysisPipeline } from "../../src/lib/ai/pipeline";

// Authored editorial fixtures ONLY. These screenshots are not live Yandex output.
for (const personaId of ["tamara", "lera", "gleb", "vadik"] as const) {
  test(`${personaId}: редакционная fixture читается на desktop/mobile; limited обозначен`, async ({ page }) => {
    const sample = corpus.entries.find(e => e.caseId === "C05" && e.persona === personaId)!;
    const previousProvider = process.env.AI_PROVIDER;
    process.env.AI_PROVIDER = "mock";
    let report;
    try { report = (await runAnalysisPipeline({ resumeText: sample.sourceFragment, personaId })).report; }
    finally { if (previousProvider === undefined) delete process.env.AI_PROVIDER; else process.env.AI_PROVIDER = previousProvider; }
    report.verdict.comment = sample.outputExample;
    const id = "voice-fixture";
    const response = () => ({ report, personaId, resumeId: "synthetic-resume", resultMode: "live" });
    await page.route(`**/api/analyses/${id}`, route => route.fulfill({ json: response() }));
    await page.route("**/api/payments/access?*", route => route.fulfill({ json: { hasPackage: false } }));
    await page.goto(`/session?view=${id}`);
    await expect(page.locator(".diag")).toContainText(sample.outputExample);
    await expect(page.getByText("Ограниченный разбор", { exact: true })).toHaveCount(0);
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 900 });
      await expect.poll(() => page.locator(".diag").evaluate(el => el.getBoundingClientRect().right <= window.innerWidth - 8)).toBe(true);
      await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      await page.screenshot({ path: `tests/artifacts/hr-voices-v02/fixture-${personaId}-${width}.png`, fullPage: true, animations: "disabled" });
    }
    if (personaId === "tamara") {
      report.generationMeta!.voice!.status = "limited";
      await page.reload();
      await expect(page.getByText("Ограниченный разбор", { exact: true })).toBeVisible();
      for (const width of [1280, 390]) {
        await page.setViewportSize({ width, height: 900 });
        await expect.poll(() => page.locator(".ds-result-mode").evaluate(el => el.getBoundingClientRect().right <= window.innerWidth - 8)).toBe(true);
        await page.screenshot({ path: `tests/artifacts/hr-voices-v02/fixture-limited-${width}.png`, fullPage: true, animations: "disabled" });
      }
    }
  });
}
