/**
 * Живой прогон движка разбора на тестовом резюме.
 * Запуск: npx tsx scripts/live-run.ts [persona]
 */
import { config } from "dotenv";
config();

import { runAnalysisPipeline } from "@/lib/ai/pipeline";
import type { PersonaId } from "@/lib/personas";
import { guessCandidateFirstName } from "@/lib/documents/candidate-name";

const RESUME = `Тимур Шакиров
Руководитель проектов

Опыт работы

Компания «ТехноГрад», руководитель проектов, 2021 — н.в.
- Руководил командой в рамках стратегических проектов
- Обеспечивал эффективное взаимодействие подразделений
- Отвечал за координацию работ с подрядчиками
- Участвовал в оптимизации ключевых бизнес-процессов
- Осуществлял контроль исполнения бюджета проектов
- Повысил эффективность работы отдела

Компания «СтройИнвест», менеджер проектов, 2019 — 2021
- Курировал реализацию строительных проектов
- Взаимодействовал с заказчиками и поставщиками
- Готовил отчётность для руководства
- Сократил цикл согласования заявок с 18 до 7 рабочих дней

Компания «Альфа», аналитик, 2018 — 2019
- Анализировал данные, готовил презентации
- Участвовал в проектах внедрения CRM

Навыки: ответственный, коммуникабельный, стрессоустойчивый, data-driven,
result-oriented, работа в условиях многозадачности.

Многие проекты под NDA, детали раскрыть не могу.`;

async function main() {
  const persona = (process.argv[2] as PersonaId) || "vadik";
  const name = guessCandidateFirstName(RESUME);
  console.log(`\n=== ЖИВОЙ ПРОГОН · персонаж: ${persona} · имя: ${name ?? "—"} ===\n`);

  const t0 = Date.now();
  const result = await runAnalysisPipeline({
    resumeText: RESUME,
    personaId: persona,
    onEvent: (e) => {
      if (e.type === "stage") console.log(`  [${e.stage}] ${e.status}`);
      if (e.type === "finding") console.log(`  · ${e.message}`);
    },
  });
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  const r = result.report;

  console.log(`\n--- ПРОФИЛЬ ---`);
  console.log(`${r.candidateProfile.primaryRole} · заявлен ${r.candidateProfile.claimedLevel} / доказан ${r.candidateProfile.inferredLevel}`);
  console.log(`\n--- БАЛЛ ---  ${r.score.total}/100`);
  console.log(`  доказательства ${r.score.evidence} · вклад ${r.score.personalContribution} · уровень ${r.score.seniorityConsistency}`);
  console.log(`\n--- ВЕРДИКТ ---`);
  console.log(`«${r.verdict.title}»`);
  console.log(r.verdict.comment);
  console.log(`\n--- РАЗБОР (первое впечатление) ---`);
  console.log(r.hrReview.firstImpression);
  console.log(`\n--- РАЗБОР (глубоко) ---`);
  console.log(r.hrReview.deepDive);
  console.log(`\n--- НАЙМ ---`);
  console.log(r.hrReview.hiringTake);
  console.log(`\n--- ТОП-ПРОБЛЕМЫ ---`);
  r.topProblems.slice(0, 4).forEach((p, i) => {
    console.log(`\n${i + 1}. [${p.severity}] ${p.title}`);
    console.log(`   цитата: «${p.quote}»`);
    console.log(`   удар:   ${p.roast}`);
  });
  console.log(`\n--- ШЕР-ЦИТАТЫ ---`);
  r.shareQuotes.forEach((q) => console.log(`  (${q.kind}) ${q.text}`));

  console.log(`\n=== провайдер ${result.provider}/${result.model} · $${result.costUsd.toFixed(4)} · ${dt}с ===\n`);
}

main().catch((e) => {
  console.error("ОШИБКА:", e instanceof Error ? e.message : e);
  process.exit(1);
});
