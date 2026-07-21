import { NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/api";
import { AiConfigError } from "@/lib/ai/gateway";
import type { PersonaId } from "@/lib/personas";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import {
  AnalysisInputError,
  PERSONA_CODES,
  createAndRunAnalysis,
} from "@/lib/run-analysis";

type Body = {
  resumeId?: string;
  personaId?: PersonaId;
};

export async function POST(request: Request) {
  const limited = rateLimit(`analysis:${clientIp(request)}`, 20, 60_000);
  if (!limited.ok) {
    return jsonError(
      `Слишком много запросов. Подожди ${limited.retryAfterSec}с.`,
      429,
    );
  }

  const body = await readJson<Body>(request);
  const resumeId = body?.resumeId;
  const personaId = body?.personaId;

  if (!resumeId || !personaId || !PERSONA_CODES.includes(personaId)) {
    return jsonError("Нужны resumeId и personaId.", 400);
  }

  try {
    const { analysisId } = await createAndRunAnalysis(resumeId, personaId);
    return NextResponse.json({ analysisId });
  } catch (error) {
    console.error(error);
    if (error instanceof AnalysisInputError) {
      return jsonError(error.message, error.status);
    }
    if (error instanceof AiConfigError) {
      return jsonError(error.message, 503);
    }
    const message =
      error instanceof Error && error.message
        ? error.message
        : "Анализ не удался. Попробуй ещё раз.";
    return jsonError(message, 500);
  }
}
