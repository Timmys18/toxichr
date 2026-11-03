/** Export receipt metadata only. STARTED/ERROR/missing usage are unresolved, never zero. */
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { writeFile } from "node:fs/promises";
import path from "node:path";
const url=process.env.DATABASE_URL;
if (!url?.startsWith("file:")) throw new Error("Set the isolated SQLite DATABASE_URL");
const db=new PrismaClient({adapter:new PrismaBetterSqlite3({url:path.resolve(url.slice(5))})});
try {
 const calls=await db.aiCall.findMany({orderBy:{startedAt:"asc"}});
 const unresolved=calls.filter(c=>c.status!=="COMPLETED"||c.costAmount===null);
 const estimates={};for(const c of calls)if(c.costAmount!==null)estimates[c.currency]=(estimates[c.currency]??0)+c.costAmount;
 const report={exportedAt:new Date().toISOString(),costSource:"gateway rate estimates, reconcile usage and request IDs with provider billing",historicalLostRunsReconciled:false,estimates,unresolved:unresolved.map(c=>c.id),calls};
 await writeFile(process.argv[2]??"ai-ledger.json",JSON.stringify(report,null,2));
} finally {await db.$disconnect();}
