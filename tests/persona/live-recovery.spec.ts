import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { buildPlan, reconcileView, validatePlan } from '../../src/lib/ai/coordinated-plan';
import { planFor } from './recovery-fixtures';
import { assessmentClaims, reviewAssessment } from '../../src/lib/ai/assessment-review';
import { validatePersonaDraft } from '../../src/lib/ai/writer-validator';

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
test('planner returns perspectives only; application attaches the checked foundation',async()=>{
 const text=readFileSync(root+'N01-resume.txt','utf8'),fixed=planFor(text);
 const {facts,...perspectives}=fixed;
 await transport([perspectives],async requests=>{
  const result=await buildPlan(text,facts);
  expect(result.plan.facts).toEqual(facts);
  const schema=(requests[0].response_format as {json_schema:{schema:{properties:Record<string,unknown>}}}).json_schema.schema;
  expect(schema.properties).not.toHaveProperty('facts');
 });
});
test('review schema requires as many decisions as claims with only the supplied IDs',async()=>{
 const text=readFileSync(root+'H10-resume.txt','utf8'),a=planFor(text).views.gleb.assessment;
 const claims=assessmentClaims(a);
 await transport([{decisions:claims.map(c=>({id:c.id,supported:true,reason:''}))}],async requests=>{
  await reviewAssessment(text,a);
  const schema=(requests[0].response_format as {json_schema:{schema:{properties:{decisions:{minItems:number;maxItems:number;items:{properties:{id:{enum:string[]}}}}}}}}).json_schema.schema;
  expect(schema.properties.decisions.minItems).toBe(claims.length);
  expect(schema.properties.decisions.maxItems).toBe(claims.length);
  expect(schema.properties.decisions.items.properties.id.enum).toEqual(claims.map(c=>c.id));
 });
});
test('recoordination uses only checked observations and preserves other HR directions',async()=>{
 const text=readFileSync(root+'H10-resume.txt','utf8'),plan=validatePlan(planFor(text),text);
 const checked=structuredClone(plan.views.vadik.assessment);checked.strengths[0].interpretation='Подтверждённое конкретное действие описано в тексте резюме.';
 const selection={selectedId:'S01',angle:'Исправленный самостоятельный взгляд',imageDirection:'Без новых фактов',overlapReason:'Краткое резюме'};
 await transport([selection],async requests=>{
  const result=await reconcileView(plan,'vadik',checked,text);
  expect(result.plan.views.vadik.assessment.strengths).toEqual(checked.strengths);
  for(const id of ['tamara','lera','gleb'] as const)expect(result.plan.views[id]).toEqual(plan.views[id]);
  expect(result.plan.facts).toEqual(plan.facts);expect(requests).toHaveLength(1);
 });
 await transport([{...selection,selectedId:'S99'}],async requests=>{
  await expect(reconcileView(plan,'vadik',checked,text)).rejects.toThrow();expect(requests).toHaveLength(1);
 });
});
test('negative metric advice and the word вычислять do not trigger a demand for numbers',()=>{
 const raw=JSON.parse(JSON.parse(readFileSync('artifacts/auditor-live-repair-06/call-8.json','utf8')).response.choices[0].message.content);
 const ids=new Set(['F21','S21','S22']);
 expect(validatePersonaDraft(raw,ids,{metricIssueGrounded:false}).errors).not.toContain('требование чисел не основано на выявленной проблеме резюме');
 for(const comment of ['Не нужно добавлять цифры ради цифр: описанный результат уже имеет применение.','Тебе не нужно вычислять свою долю результата, чтобы описать собственные действия.','Результат понятен и без цифр: в тексте указано применение рабочего списка.']){
  const draft=structuredClone(raw);draft.verdict.comment=comment;
  expect(validatePersonaDraft(draft,ids,{metricIssueGrounded:false}).errors).not.toContain('требование чисел не основано на выявленной проблеме резюме');
 }
 const demanded=structuredClone(raw);demanded.verdict.comment='Добавь цифры и метрики: без них твоя работа ничего не значит.';
 expect(validatePersonaDraft(demanded,ids,{metricIssueGrounded:false}).errors).toContain('требование чисел не основано на выявленной проблеме резюме');
});
