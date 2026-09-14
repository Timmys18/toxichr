import type { PersonaId } from "@/lib/personas";
import type { ProfessionalAssessment } from "./professional-assessment";

const optics = {
  tamara: { angle: "Масштаб ответственности и границы полномочий", terms: /руковод|полномоч|команд|директор|утверд|ответствен|самостоятель|архитектур/giu, question: "Какие решения в этом фрагменте были вашими, а какие требовали согласования?" },
  lera: { angle: "Позиционирование и отличие от соседних резюме", terms: /специализац|платформ|платёж|антифрод|исследован|сервис|профил|отрасл/giu, question: "Какой конкретный результат из этого фрагмента стоит показать сразу рядом со специализацией?" },
  gleb: { angle: "Причинная связь между решением и результатом", terms: /сниз|сократ|вырос|рост|улучш|результат|эффект|\d/giu, question: "Как вы отделяли эффект названного решения от остальных изменений за тот же период?" },
  vadik: { angle: "Личное действие и практическая польза", terms: /пров[её]л|спроектир|пересобр|внедр|запуст|устран|обуч|подготов|утверд|перераспредел|личн/giu, question: "Какая часть работы здесь твоя и какую рабочую проблему она сняла?" },
} satisfies Record<PersonaId, { angle: string; terms: RegExp; question: string }>;

export function personaFocus(assessment: ProfessionalAssessment, personaId: PersonaId) {
  const optic = optics[personaId];
  const evidence = [...assessment.strengths, ...assessment.findings];
  const ranked = evidence.map((item, index) => ({ item, index, weight: (item.sourceQuote.match(optic.terms) ?? []).length }))
    .sort((a, b) => b.weight - a.weight || a.index - b.index);
  return { angle: optic.angle, question: optic.question, evidence: ranked.slice(0, 2).map(({ item }) => item) };
}
