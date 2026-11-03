import { randomUUID } from "node:crypto";
import { prisma } from "./prisma";
export const LEASE_MS = 180000; // Longer than every bounded gateway request.
export async function acquireLease(id: string, now = new Date()) {
 const owner = randomUUID();
 try { await prisma.analysisLease.create({data:{id,owner,expiresAt:new Date(now.getTime()+LEASE_MS)}}); }
 catch (error) {
  if (!(error && typeof error === "object" && "code" in error && error.code === "P2002")) throw error;
  const taken = await prisma.analysisLease.updateMany({where:{id,expiresAt:{lte:now}},data:{owner,expiresAt:new Date(now.getTime()+LEASE_MS)}});
  if (!taken.count) return null;
 }
 const assertOwner = async () => {
  const renewed=await prisma.analysisLease.updateMany({where:{id,owner,expiresAt:{gt:new Date()}},data:{expiresAt:new Date(Date.now()+LEASE_MS)}});
  if (!renewed.count) throw new Error("Право на генерацию утрачено; результат не сохранён");
 };
 let lost=false;
 const timer=setInterval(()=>{void assertOwner().catch(()=>{lost=true;});},20000);
 timer.unref();
 return {owner, assertOwner:async()=>{if(lost)throw new Error("Блокировка утрачена");await assertOwner();}, release:async()=>{clearInterval(timer);await prisma.analysisLease.deleteMany({where:{id,owner}});} };
}
