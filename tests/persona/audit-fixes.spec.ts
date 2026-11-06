import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { cases, planFor } from "./recovery-fixtures";
import { validatePlan } from "../../src/lib/ai/coordinated-plan";
import { assessmentClaims, reviewAssessment } from "../../src/lib/ai/assessment-review";
import { runAnalysisPipeline } from "../../src/lib/ai/pipeline";
import { acquireLease, LEASE_MS } from "../../src/lib/analysis-lease";
import { prisma } from "../../src/lib/prisma";
import { createAndRunAnalysis } from "../../src/lib/run-analysis";

const text=cases[0];
const assessment=()=>validatePlan(planFor(text),text).views.tamara.assessment;
const decisions=(rejected?:string)=>({decisions:assessmentClaims(assessment()).map(c=>({id:c.id,supported:c.id!==rejected,reason:c.id===rejected?"не подтверждено":""}))});
async function stub(outputs:unknown[],run:()=>Promise<void>) {
 const oldFetch=globalThis.fetch, oldProvider=process.env.AI_PROVIDER, oldKey=process.env.OPENAI_API_KEY;let index=0;
 process.env.AI_PROVIDER="openai";process.env.OPENAI_API_KEY="synthetic-only";
 globalThis.fetch=async(_url,init)=>{const name=JSON.parse(String(init?.body)).response_format?.json_schema?.name;if(name!=="document_purpose_v1"&&index>=outputs.length)throw new Error("Unexpected call, no network");return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(name==="document_purpose_v1"?{decision:"suitable"}:outputs[index++])},finish_reason:"stop"}],usage:{prompt_tokens:10,completion_tokens:10}}),{status:200});};
 try{await run();}finally{globalThis.fetch=oldFetch;if(oldProvider===undefined)delete process.env.AI_PROVIDER;else process.env.AI_PROVIDER=oldProvider;if(oldKey===undefined)delete process.env.OPENAI_API_KEY;else process.env.OPENAI_API_KEY=oldKey;}
}
async function resume(){return prisma.resume.create({data:{sanitizedText:text,versions:{create:{versionNumber:1,structuredContent:{coordinatedPlan:planFor(text)}}}},include:{versions:true}});}
async function clean(id:string){const ids=(await prisma.analysis.findMany({where:{resumeVersion:{resumeId:id}},select:{id:true}})).map(a=>a.id);await prisma.aiCall.deleteMany({where:{analysisId:{in:ids}}});await prisma.candidateProfile.deleteMany({where:{resumeVersion:{resumeId:id}}});await prisma.analysis.deleteMany({where:{resumeVersion:{resumeId:id}}});await prisma.resumeVersion.deleteMany({where:{resumeId:id}});await prisma.resume.delete({where:{id}});}

