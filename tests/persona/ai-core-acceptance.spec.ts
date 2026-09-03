import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

import type { PersonaId } from "../../src/lib/personas";
import { parseGroundedAssessment } from "../../src/lib/ai/professional-assessment";
import {
  buildSharePrivacyContext,
  scorePersonaQuality,
  validatePersonaDraft,
  type PersonaDraft,
  type PersonaQualityMetrics,
} from "../../src/lib/ai/writer-validator";

const artifact = (name: string) => resolve(process.cwd(), "tests", "artifacts", "ai", name);
const json = <T>(name: string): T => JSON.parse(readFileSync(artifact(name), "utf8")) as T;

test("одно профессиональное заключение даёт четыре различимых голоса", () => {
  const resume = readFileSync(artifact("management-resume.txt"), "utf8");
  const assessment = json<ReturnType<typeof parseGroundedAssessment>["assessment"]>("management-assessment.json");
  const grounded = parseGroundedAssessment(assessment, resume);
  expect(grounded.errors).toEqual([]);
  expect(grounded.assessment).not.toBeNull();
  const ids = new Set([...(assessment?.findings ?? []).map((item) => item.id), ...(assessment?.strengths ?? []).map((item) => item.id)]);
  const results = json<Record<PersonaId, PersonaDraft>>("management-personas.json");
  const expectedMetrics = json<{ management: Record<PersonaId, PersonaQualityMetrics> }>("quality-metrics.json").management;
  const texts = new Set<string>();
  for (const personaId of ["tamara", "lera", "gleb", "vadik"] as const) {
    const validation = validatePersonaDraft(results[personaId], ids, {
      personaId,
      privacy: buildSharePrivacyContext(resume),
      enforceVoice: true,
    });
    expect(validation.errors, personaId).toEqual([]);
    const metrics = scorePersonaQuality(results[personaId], ids, personaId);
    expect(metrics, `${personaId}: метрики должны совпадать с сохранённым acceptance-артефактом`).toEqual(expectedMetrics[personaId]);
    expect(metrics.grounding, personaId).toBe("pass");
    for (const key of ["professionalDepth", "specificity", "personaDistinctiveness", "sarcasm", "punchQuality", "usefulness"] as const) {
      expect(metrics[key], `${personaId}.${key}`).toBeGreaterThanOrEqual(4);
    }
    texts.add(results[personaId].contentBlocks.map((block) => block.content).join(" "));
  }
  expect(texts.size).toBe(4);
});

for (const fixtureName of ["strong-case.json", "weak-case.json"] as const) {
  test(`${fixtureName}: оценка привязана к исходнику, голос и польза проходят порог`, () => {
    const fixture = json<{ resume: string; assessment: NonNullable<ReturnType<typeof parseGroundedAssessment>["assessment"]>; personaId: PersonaId; result: PersonaDraft }>(fixtureName);
    expect(parseGroundedAssessment(fixture.assessment, fixture.resume).errors).toEqual([]);
    const ids = new Set([...fixture.assessment.findings.map((item) => item.id), ...fixture.assessment.strengths.map((item) => item.id)]);
    const validation = validatePersonaDraft(fixture.result, ids, { personaId: fixture.personaId, enforceVoice: true });
    expect(validation.errors).toEqual([]);
    const metricKey = fixtureName === "strong-case.json" ? "strong" : "weak";
    const expectedMetrics = json<Record<"strong" | "weak", PersonaQualityMetrics>>("quality-metrics.json")[metricKey];
    expect(validation.quality).toEqual(expectedMetrics);
    expect(validation.quality?.grounding).toBe("pass");
    for (const key of ["professionalDepth", "specificity", "personaDistinctiveness", "sarcasm", "punchQuality", "usefulness"] as const) {
      expect(validation.quality?.[key], key).toBeGreaterThanOrEqual(4);
    }
    if (fixtureName === "strong-case.json") expect(fixture.assessment.findings).toHaveLength(0);
    if (fixtureName === "weak-case.json") expect(fixture.assessment.findings.length).toBeGreaterThanOrEqual(3);
  });
}

test("разные профессии не сводятся к одному набору универсальных признаков", () => {
  const profiles = json<Array<{ profile: string; focus: string[] }>>("cross-profession.json");
  expect(profiles).toHaveLength(6);
  expect(new Set(profiles.map((item) => item.focus.join("|"))).size).toBe(profiles.length);
  const universal = /цифр|масштаб|команд|деньг/iu;
  expect(profiles.every((item) => item.focus.every((focus) => universal.test(focus)))).toBe(false);
});

test("валидатор не разрешает оценивать способности человека через вводные слова", () => {
  const result = json<Record<PersonaId, PersonaDraft>>("management-personas.json").vadik;
  const unsafe = structuredClone(result);
  unsafe.verdict.comment = "Профиль читается как человек, который умеет доводить проекты до результата, но текст не раскрывает способ работы.";
  const ids = new Set(unsafe.contentBlocks.flatMap((block) => block.findingIds));
  const validation = validatePersonaDraft(unsafe, ids, { personaId: "vadik", enforceVoice: true });
  expect(validation.errors).toContain("оценка способности человека вместо текста резюме");
});

test("валидатор не пропускает отвлечённую оценку способности", () => {
  const result = json<Record<PersonaId, PersonaDraft>>("management-personas.json").gleb;
  const unsafe = structuredClone(result);
  unsafe.contentBlocks[0].content = "Фраза выглядит как важный признак способности собирать управленческий контур, хотя текст этого не раскрывает.";
  const ids = new Set(unsafe.contentBlocks.flatMap((block) => block.findingIds));
  const validation = validatePersonaDraft(unsafe, ids, { personaId: "gleb", enforceVoice: true });
  expect(validation.errors).toContain("оценка способности человека вместо текста резюме");
});

test("валидатор не пропускает необязательный английский управленческий жаргон", () => {
  const result = json<Record<PersonaId, PersonaDraft>>("management-personas.json").tamara;
  const unsafe = structuredClone(result);
  unsafe.verdict.comment = "Масштаб указан, но governance роли и senior-level ответственность в резюме не раскрыты.";
  const ids = new Set(unsafe.contentBlocks.flatMap((block) => block.findingIds));
  const validation = validatePersonaDraft(unsafe, ids, { personaId: "tamara", enforceVoice: true });
  expect(validation.errors).toContain("необязательный английский жаргон в русском тексте");
});
