import { resumeHash } from "../../src/lib/ai/coordinated-plan";
export const cases = [
  "Аккаунт-менеджер. Продлевала договоры и согласовывала условия с юристами. Команда сохранила 85% клиентов; личный вклад не измерялся. Подготовила список открытых вопросов; менеджеры используют его на еженедельной встрече.",
  "Планировщик ремонтов. Составляла недельный график ремонта насосов. После изменения срока поставки деталей перенесла две задачи, очередность остальных сохранилась. Журнал замечаний мастера использовали на планёрках. Простой отдельно не рассчитывала.",
  "Бухгалтер. Самостоятельно закрывала участок расчётов с поставщиками. Сверила акты и устранила расхождения между реестром и первичными документами. Налоговую отчётность готовил главный бухгалтер.",
];
export function planFor(text: string) {
 const unknown = { value: "не установлен", quotes: [] as string[], reason: "Недостаточно оснований" };
 const context = { primaryProfession: "не установлен", industry: "не установлен", claimedLevel: "не установлен", inferredLevel: "не установлен", secondaryContext: "", careerPattern: "", confidence: .5 };
 const assessment = { candidateContext: context, professionalAssessment: { overallImpression: "Текст содержит конкретные действия и ограничения результата.", strongestProfessionalSignal: "Указано конкретное действие.", mainResumeProblem: "Существенный недостаток не установлен.", seniorityConsistency: "Уровень не установлен по имеющимся данным.", resumeVsExperienceGap: "Неописанное не означает отсутствие опыта." }, findings: [], strengths: [{ id: "S01", sourceQuote: text.slice(0,80), interpretation: "В резюме указаны конкретные профессиональные действия." }], questionsCreatedByResume: [], uncertainties: [], claimsNotAllowed: [] };
 const view = () => ({ assessment: structuredClone(assessment), selectedId: "S01", angle: "Подтверждённое действие", imageDirection: "Не добавлять факты", overlapReason: "Короткий фрагмент ограничивает выбор" });
 return { version: 1, textHash: resumeHash(text), facts: { facts: [{ statement: "Указанное действие", quote: text.slice(0,80) }], unknowns: ["Уровень"], declared: { profession: unknown, industry: unknown, level: unknown }, inferred: { profession: unknown, industry: unknown, level: unknown } }, views: { tamara: view(), lera: view(), gleb: view(), vadik: view() } };
}
