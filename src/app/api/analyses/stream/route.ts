/**
 * POST /api/analyses/stream — живой анализ.
 * Отдаёт text/event-stream: события этапов и реальные находки по мере
 * работы конвейера, в конце — completed с analysisId (или error).
 */

import { auth } from "@/lib/auth";
import type { PersonaId } from "@/lib/personas";
import { readJson } from "@/lib/api";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { analysisErrorMessage } from "@/lib/user-facing-errors";
import {
  AnalysisInputError,
  PERSONA_CODES,
  createAndRunAnalysis,
  findReusableAnalysis,
  waitForAnalysis,
} from "@/lib/run-analysis";

export const dynamic = "force-dynamic";

type Body = { resumeId?: string; personaId?: PersonaId };

function sse(data: unknown): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`);
}

export async function POST(request: Request) {
  const limited = rateLimit(`analysis:${clientIp(request)}`, 20, 60_000);
  if (!limited.ok) {
    return new Response(
      JSON.stringify({
        error: `Слишком много запросов. Подожди ${limited.retryAfterSec}с.`,
      }),
      { status: 429, headers: { "Content-Type": "application/json" } },
    );
  }

  const body = await readJson<Body>(request);
  const resumeId = body?.resumeId;
  const personaId = body?.personaId;

  if (!resumeId || !personaId || !PERSONA_CODES.includes(personaId)) {
    return new Response(
      JSON.stringify({ error: "Нужны resumeId и personaId." }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const session = await auth();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (data: unknown) => {
        try {
          controller.enqueue(sse(data));
        } catch {
          // клиент отключился — молча продолжаем, результат сохранится в БД
        }
      };

      try {
        const reusable = await findReusableAnalysis(resumeId, personaId, session?.user?.id);
        if (reusable?.status === "COMPLETED") {
          send({
            type: "finding",
            stage: "extract",
            message: "Готовый разбор найден — открываем без повторного запроса к AI.",
          });
          send({ type: "completed", analysisId: reusable.id });
          return;
        }
        if (reusable?.status === "RUNNING") {
          send({
            type: "finding",
            stage: "extract",
            message: "Разбор уже идёт. Результат появится здесь автоматически.",
          });
          const status = await waitForAnalysis(reusable.id);
          if (status === "COMPLETED") {
            send({ type: "completed", analysisId: reusable.id });
            return;
          }
          throw new Error(
            status === "TIMEOUT"
              ? "Разбор занимает больше времени, чем обычно. Обнови страницу — результат не потеряется."
              : "Разбор не завершился. Попробуй ещё раз.",
          );
        }
        const { analysisId } = await createAndRunAnalysis(
          resumeId,
          personaId,
          send,
          undefined,
          session?.user?.id,
        );
        send({ type: "completed", analysisId });
      } catch (error) {
        console.error("[analyses/stream]", error);
        const message =
          error instanceof AnalysisInputError
            ? error.message
            : analysisErrorMessage(error);
        send({ type: "error", message, purchaseAnalysisId: error instanceof AnalysisInputError ? error.purchaseAnalysisId : undefined });
      } finally {
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
