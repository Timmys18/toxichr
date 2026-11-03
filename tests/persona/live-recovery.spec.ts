import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { buildPlan } from '../../src/lib/ai/coordinated-plan';
import { planFor } from './recovery-fixtures';
import { assessmentClaims, reviewAssessment } from '../../src/lib/ai/assessment-review';

const root='artifacts/auditor-live-2026-11-04/';
const recorded=(n:number)=>JSON.parse(JSON.parse(readFileSync(root+`call-${n}.json`,'utf8')).response.choices[0].message.content);
async function transport(outputs:unknown[],run:(requests:Record<string,unknown>[])=>Promise<void>){
 const oldFetch=globalThis.fetch,oldProvider=process.env.AI_PROVIDER,oldKey=process.env.OPENAI_API_KEY;
 const requests:Record<string,unknown>[]=[];
 process.env.AI_PROVIDER='openai';process.env.OPENAI_API_KEY='local-no-network';
 globalThis.fetch=async(_url,init)=>{
  const p=JSON.parse(String(init?.body));requests.push(p);
  if(requests.length>outputs.length)throw new Error('Unexpected call blocked');
  return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify(outputs[requests.length-1])}}],usage:{prompt_tokens:10,completion_tokens:10}}));
 };
 try{await run(requests);}finally{globalThis.fetch=oldFetch;for(const [k,v] of [['AI_PROVIDER',oldProvider],['OPENAI_API_KEY',oldKey]]){if(v===undefined)delete process.env[k!];else process.env[k!]=v;}}
}

test('live lab citation mismatch is repaired once before semantic review and save',async()=>{
 const text=readFileSync(root+'N01-resume.txt','utf8'),fixed=planFor(text);let saved=0;
 await transport([recorded(6),fixed.facts,{supported:true,reason:''},fixed],async requests=>{
  const result=await buildPlan(text,undefined,async()=>{saved++;});
  expect(result.plan.facts).toEqual(fixed.facts);expect(saved).toBe(1);
  expect(requests.map(p=>(p.response_format as {json_schema:{name:string}}).json_schema.name)).toEqual(['resume_facts_v1','facts_repair_v1','facts_review_v1','coordinated_plan_v1']);
  expect(JSON.stringify(requests[1])).toContain('Неверная опора классификации');
 });
});
test('live nonexisting selected IDs enter one full-plan repair with unchanged foundation',async()=>{
 const text=readFileSync(root+'H10-resume.txt','utf8'),broken=recorded(5),fixed=planFor(text);
 fixed.facts=broken.facts;
 await transport([broken,fixed],async requests=>{
  const result=await buildPlan(text,broken.facts);
  expect(result.plan.views.tamara.selectedId).toBe('S01');expect(requests).toHaveLength(2);
  expect(JSON.stringify(requests[1])).toContain('selectedId');expect(result.calls).toHaveLength(2);
 });
});
test('second invalid repair stops without saving facts or silently replacing observations',async()=>{
 const text=readFileSync(root+'N01-resume.txt','utf8');let saved=false;
 await transport([recorded(6),recorded(6)],async requests=>{
  await expect(buildPlan(text,undefined,async()=>{saved=true;})).rejects.toThrow('повторную проверку');
  expect(requests).toHaveLength(2);expect(saved).toBe(false);
 });
});
test('second invalid plan stops without an arbitrary selected observation',async()=>{
 const text=readFileSync(root+'H10-resume.txt','utf8'),broken=recorded(5);
 await transport([broken,broken],async requests=>{
  await expect(buildPlan(text,broken.facts)).rejects.toThrow();expect(requests).toHaveLength(2);
 });
});
test('summary repair cannot rewrite supported observations or shared classification',async()=>{
 const text=readFileSync(root+'H10-resume.txt','utf8'),a=planFor(text).views.tamara.assessment;
 const proposed=structuredClone(a);proposed.professionalAssessment.overallImpression='Исправленная оценка описывает только указанные в резюме действия.';
 proposed.candidateContext.primaryProfession='Выдуманная другая профессия';
 proposed.strengths[0].interpretation='Это посторонняя переписанная моделью мысль.';
 const decisions={decisions:assessmentClaims(a).map(c=>({id:c.id,supported:c.id!=='professionalAssessment.overallImpression',reason:''}))};
 const approved={decisions:assessmentClaims(a).map(c=>({id:c.id,supported:true,reason:''}))};
 await transport([decisions,proposed,approved],async()=>{
  const result=await reviewAssessment(text,a,true);
  expect(result.assessment.strengths).toEqual(a.strengths);
  expect(result.assessment.candidateContext).toEqual(a.candidateContext);
  expect(result.assessment.professionalAssessment.overallImpression).toBe(proposed.professionalAssessment.overallImpression);
 });
});
