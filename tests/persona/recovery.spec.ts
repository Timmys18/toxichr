import { test, expect } from "@playwright/test";
import { resumeHash, validatePlan } from "../../src/lib/ai/coordinated-plan";
import { AnalysisReportSchema } from "../../src/lib/ai/schemas";
import { runAnalysisPipeline } from "../../src/lib/ai/pipeline";
import { applyAssessmentReview } from "../../src/lib/ai/assessment-review";

const cases = [
  "Аккаунт-менеджер. Продлевала договоры и согласовывала условия с юристами. Команда сохранила 85% клиентов; личный вклад не измерялся. Подготовила список открытых вопросов; менеджеры используют его на еженедельной встрече.",
  "Планировщик ремонтов. Составляла недельный график ремонта насосов. После изменения срока поставки деталей перенесла две задачи, очередность остальных сохранилась. Журнал замечаний мастера использовали на планёрках. Простой отдельно не рассчитывала.",
  "Бухгалтер. Самостоятельно закрывала участок расчётов с поставщиками. Сверила акты и устранила расхождения между реестром и первичными документами. Налоговую отчётность готовил главный бухгалтер.",
];
function planFor(text: string) {
 const unknown = { value: "не установлен", quotes: [] as string[], reason: "Недостаточно оснований" };
 const context = { primaryProfession: "не установлен", industry: "не установлен", claimedLevel: "не установлен", inferredLevel: "не установлен", secondaryContext: "", careerPattern: "", confidence: .5 };
 const assessment = { candidateContext: context, professionalAssessment: { overallImpression: "Текст содержит конкретные действия и ограничения результата.", strongestProfessionalSignal: "Указано конкретное действие.", mainResumeProblem: "Существенный недостаток не установлен.", seniorityConsistency: "Уровень не установлен по имеющимся данным.", resumeVsExperienceGap: "Неописанное не означает отсутствие опыта." }, findings: [], strengths: [{ id: "S01", sourceQuote: text.slice(0,80), interpretation: "В резюме указаны конкретные профессиональные действия." }], questionsCreatedByResume: [], uncertainties: [], claimsNotAllowed: [] };
 const view = () => ({ assessment: structuredClone(assessment), selectedId: "S01", angle: "Подтверждённое действие", imageDirection: "Не добавлять факты", overlapReason: "Короткий фрагмент ограничивает выбор" });
 return { version: 1, textHash: resumeHash(text), facts: { facts: [{ statement: "Указанное действие", quote: text.slice(0,80) }], unknowns: ["Уровень"], declared: { profession: unknown, industry: unknown, level: unknown }, inferred: { profession: unknown, industry: unknown, level: unknown } }, views: { tamara: view(), lera: view(), gleb: view(), vadik: view() } };
}
for (const [index,text] of cases.entries()) test(`основание ${index}: цитаты, неизвестный уровень, новая версия`, () => {
 const raw = planFor(text);
 const p = validatePlan(raw, text);
 expect(p.views.tamara.assessment.candidateContext.inferredLevel).toBe("не установлен");
 expect(() => validatePlan(raw, text+" Новый опыт.")).toThrow();
 const bad = structuredClone(raw); bad.facts.facts[0].quote = "несуществующая цитата";
 expect(() => validatePlan(bad,text)).toThrow();
 const missing = structuredClone(raw); missing.views.lera.selectedId = "S99";
 expect(() => validatePlan(missing,text)).toThrow();
});
test("обоснованную оценку уровня не запрещаем; заявленный уровень не выдумываем", () => {
 const text=cases[2], raw=planFor(text);
 raw.facts.inferred.level={ value:"самостоятельный специалист", quotes:[text.slice(0,80)], reason:"Прямо описана самостоятельность участка, это ограниченная оценка ответственности" };
 expect(validatePlan(raw,text).views.gleb.assessment.candidateContext.inferredLevel).toBe("самостоятельный специалист");
 raw.facts.declared.level=raw.facts.inferred.level;
 expect(() => validatePlan(raw,text)).toThrow();
});
test("ошибка или неполный ответ проверяющего не считается поддержкой", () => {
 const a=validatePlan(planFor(cases[0]),cases[0]).views.tamara.assessment;
 expect(() => applyAssessmentReview(a,{})).toThrow();
 expect(() => applyAssessmentReview(a,{decisions:[]})).toThrow();
 expect(() => applyAssessmentReview(a,{decisions:[{id:"S01",supported:false,reason:"не подтверждено"}]})).toThrow();
});
test("старые отчёты читаемы без новых полей", async () => {
 process.env.AI_PROVIDER="mock";
 const old = await runAnalysisPipeline({resumeText:cases[0],personaId:"tamara"});
 expect(AnalysisReportSchema.safeParse(old.report).success).toBe(true);
});
test("одновременные открытия возвращают один сохранённый разбор, новая версия — новый", async () => {
 test.setTimeout(30000);
 process.env.AI_PROVIDER="mock";
 const {prisma}=await import("../../src/lib/prisma");
 const {createAndRunAnalysis}=await import("../../src/lib/run-analysis");
 const r=await prisma.resume.create({data:{sanitizedText:cases[0],versions:{create:{versionNumber:1}}}});
 try {
  const pair=await Promise.all([createAndRunAnalysis(r.id,"tamara"),createAndRunAnalysis(r.id,"tamara")]);
  expect(pair[0].analysisId).toBe(pair[1].analysisId);
  expect(await prisma.analysis.count({where:{resumeVersion:{resumeId:r.id}}})).toBe(1);
  expect((await createAndRunAnalysis(r.id,"tamara")).analysisId).toBe(pair[0].analysisId);
  await prisma.resumeVersion.create({data:{resumeId:r.id,versionNumber:2,structuredContent:{text:cases[1]}}});
  expect((await createAndRunAnalysis(r.id,"tamara")).analysisId).not.toBe(pair[0].analysisId);
  expect(await prisma.analysisLease.count()).toBe(0);
 } finally {
  await prisma.candidateProfile.deleteMany({where:{resumeVersion:{resumeId:r.id}}});
  await prisma.analysis.deleteMany({where:{resumeVersion:{resumeId:r.id}}});
  await prisma.resumeVersion.deleteMany({where:{resumeId:r.id}});
  await prisma.resume.delete({where:{id:r.id}});
 }
});

