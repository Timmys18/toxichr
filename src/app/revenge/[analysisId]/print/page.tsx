import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { loadImprovementContext } from "@/lib/improvement-server";
import { hasRevengeAccess } from "@/lib/payments";
import { PrintButton } from "./print-button";

export default async function ImprovementPrintPage({
  params,
}: {
  params: Promise<{ analysisId: string }>;
}) {
  const { analysisId } = await params;
  if (!(await hasRevengeAccess(analysisId))) notFound();

  const session = await auth();
  const analysis = await loadImprovementContext(
    analysisId,
    session?.user?.id,
  ).catch(() => null);
  const text = analysis?.improvements[0]?.improvedText;
  if (!text) notFound();

  return (
    <main className="paper">
      <div className="toolbar"><PrintButton /></div>
      <article>{text}</article>
      <style>{`
        body { background: #e8e8e8 !important; color: #111 !important; }
        .paper { width: min(210mm,100%); margin: 24px auto; padding: 18mm; background: white; min-height: 297mm; box-shadow: 0 10px 40px #0002; }
        .paper article { white-space: pre-wrap; font-family: Arial,sans-serif; font-size: 11pt; line-height: 1.48; }
        .toolbar { margin-bottom: 20px; }
        .toolbar button { border: 0; border-radius: 10px; padding: 12px 18px; background: #111; color: white; cursor: pointer; }
        @media print { body { background: white !important; } .paper { margin: 0; padding: 12mm; box-shadow: none; } .toolbar { display: none; } }
      `}</style>
    </main>
  );
}
