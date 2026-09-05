import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { trackServer } from "@/lib/analytics-server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const session = await auth();
    const adaptation = await prisma.resumeAdaptation.findUnique({
      where: { id },
      include: { analysis: { select: { userId: true } } },
    });
    if (!adaptation?.adaptedText || adaptation.status !== "ready") {
      return NextResponse.json({ error: "Новая версия ещё не готова." }, { status: 404 });
    }
    if ((adaptation.userId && adaptation.userId !== session?.user?.id) || (adaptation.analysis.userId && adaptation.analysis.userId !== session?.user?.id)) {
      return NextResponse.json({ error: "Нет доступа к этой версии." }, { status: 403 });
    }

    const paragraphs = adaptation.adaptedText
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line, index) => new Paragraph({
        heading: index === 0 ? HeadingLevel.TITLE : undefined,
        spacing: { after: 140 },
        children: [new TextRun({ text: line, size: index === 0 ? 30 : 22 })],
      }));
    const buffer = await Packer.toBuffer(new Document({ sections: [{ children: paragraphs }] }));
    await trackServer("docx_downloaded", { adaptationId: adaptation.id, analysisId: adaptation.analysisId, userId: session?.user?.id }).catch(() => undefined);
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="toxichr-adapted-${adaptation.id.slice(0, 8)}.docx"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Не удалось собрать DOCX." }, { status: 500 });
  }
}