async function withTransport(outputs: unknown[], run: (requests: Record<string,unknown>[]) => Promise<void>) {
 const oldFetch=globalThis.fetch, oldProvider=process.env.AI_PROVIDER, oldKey=process.env.OPENAI_API_KEY;
 const requests: Record<string,unknown>[]=[];
 process.env.AI_PROVIDER="openai"; process.env.OPENAI_API_KEY="local-test-no-network";
 globalThis.fetch=async (_url,init) => {
  requests.push(JSON.parse(String(init?.body)));
  if (requests.length>outputs.length) throw new Error("Unexpected request blocked locally");
  return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(outputs[requests.length-1])},finish_reason:"stop"}],usage:{prompt_tokens:10,completion_tokens:10}}),{status:200});
 };
 try {await run(requests);} finally {globalThis.fetch=oldFetch; if(oldProvider===undefined) delete process.env.AI_PROVIDER; else process.env.AI_PROVIDER=oldProvider; if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey;}
}
test("общие факты сохраняются до плана; повторное планирование использует сохранённые факты",async()=>{
 const {buildPlan}=await import("../../src/lib/ai/coordinated-plan");
 const raw=planFor(cases[0]); const saves:string[]=[];
 await withTransport([raw.facts,{supported:true,reason:""},raw],async requests=>{
  const result=await buildPlan(cases[0],undefined,async()=>{saves.push("facts");});
  expect(result.plan.textHash).toBe(raw.textHash);expect(requests).toHaveLength(3);expect(saves).toEqual(["facts"]);
 });
 await withTransport([raw],async requests=>{await buildPlan(cases[0],raw.facts);expect(requests).toHaveLength(1);});
});
test("неподтверждённое основание: одна попытка исправления, повторная проверка и отказ",async()=>{
 const {buildPlan}=await import("../../src/lib/ai/coordinated-plan");const raw=planFor(cases[0]);let saved=false;
 await withTransport([raw.facts,{supported:false,reason:"ошибка"},raw.facts,{supported:false,reason:"ошибка осталась"}],async requests=>{
  await expect(buildPlan(cases[0],undefined,async()=>{saved=true;})).rejects.toThrow("повторную проверку");expect(requests).toHaveLength(4);expect(saved).toBe(false);
 });
});
test("невалидный авторский ответ не заменяется успешной заготовкой",async()=>{
 const raw=planFor(cases[0]);
 await withTransport([{decisions:[{id:"S01",supported:true,reason:""}]},{},{}],async()=>{
  await expect(runAnalysisPipeline({resumeText:cases[0],personaId:"tamara",coordinatedPlan:validatePlan(raw,cases[0])})).rejects.toThrow("обязательные проверки");
 });
});
test("исправление аналитика выполняется один раз и повторно проверяется",async()=>{
 const {reviewAssessment}=await import("../../src/lib/ai/assessment-review");const raw=validatePlan(planFor(cases[0]),cases[0]).views.tamara.assessment;
 await withTransport([{decisions:[{id:"S01",supported:false,reason:"неверный смысл"}]},raw,{decisions:[{id:"S01",supported:true,reason:""}]}],async requests=>{
  const result=await reviewAssessment(cases[0],raw,true);expect(result.assessment.strengths).toHaveLength(1);expect(requests).toHaveLength(3);
 });
});
