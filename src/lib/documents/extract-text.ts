import mammoth from "mammoth";

export type ExtractResult = {
  text: string;
  pageCount: number | null;
};

export async function extractTextFromBuffer(
  buffer: Buffer,
  mimeType: string,
  filename: string,
): Promise<ExtractResult> {
  if (mimeType === "text/plain" || filename.endsWith(".txt")) {
    return { text: buffer.toString("utf-8"), pageCount: null };
  }

  if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    filename.toLowerCase().endsWith(".docx")
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return {
      text: result.value.trim(),
      pageCount: estimatePages(result.value),
    };
  }

  if (mimeType === "application/pdf" || filename.toLowerCase().endsWith(".pdf")) {
    const pdfParse = (await import("pdf-parse")).default;
    const parsed = await pdfParse(buffer);
    return {
      text: parsed.text.trim(),
      pageCount: parsed.numpages ?? null,
    };
  }

  throw new Error("UNSUPPORTED_FORMAT");
}

function estimatePages(text: string): number | null {
  const chars = text.length;
  if (chars === 0) return null;
  return Math.max(1, Math.ceil(chars / 2800));
}
