import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { cases, planFor } from "./recovery-fixtures";
import { assessmentClaims } from "../../src/lib/ai/assessment-review";
import { runAiStream } from "../../src/lib/ai/gateway";
import { prisma } from "../../src/lib/prisma";
import { createAndRunAnalysis } from "../../src/lib/run-analysis";
import { resumeHash } from "../../src/lib/ai/coordinated-plan";
import { AnalysisReportSchema } from "../../src/lib/ai/schemas";

test("unused streaming transport is disabled before network or chunks", async () => {
 const oldFetch = globalThis.fetch; let calls = 0, chunks = 0;
 globalThis.fetch = async () => { calls++; throw new Error("Network forbidden in test"); };
 try {
  await expect(runAiStream({stage:"persona",system:"synthetic",user:"synthetic"},()=>{chunks++;})).rejects.toThrow("Потоковый транспорт отключён");
  expect(calls).toBe(0); expect(chunks).toBe(0);
 } finally { globalThis.fetch = oldFetch; }
});

test("full OpenAI route with stub transport saves facts, plan, checked author response and reopens without calls", async () => {
 const keys = ["AI_PROVIDER","OPENAI_API_KEY","AI_VOICE_POLISH"];
 const old = keys.map(k=>process.env[k]), oldFetch = globalThis.fetch;
 const text = cases[0], plan = planFor(text);
 const authored = {
  verdict: {title:"Договор дошёл до юристов",comment:"У вас работа с договором не заканчивается на слове «сопровождала»: названы продление и согласование условий с юристами. Корпоративный клиент здесь уже получил конкретное содержание работы — эту строку стоит сохранить.",findingIds:["S01"]},
  contentBlocks:[{type:"strength",findingIds:["S01"],content:"В резюме прямо названы продление договоров и согласование условий с юристами. Это конкретное описание работы с клиентом."},{type:"summary",findingIds:[],content:"Сохраните связь между действием и предметом работы: она помогает прочитать роль без догадок."}],
  priorities:[{findingIds:["S01"],action:"Сохраните описание продления договоров рядом с согласованием условий."}],
  shareLines:["Название должности читается быстрее, когда рядом есть конкретное действие."]
 };
 const steps:string[]=[];
 const r = await prisma.resume.create({data:{sanitizedText:text,versions:{create:{versionNumber:1}}},include:{versions:true}});
 const versionId=r.versions[0].id;
 process.env.AI_PROVIDER="openai";process.env.OPENAI_API_KEY="synthetic-no-network";process.env.AI_VOICE_POLISH="false";
 globalThis.fetch = async (_url,init) => {
  const payload=JSON.parse(String(init?.body));
  const step=payload.response_format?.json_schema?.name;
  steps.push(step);
  const messages=payload.messages as {role:string;content:string}[];
  const input=messages.find(m=>m.role==="user")!.content;
  const content=(await prisma.resumeVersion.findUniqueOrThrow({where:{id:versionId}})).structuredContent as Record<string,unknown>|null;
  let response:unknown;
  switch(step){
   case "resume_facts_v1": expect(content).toBeNull();response=plan.facts;break;
   case "facts_review_v1":response={supported:true,reason:""};break;
   case "coordinated_plan_v1":expect(content?.sharedFacts).toBeTruthy();expect(JSON.parse(input).resumeText).toBe(text);response=plan;break;
   case "assessment_grounding_review_v1":expect(content?.coordinatedPlan).toBeTruthy();expect(JSON.parse(input).claims.some((c:{id:string})=>c.id==="professionalAssessment.overallImpression")).toBe(true);response={decisions:assessmentClaims(plan.views.tamara.assessment).map(c=>({id:c.id,supported:true,reason:""}))};break;
   case "coordinated_view_repair_v1":expect(JSON.parse(input).shownReplies[0].comment).toBe(authored.verdict.comment);response={selectedId:"S01",angle:"Самостоятельный второй взгляд",imageDirection:"Иной образ",overlapReason:"Краткий фрагмент"};break;
   case "persona_review_v2":expect(payload.model).toBe("gpt-6.1-sol");if(steps.includes("coordinated_view_repair_v1"))expect(JSON.parse(input).shownReplies[0].comment).toBe(authored.verdict.comment);expect(JSON.parse(input).fullResume).toBe(text);expect(JSON.parse(input).selectedAnchor.item.id).toBe("S01");response=authored;break;
   case "final_grounding_review_v1":expect(JSON.parse(input).draft.verdict.comment).toBe(authored.verdict.comment);response={supported:true,reason:""};break;
   default:throw new Error(`Unexpected call blocked: ${step}`);
  }
  return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(response)},finish_reason:"stop"}],usage:{prompt_tokens:10,completion_tokens:10}}),{status:200,headers:{"x-request-id":`synthetic-${steps.length}`}});
 };
 try {
  const first=await createAndRunAnalysis(r.id,"tamara");
  expect(steps).toEqual(["resume_facts_v1","facts_review_v1","coordinated_plan_v1","assessment_grounding_review_v1","persona_review_v2","final_grounding_review_v1"]);
  const a=await prisma.analysis.findUniqueOrThrow({where:{id:first.analysisId}});
  expect(a.status).toBe("COMPLETED");expect(a.accountingIncomplete).toBe(false);
  const report=AnalysisReportSchema.parse(a.reportPayload);
  expect(report.verdict.comment).toBe(authored.verdict.comment);expect(report.sourceTextHash).toBe(resumeHash(text));expect(report.generationMeta?.voice?.status).toBe("generated");expect(report.generationMeta?.promptVersion).toContain("coordinated@2");
  const calls=await prisma.aiCall.findMany({where:{analysisId:a.id}});expect(calls).toHaveLength(6);expect(calls.every(c=>c.status==="COMPLETED"&&c.elapsedMs!==null&&c.costAmount!==null)).toBe(true);expect(a.costAmount).toBeCloseTo(calls.reduce((n,c)=>n+c.costAmount!,0),10);
  const receipts=readFileSync(process.env.AI_CALL_JOURNAL_FILE??".data/ai-call-ledger.jsonl","utf8").trim().split("\n").map(line=>JSON.parse(line));
  for(const call of calls)expect(receipts.some(e=>e.id===call.id&&e.status==="COMPLETED")).toBe(true);
  const second=await createAndRunAnalysis(r.id,"tamara");expect(second.analysisId).toBe(first.analysisId);expect(steps).toHaveLength(6);expect(await prisma.analysis.count({where:{resumeVersionId:versionId}})).toBe(1);expect(await prisma.aiCall.count({where:{analysisId:a.id}})).toBe(6);expect(await prisma.analysisLease.count({where:{id:`resume:${versionId}`}})).toBe(0);
  const other=await createAndRunAnalysis(r.id,"lera");
  expect(other.analysisId).not.toBe(first.analysisId);
  expect(steps.slice(6)).toEqual(["assessment_grounding_review_v1","coordinated_view_repair_v1","persona_review_v2","final_grounding_review_v1"]);
  expect(await prisma.analysis.count({where:{resumeVersionId:versionId}})).toBe(2);
 } finally {
  globalThis.fetch=oldFetch;keys.forEach((k,i)=>{if(old[i]===undefined)delete process.env[k];else process.env[k]=old[i];});
  const ids=(await prisma.analysis.findMany({where:{resumeVersionId:versionId},select:{id:true}})).map(a=>a.id);
  await prisma.aiCall.deleteMany({where:{analysisId:{in:ids}}});await prisma.candidateProfile.deleteMany({where:{resumeVersionId:versionId}});await prisma.analysis.deleteMany({where:{resumeVersionId:versionId}});await prisma.resumeVersion.delete({where:{id:versionId}});await prisma.resume.delete({where:{id:r.id}});
 }
});
