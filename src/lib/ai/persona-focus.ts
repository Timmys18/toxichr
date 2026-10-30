import type { PersonaId } from "@/lib/personas";
import type { ProfessionalAssessment } from "./professional-assessment";

const optics: Record<PersonaId, { angle: string; terms: RegExp; preference: string }> = {
  tamara: { angle: "Ответственность, полномочия и зрелость организации работы", terms: /руковод|полномоч|команд|ответствен|управлен|устойчив/iu, preference: "Когда материала достаточно, ищи, как устроена ответственность и организация работы; не своди управленческую историю к пересказу одной процедуры." },
  lera: { angle: "Понятность профиля и заметность сильного профессионального сигнала", terms: /специализац|профил|позиционир|заголов|сигнал|понятн/iu, preference: "Когда материала достаточно, ищи самый неожиданный сильный профессиональный сигнал или разрыв между образом и содержанием, а не пересказывай первый рабочий эпизод." },
  gleb: { angle: "Допустимый вывод, условия сравнения и причинность", terms: /причин|сравнен|вывод|услов|измер|гипотез|эффект|результат/iu, preference: "Когда материала достаточно, ищи интересную границу вывода, связь фактов или корректность сравнения; не изображай сомнение, если его нет." },
  vadik: { angle: "Практическая работа, личная зона и доведение", terms: /личн|действ|внедр|запуст|пересобр|передач|польз/iu, preference: "Когда материала достаточно, ищи конкретный поворот в выполнении работы: что изменилось, передано или доведено; не подменяй это общим разговором об образе кандидата." },
};

export function personaPreference(personaId: PersonaId): string {
  return optics[personaId].preference;
}

export function personaFocus(assessment: ProfessionalAssessment, personaId: PersonaId, independent = false) {
  const optic = optics[personaId];
  const evidence = [...assessment.findings, ...assessment.strengths];
  const severityWeight: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
  const ranked = evidence.map((item, index) => ({
    item, index,
    weight: (optic.terms.test(`${item.sourceQuote} ${item.interpretation} ${"whyItMatters" in item ? item.whyItMatters : ""}`) ? 10 : 0)
      + ("severity" in item && typeof item.severity === "string" ? severityWeight[item.severity] ?? 0 : 0),
  })).sort((a, b) => b.weight - a.weight || a.index - b.index);
  return {
    angle: optic.angle,
    ...(independent ? { preference: optic.preference } : {}),
    instruction: "Это интерес персоны, не обязательный вопрос или недостаток. Если материал сильный, признайте силу; если сведений мало, ограничьте вывод.",
    questions: assessment.questionsCreatedByResume,
    evidence: ranked.slice(0, 2).map(({ item }) => item),
  };
}
