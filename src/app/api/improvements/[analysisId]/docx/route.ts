import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import { auth } from "@/lib/auth";
import {
  ImprovementAccessError,
  loadImprovementContext,
} from "@/lib/improvement-server";
import { trackServer } from "@/lib/analytics-server";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ analysisId: string }> },
) {
  try {
    const { analysisId } = await params;
    const session = await auth();
    const analysis = await loadImprovementContext(analysisId, session?.user?.id);
    const improvement = analysis.improvements[0];
    if (!improvement?.improvedText) {
      return Response.json({ error: "Новая версия ещё не готова." }, { status: 409 });
    }

    const paragraphs = improvement.improvedText
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map(
        (line, index) =>
          new Paragraph({
            heading: index === 0 ? HeadingLevel.TITLE : undefined,
            spacing: { after: 140 },
            children: [new TextRun({ text: line, size: index === 0 ? 30 : 22 })],
          }),
      );
    const document = new Document({ sections: [{ children: paragraphs }] });
    const buffer = await Packer.toBuffer(document);

    await trackServer("docx_downloaded", {
      analysisId,
      userId: session?.user?.id,
    }).catch(() => undefined);

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="toxichr-resume-${analysisId.slice(0, 8)}.docx"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    if (error instanceof ImprovementAccessError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    console.error(error);
    return Response.json({ error: "Не удалось собрать DOCX." }, { status: 500 });
  }
}