test("неподтверждённое итоговое поле после одной правки не выдаётся",async()=>{
 const a=assessment();a.professionalAssessment.overallImpression="Кандидат единолично удвоил выручку компании за год.";
 const rejected={decisions:assessmentClaims(a).map(c=>({id:c.id,supported:c.id!=="professionalAssessment.overallImpression",reason:"выручка не указана"}))};
 await stub([rejected,a,rejected],async()=>{
  const result=await reviewAssessment(text,a,true);
  expect(JSON.stringify(result.assessment)).not.toContain("единолично удвоил выручку");
  expect(result.assessment.professionalAssessment.overallImpression).toBe(a.strengths[0].interpretation);
 });
});
test("скрытая экономия времени и обвинение в сокрытии доказательства исправляются до выдачи",async()=>{
 const resumeText=readFileSync("artifacts/auditor-live-repair-08/H10-resume.txt","utf8");
 const saved=JSON.parse(readFileSync("artifacts/auditor-live-repair-08/H10-lera.json","utf8"));
 const before=saved.report.professionalAssessment;
 const corrected=structuredClone(before);
 corrected.findings[0].interpretation="Командный показатель не описывает личный вклад в удержание клиентов.";
 corrected.strengths[0].interpretation="Подготовленный список вопросов используется менеджерами на еженедельной встрече.";
 const allSupported=(value:typeof before)=>({decisions:assessmentClaims(value).map(c=>({id:c.id,supported:true,reason:""}))});
 await stub([allSupported(before),corrected,allSupported(corrected)],async()=>{
  const result=await reviewAssessment(resumeText,before,true);
  expect(result.assessment.findings[0].interpretation).toBe(corrected.findings[0].interpretation);
  expect(result.assessment.strengths[0].interpretation).toBe(corrected.strengths[0].interpretation);
  expect(JSON.stringify(result.assessment)).not.toMatch(/экономит время|убираешь доказательство/iu);
 });
});
test("после сохранения плана отклонение главного наблюдения сбрасывает его до автора",async()=>{
 const r=await resume();const corrected=assessment();corrected.strengths[0].interpretation="Указан конкретный рабочий результат в пределах описанного действия.";
 try{await stub([decisions("S01"),corrected,decisions()],async()=>{await expect(createAndRunAnalysis(r.id,"tamara")).rejects.toThrow("проверку разбора");});
 const v=await prisma.resumeVersion.findUniqueOrThrow({where:{id:r.versions[0].id}});expect((v.structuredContent as Record<string,unknown>).coordinatedPlan).toBeUndefined();
 const calls=await prisma.aiCall.findMany({where:{analysisId:{in:(await prisma.analysis.findMany({where:{resumeVersionId:v.id},select:{id:true}})).map(a=>a.id)}}});expect(calls.some(c=>c.stage==="persona")).toBe(false);
 }finally{await clean(r.id);}
});
test("просроченная блокировка перехватывается атомарно; старый владелец лишён прав",async()=>{
 const id=`test:${Date.now()}`;const old=await acquireLease(id);expect(old).not.toBeNull();
 try{await prisma.analysisLease.update({where:{id},data:{expiresAt:new Date(Date.now()-1)}});
 const pair=await Promise.all([acquireLease(id),acquireLease(id)]);expect(pair.filter(Boolean)).toHaveLength(1);
 await expect(old!.assertOwner()).rejects.toThrow();await old!.release();expect(await prisma.analysisLease.count({where:{id}})).toBe(1);await pair.find(Boolean)!.release();
 }finally{await old?.release();await prisma.analysisLease.deleteMany({where:{id}});}
});
test("готовый ответ открывается при действующей чужой блокировке",async()=>{
 process.env.AI_PROVIDER="mock";const r=await resume();
 try{const ready=await createAndRunAnalysis(r.id,"tamara");const lease=await acquireLease(`resume:${r.versions[0].id}`);
 try{const cached=await Promise.race([createAndRunAnalysis(r.id,"tamara"),new Promise<never>((_,reject)=>{const t=setTimeout(()=>reject(new Error("Ожидание блокировки")),1000);t.unref();})]);expect(cached.analysisId).toBe(ready.analysisId);}finally{await lease?.release();}
 }finally{await clean(r.id);}
});
test("после аварии просроченная блокировка и RUNNING не мешают новому разбору",async()=>{
 process.env.AI_PROVIDER="mock";const r=await resume();const id=`resume:${r.versions[0].id}`;
 try{await prisma.analysisLease.create({data:{id,owner:"crashed",expiresAt:new Date(Date.now()-LEASE_MS)}});
 const abandoned=await prisma.analysis.create({data:{resumeVersionId:r.versions[0].id,status:"RUNNING"}});
 const result=await createAndRunAnalysis(r.id,"tamara");expect(result.analysisId).not.toBe(abandoned.id);expect((await prisma.analysis.findUniqueOrThrow({where:{id:abandoned.id}})).status).toBe("FAILED");
 }finally{await prisma.analysisLease.deleteMany({where:{id}});await clean(r.id);}
});
test("успешный модельный вызов сохраняет расход и время при последующей ошибке",async()=>{
 const r=await resume();
 try{await stub([{}],async()=>{await expect(createAndRunAnalysis(r.id,"tamara")).rejects.toThrow();});
 const a=await prisma.analysis.findFirstOrThrow({where:{resumeVersionId:r.versions[0].id}});expect(a.status).toBe("FAILED");expect(a.costAmount).toBeGreaterThan(0);
 const calls=await prisma.aiCall.findMany({where:{analysisId:a.id}});expect(calls).toHaveLength(1);expect(calls[0].status).toBe("COMPLETED");expect(calls[0].elapsedMs).toBeGreaterThanOrEqual(0);expect(calls[0].tokensIn).toBe(10);expect(calls[0].costAmount).toBe(a.costAmount);
 const receipts=readFileSync(process.env.AI_CALL_JOURNAL_FILE ?? ".data/ai-call-ledger.jsonl","utf8").trim().split("\n").map(line=>JSON.parse(line));
 expect(receipts.some(e=>e.id===calls[0].id && e.status==="COMPLETED" && e.costEstimate.amount>0)).toBe(true);
 }finally{await clean(r.id);}
});
test("неполный проверяющий не может подтвердить только карточки, пропустив итоговые поля",async()=>{
 await stub([{decisions:[{id:"S01",supported:true,reason:""}]}],async()=>{await expect(runAnalysisPipeline({resumeText:text,personaId:"tamara",coordinatedPlan:validatePlan(planFor(text),text)})).rejects.toThrow();});
});
