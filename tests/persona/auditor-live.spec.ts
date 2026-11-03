import type { AuditManifest, Receipt } from './auditor-types';
import { test } from '@playwright/test';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { runAnalysisPipeline } from '../../src/lib/ai/pipeline';
import type { CoordinatedPlan } from '../../src/lib/ai/coordinated-plan';
import cases from '../fixtures/voice-release-cases.json';

test('auditor bounded live acceptance', async () => {
 test.setTimeout(900000);
 test.skip(process.env.AUDITOR_LIVE !== '1','Explicit live opt in required');
 const dir='artifacts/auditor-live-2026-11-04';
 if(existsSync(dir+'/manifest.json')) throw new Error('Existing run: preserve receipts; do not reset this budget or overwrite artifacts');
 mkdirSync(dir,{recursive:true});
 const manifest:AuditManifest={sourceCommit:'c3eb9ecba3d34e39f2bb0fda07a7a299db6aab41',budgetUsd:1,reservationLimitUsd:.95,pricingSource:'https://developers.openai.com/api/docs/pricing',calls:[],results:[],reusedResults:[],reservedUsd:0,knownCostUsd:0};
 const save=()=>writeFileSync(dir+'/manifest.json',JSON.stringify(manifest,null,2));
 const original=globalThis.fetch;
 const rates:Record<string,number[]>={'gpt-6.1-sol':[2,.1,10],'gpt-5.4-mini':[.75,.075,4.5],'gpt-5-nano':[.05,.005,.4]};
 let unsafe=false;
 globalThis.fetch=async(url,init)=>{
  if(unsafe)throw new Error('Unknown previous charge: halted');
  if(String(url)!=='https://api.openai.com/v1/chat/completions')throw new Error('Unexpected endpoint blocked');
  const body=String(init?.body),p=JSON.parse(body),rate=rates[p.model],limit=p.max_completion_tokens;
  if(!rate||!Number.isInteger(limit)||limit<=0||p.service_tier==='priority')throw new Error('Unpriced request blocked');
  const bound=((Buffer.byteLength(body)+2048)*rate[0]*1.25+limit*rate[2])/1e6;
  if(manifest.reservedUsd+bound>.95||manifest.calls.length>=32)throw new Error('Budget cap: next request blocked before network');
  manifest.reservedUsd+=bound;
  const call:Receipt={id:manifest.calls.length+1,model:p.model,schema:p.response_format?.json_schema?.name,boundUsd:bound,startedAt:new Date().toISOString(),status:'STARTED'};
  manifest.calls.push(call);save();const started=Date.now();
  console.log('CALL',call.id,call.schema,'reserved total',manifest.reservedUsd.toFixed(4));
  try{
   const response=await original(url,init);const data=await response.clone().json();
   call.elapsedMs=Date.now()-started;call.httpStatus=response.status;call.requestId=response.headers.get('x-request-id');call.usage=data.usage??null;
   if(data.usage&&Number.isFinite(data.usage.prompt_tokens)&&Number.isFinite(data.usage.completion_tokens)){
    const u=data.usage,cached=u.prompt_tokens_details?.cached_tokens??0;
    call.costUsd=((u.prompt_tokens-cached)*rate[0]+cached*rate[1]+u.completion_tokens*rate[2])/1e6;
    manifest.knownCostUsd+=call.costUsd;call.status='RECEIVED';
   }else{call.status='UNKNOWN_COST';unsafe=true;}
   writeFileSync(dir+`/call-${call.id}.json`,JSON.stringify({schema:call.schema,response:data},null,2));save();return response;
  }catch(e){call.elapsedMs=Date.now()-started;call.status='UNKNOWN_COST';unsafe=true;save();throw e;}
 };
 const selected=[cases.cases.find(c=>c.id==='H10')!,{id:'N01',text:'Лаборант испытательной лаборатории строительных материалов. Принимала и маркировала образцы бетона, готовила их к испытаниям, заносила результаты в журнал. Вместе с инженером ввела двойную сверку маркировки перед испытанием. За следующие два месяца случаев перепутанных образцов в журнале не зарегистрировано; исходную частоту ошибок не измеряли. Протоколы испытаний подписывает инженер. Стаж — три года.'}];
 try{
  for(const c of selected){let plan:CoordinatedPlan|undefined;let facts:CoordinatedPlan['facts']|undefined;
   writeFileSync(dir+'/'+c.id+'-resume.txt',c.text);
   const caseStarted=Date.now();
   for(const personaId of ['tamara','lera','gleb','vadik'] as const){
    const start=Date.now(),before=manifest.knownCostUsd;
    try{
     const result=await runAnalysisPipeline({resumeText:c.text,personaId,coordinatedPlan:plan,sharedFacts:facts,onFacts:async f=>{facts=f;writeFileSync(dir+'/'+c.id+'-facts.json',JSON.stringify(f,null,2));},onPlan:async p=>{plan=p;writeFileSync(dir+'/'+c.id+'-plan.json',JSON.stringify(p,null,2));},onPlanInvalid:async()=>{plan=undefined;}});
     writeFileSync(dir+'/'+c.id+'-'+personaId+'.json',JSON.stringify(result,null,2));
     manifest.results.push({caseId:c.id,personaId,status:'COMPLETED',elapsedMs:Date.now()-start,costUsd:manifest.knownCostUsd-before,verdict:result.report.verdict});
     console.log('RESULT',c.id,personaId,'COMPLETED');
    }catch(e){manifest.results.push({caseId:c.id,personaId,status:'FAILED',elapsedMs:Date.now()-start,costUsd:manifest.knownCostUsd-before,error:e instanceof Error?e.message:String(e)});console.log('RESULT',c.id,personaId,'FAILED');save();break;}
    save();
   }
   manifest[c.id+'TotalMs']=Date.now()-caseStarted;save();if(unsafe)break;
  }
 }finally{globalThis.fetch=original;manifest.finishedAt=new Date().toISOString();save();}
});
