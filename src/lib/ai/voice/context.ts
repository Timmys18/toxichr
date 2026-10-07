import type { PersonaId } from "@/lib/personas";
import type { ProfessionalAssessment } from "../professional-assessment";

export type VoicePolarity = "strength" | "concern" | "mixed" | "uncertain";
export type VoiceFact = { id: string; text: string };
export type VoiceContext = {
  persona: PersonaId;
  scenarios: string[];
  facts: VoiceFact[];
  evidence: Record<string, string[]>;
  confidence: number;
  intensity: number;
  assessment: { polarity: VoicePolarity; summary: string; limits: string[] };
};

/** Conservative recognizer, not a replacement for Professional Analyst.
 * Requires a grounded analyst finding/strength AND all source prerequisites.
 * Absence is never inferred merely from a short quote or a profession name.
 * Unrecognized situations deliberately use the bible without examples.
 */
export function voiceContext(assessment: ProfessionalAssessment, persona: PersonaId): VoiceContext {
  const facts = [...assessment.findings, ...assessment.strengths].map(e => ({ id: e.id, text: e.sourceQuote }));
  const evidence: Record<string, string[]> = {};
  const scenarios: string[] = [];
  const professionalContext = `${assessment.candidateContext.primaryProfession} ${assessment.candidateContext.claimedLevel}`;
  const allSources = facts.map(f => f.text).join("\n");
  const add = (scenario: string, signals: string[], id: string) => {
    if (!scenarios.includes(scenario)) scenarios.push(scenario);
    for (const signal of signals) evidence[signal] = [...new Set([...(evidence[signal] ?? []), id])];
  };
  // Both a missing detail and its subject must be explicit in analyst text.
  const missing = (value: string, subject: RegExp) => subject.test(value) && /не\s+(?:раскры|опис|указ|показ|назва|установ|измер|ясн)|неясн|неизвест|отсутств|не\s+позволяет|не\s+видно|не\s+хватает/iu.test(value);

  for (const f of assessment.findings) {
    if (f.confidence !== "high") continue;
    const q = f.sourceQuote, a = `${f.interpretation} ${f.issueType}`;
    if (/(?:отдел|команд)[^.!?\n]{0,100}(?:план|результат|выполн|достиг)/iu.test(q) && missing(a, /личн|собствен|участок|роль|вклад/iu) && !/(?:мой|моя|мо[её]|лично|отвечал за|мой участок)/iu.test(allSources))
      add("team-contribution", ["team-outcome", "unspecified-personal-role"], f.id);
    if (/\d+\s*(?:сотрудник|человек|подчин[её]н)/iu.test(q) && /руковод|начальник|директор/iu.test(`${q} ${professionalContext}`) && missing(a, /решени|управлен|действ/iu))
      add("management-duties", ["team-size", "generic-management"], f.id);
    if (/учебн|junior|начинающ/iu.test(`${q} ${professionalContext}`) && /(?:повысил|увеличил|поднял)[^.!?]{0,25}конверс/iu.test(q) && missing(a, /измер|провер|конверс/iu))
      add("junior-hypothesis", ["learning-project", "unexplained-outcome"], f.id);
    if (/(?:\d+|тр[её]х|три|двух|два)\s+объект/iu.test(q) && /строитель|строй/iu.test(`${q} ${professionalContext}`) && missing(a, /решени|действ|роль/iu))
      add("multi-project-role", ["project-count", "generic-control"], f.id);
    if (/скидк|снизил[^.!?]{0,20}цен/iu.test(q) && /\d+\s*%/u.test(q) && missing(a, /услов|сравнен|выгод/iu))
      add("price-vs-total", ["price-reduction", "unknown-other-terms"], f.id);
    if (/product.*project|project.*analyst|продукт.*проект.*аналит/iu.test(q) && /требован/iu.test(allSources) && /приоритет/iu.test(allSources) && /подрядчик/iu.test(allSources) && missing(a, /целевая|целевую|основная роль|позиционир|ваканси/iu))
      add("multi-role-position", ["multiple-roles", "substantiated-functions", "unknown-target"], f.id);
    if (/реклам|кампан/iu.test(q) && /продаж[^.!?]{0,25}(?:вырос|рост)|вырос[^.!?]{0,25}продаж/iu.test(q) && /отдел[^.!?]{0,35}расшир|цен[^.!?]{0,25}сниз/iu.test(allSources) && missing(a, /вклад|эффект|изолир|причин/iu))
      add("marketing-attribution", ["channel-change", "business-outcome", "unisolated-attribution"], f.id);
    if (/конфиденциал|раскрывать нельзя|не могу раскры/iu.test(q) && missing(a, /роль|задач|содержан|участок/iu))
      add("confidential-scope", ["confidentiality", "unspecified-scope"], f.id);
    if (/ответственн|коммуникабел|обучаюсь/iu.test(q) && missing(a, /професси|опыт|контекст|задач/iu) && !assessment.strengths.length && facts.every(item => !/внедрил|разработал|руководил|подготовил|согласовал/iu.test(item.text)))
      add("insufficient-input", ["insufficient-context"], f.id);
  }
  for (const s of assessment.strengths) {
    const q = s.sourceQuote;
    // Explicit negative outcomes override a mistakenly labelled strength.
    if (/не\s+(?:внедр|использ|сократ|прекрат)|не\s+удалось/iu.test(q)) continue;
    if (/sql|p95|запрос/iu.test(q) && /\d/iu.test(q) && /одинаков|сопоставим/iu.test(q) && /production|внедр/iu.test(q))
      add("comparable-tech", ["technical-action", "metric", "comparable-test", "deployment"], s.id);
    if (/документац/iu.test(q) && /передав|передач/iu.test(q) && /смен/iu.test(q) && /обучал/iu.test(q) && /сестр|медицин/iu.test(`${q} ${professionalContext}`))
      add("responsible-clinical-work", ["handover", "training", "documentation"], s.id);
    if (/согласов/iu.test(q) && /внедрен|внедрён/iu.test(q) && /повторн[^.!?]{0,60}прекрат/iu.test(q))
      add("useful-coordination", ["coordination", "implementation", "qualitative-outcome"], s.id);
    if (/передач[^.!?]{0,20}смен/iu.test(q) && /един[^.!?]{0,20}журнал/iu.test(q) && /больше не зависит|не зависит/iu.test(q))
      add("repeatable-process", ["handover-process", "shared-record", "qualitative-outcome"], s.id);
    if (/отч[её]т/iu.test(q) && /сократ/iu.test(q) && /сверк|шаблон/iu.test(q) && /с\s+(?:\d+|четыр[её]х|тр[её]х|двух)[^.!?]{0,40}до\s+(?:\d+|двух|одного|тр[её]х)/iu.test(q) && /закрыти/iu.test(q) && /прежн[^.!?]{0,20}состав|одинаков[^.!?]{0,20}состав/iu.test(q))
      add("financial-comparison", ["financial-action", "metric", "comparable-period", "bounded-outcome"], s.id);
    if (/баз[^.!?]{0,20}ответ/iu.test(q) && /нов[^.!?]{0,20}сотрудник/iu.test(q) && /актуальн[^.!?]{0,20}инструкц/iu.test(q) && /стар[^.!?]{0,20}чат/iu.test(q))
      add("support-service", ["knowledge-base", "repeatability", "qualitative-outcome"], s.id);
  }
  // The transition case needs BOTH transferable functions and a specific gap.
  const transition = assessment.findings.find(f => f.confidence === "high" && missing(f.interpretation, /моделирован[^.!?]{0,20}данн/iu));
  const transferable = assessment.strengths.find(s => /требован|процесс|запрос/iu.test(s.sourceQuote));
  if (transition && transferable && /переход[^.!?]{0,35}бизнес.анализ/iu.test(allSources) && !/работал[^.!?]{0,25}аналитик|в аналитической роли/iu.test(allSources)) {
    add("career-transfer", ["explicit-transition", "target-role", "missing-target-practice"], transition.id);
    evidence["transferable-functions"] = [transferable.id];
  }
  const polarity: VoicePolarity = assessment.findings.length && assessment.strengths.length ? "mixed" : assessment.findings.length ? "concern" : assessment.strengths.length ? "strength" : "uncertain";
  return {
    persona, facts, evidence, scenarios,
    confidence: Math.min(assessment.candidateContext.confidence, scenarios.includes("insufficient-input") ? 0.4 : 1),
    intensity: 3,
    assessment: { polarity: scenarios.includes("insufficient-input") ? "uncertain" : polarity, summary: assessment.professionalAssessment.overallImpression, limits: [...assessment.uncertainties, ...assessment.claimsNotAllowed] },
  };
}
