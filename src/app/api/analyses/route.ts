import { NextResponse } from "next/server";
import { jsonError, readJson } from "@/lib/api";
import { auth } from "@/lib/auth";
import type { PersonaId } from "@/lib/personas";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { analysisErrorMessage } from "@/lib/user-facing-errors";
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
    const session = await auth();
    const { analysisId } = await createAndRunAnalysis(resumeId, personaId, undefined, undefined, session?.user?.id);
    return NextResponse.json({ analysisId });
  } catch (error) {
    console.error(error);
    if (error instanceof AnalysisInputError) {
      return jsonError(error.message, error.status);
    }
    return jsonError(analysisErrorMessage(error), 503);
  }
}
