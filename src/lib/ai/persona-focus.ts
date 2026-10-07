import type { PersonaId } from "@/lib/personas";
import type { ProfessionalAssessment } from "./professional-assessment";

const optics: Record<PersonaId, { angle: string; terms: RegExp }> = {
  tamara: { angle: "Ответственность, полномочия и зрелость организации работы", terms: /руковод|полномоч|команд|ответствен|управлен|устойчив/iu },
  lera: { angle: "Понятность профиля и заметность сильного профессионального сигнала", terms: /специализац|профил|позиционир|заголов|сигнал|понятн/iu },
  gleb: { angle: "Допустимый вывод, условия сравнения и причинность", terms: /причин|сравнен|вывод|услов|измер|гипотез/iu },
  vadik: { angle: "Практическая работа, личная зона и доведение", terms: /личн|действ|внедр|запуст|пересобр|передач|польз/iu },
};

export function personaFocus(assessment: ProfessionalAssessment, personaId: PersonaId) {
  const optic = optics[personaId];
  const evidence = [...assessment.findings, ...assessment.strengths];
  const ranked = evidence.map((item, index) => ({
    item, index,
    weight: ("severity" in item && item.severity === "critical" ? 100 : 0) + (optic.terms.test(item.interpretation) ? 2 : 0),
  })).sort((a, b) => b.weight - a.weight || a.index - b.index);
  return {
    angle: optic.angle,
    instruction: "Это интерес персоны, не обязательный вопрос или недостаток. Если материал сильный, признайте силу; если сведений мало, ограничьте вывод.",
    questions: assessment.questionsCreatedByResume,
    evidence: ranked.slice(0, 2).map(({ item }) => item),
  };
}
