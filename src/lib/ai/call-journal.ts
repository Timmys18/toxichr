import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import type { AiRequest, AiResponse } from "./gateway";
/** Receipt metadata only. Each fsynced line survives later parser/process errors. */
function append(event: Record<string, unknown>) {
 const file=path.resolve(/* turbopackIgnore: true */ process.env.AI_CALL_JOURNAL_FILE ?? path.join(process.cwd(),".data","ai-call-ledger.jsonl"));
 mkdirSync(path.dirname(file),{recursive:true});
 appendFileSync(file,JSON.stringify({...event,at:new Date().toISOString()})+"\n",{flush:true});
}
export function journalStart(id:string,request:AiRequest,provider:string){append({id,status:"STARTED",stage:request.stage,model:request.model??"default",provider,maxTokens:request.maxTokens??null});}
export function journalFinish(id:string,elapsedMs:number,response?:AiResponse){append({id,status:response?"COMPLETED":"ERROR",elapsedMs,provider:response?.provider,model:response?.model,requestId:response?.requestId,usage:response?.rawUsage??null,tokensIn:response?.usageKnown===false?null:response?.tokensIn??null,tokensOut:response?.usageKnown===false?null:response?.tokensOut??null,costEstimate:response?.usageKnown===false?null:response?.cost??null});}
