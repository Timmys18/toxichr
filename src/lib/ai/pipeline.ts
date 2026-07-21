import type { PersonaId } from "@/lib/personas";
import { PERSONAS } from "@/lib/personas";
import {
  AnalysisReportSchema,
  type AnalysisReport,
  type Problem,
} from "@/lib/ai/schemas";
import { runHeuristicAnalysis } from "@/lib/ai/heuristics";
import { AiConfigError, runAi } from "@/lib/ai/gateway";
import { groundReport, quoteInResume } from "@/lib/ai/grounding";

export type PipelineInput = {
  resumeText: string;
  personaId: PersonaId;
};

export type PipelineResult = {
  report: AnalysisReport;
  provider: string;
  model: string;
  costUsd: number;
};

const PERSONA_SYSTEM: Record<PersonaId, string> = {
  tamara: `Ты Тамара Петровна — HR-директор крупной корпорации.
Голос: строгий, канцелярски точный, без пафоса. Смотришь на масштаб, полномочия, управляемость, стабильность.
Пишешь как внутреннее заключение для руководителя направления.`,
  lera: `Ты Лера — lead recruiter в tech.
Голос: быстрый, ироничный, рыночный. Смотришь на позиционирование, отличие от 40 похожих, метрики, читаемость за 10 секунд.
Пишешь как жёсткий фидбек кандидату после скрининга.`,
  gleb: `Ты Глеб Аркадьевич — партнёр консалтинга.
Голос: холодный, вежливый, логичный. Смотришь на доказательную структуру, причинно-следственные связи, narrative.
Пишешь как разбор кейса: где логика держится, где рассыпается.`,
  vadik: `Ты Вадик — фаундер стартапа.
Голос: прямой, нервный, без воды. Смотришь на ownership, скорость, влияние на выручку/продукт, «что сделал лично ты».
Пишешь как решение: звать на созвон или нет.`,
};

type GptReportPayload = {
  verdict?: { title?: string; comment?: string };
  hrReview?: {
    firstImpression?: string;
    deepDive?: string;
    hiringTake?: string;
    fixPriority?: string;
  };
  topProblems?: Array<{
    severity?: Problem["severity"];
    title?: string;
    quote?: string;
    roast?: string;
    diagnosis?: string;
    recommendation?: string;
    suggestedRewrite?: string;
  }>;
  strengths?: Array<{
    title?: string;
    quote?: string;
    comment?: string;
  }>;
  shareQuotes?: Array<{ kind?: "precise" | "funny" | "safe"; text?: string }>;
  improvementPlan?: Array<{
    horizon?: "10m" | "30m" | "recall";
    action?: string;
  }>;
};

function clipResume(text: string, max = 7000): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}\n\n[…текст обрезан…]`;
}

function fallbackHrReview(base: AnalysisReport): AnalysisReport["hrReview"] {
  const hits = base.topProblems
    .slice(0, 3)
    .map((p) => `${p.title}: ${p.roast}`)
    .join("\n\n");
  return {
    firstImpression: base.verdict.comment,
    deepDive:
      hits ||
      "Разбор не удалось полностью сгенерировать. Ниже — найденные проблемы по тексту.",
    hiringTake: `По тексту оценка убедительности ${base.score.total}/100. Это про качество доказательств в резюме, не про человека.`,
    fixPriority:
      base.improvementPlan.map((s) => s.action).join(" ") ||
      "Перепиши 3 пункта: действие → масштаб → результат. Без выдуманных цифр.",
  };
}

export async function runAnalysisPipeline(
  input: PipelineInput,
): Promise<PipelineResult> {
  // Баллы и сырые сигналы — локально (чтобы не выдумывать метрики).
  const heuristic = runHeuristicAnalysis(input.resumeText, input.personaId);
  const groundedBase = groundReport(heuristic, input.resumeText);
  const persona = PERSONAS.find((p) => p.id === input.personaId);

  const signalPack = {
    role: groundedBase.candidateProfile.primaryRole,
    claimedLevel: groundedBase.candidateProfile.claimedLevel,
    inferredLevel: groundedBase.candidateProfile.inferredLevel,
    score: groundedBase.score,
    viralMetrics: groundedBase.viralMetrics,
    detectedSignals: {
      sampleWeakQuotes: groundedBase.topProblems.map((p) => p.quote).slice(0, 6),
      responsibilitiesCount: groundedBase.viralMetrics.responsibilitiesCount,
      achievementsCount: groundedBase.viralMetrics.achievementsCount,
    },
  };

  // Don't send pre-written roasts — GPT must write fresh for THIS resume.
  let ai;
  try {
    ai = await runAi({
      stage: "persona",
      system: `${PERSONA_SYSTEM[input.personaId]}

Задача: сделать РАЗВЁРНУТЫЙ разбор резюме как живой HR, а не набор коротких карточек.
Пиши по-русски. Бей по ТЕКСТУ резюме, не по личности (не возраст, пол, внешность, здоровье).

СТРУКТУРА JSON (строго):
{
  "verdict": { "title": "короткий жёсткий заголовок по ЭТОМУ резюме", "comment": "2-4 предложения от лица персонажа" },
  "hrReview": {
    "firstImpression": "2-3 абзаца: что видишь за 20 секунд",
    "deepDive": "4-8 абзацев: развёрнутый разбор. Ссылайся на конкретные формулировки из резюме. Разные абзацы = разные углы. Не повторяй одно и то же.",
    "hiringTake": "1-2 абзаца: позвала бы / не позвала бы на следующий этап и почему (как этот персонаж)",
    "fixPriority": "2-3 абзаца: что править в первую очередь, в каком порядке"
  },
  "topProblems": [
    {
      "severity": "critical|high|medium|low",
      "title": "свой заголовок под это резюме",
      "quote": "ТОЧНАЯ цитата из резюме (подстрока)",
      "roast": "удар голосом персонажа по этой цитате",
      "diagnosis": "почему это ломает найм",
      "recommendation": "что сделать",
      "suggestedRewrite": "каркас переписывания БЕЗ выдуманных цифр/компаний"
    }
  ],
  "strengths": [{ "title": "", "quote": "опционально точная цитата", "comment": "" }],
  "shareQuotes": [{ "kind": "precise|funny|safe", "text": "короткая цитата для шаринга голосом персонажа" }],
  "improvementPlan": [{ "horizon": "10m|30m|recall", "action": "конкретный шаг" }]
}

Правила:
- topProblems: 4–7 штук. Каждая quote ОБЯЗАНА быть дословным фрагментом из резюме.
- Не копируй шаблонные фразы вроде «Мало конкретики» / «Руководил всем» — пиши уникально под этот текст.
- Не выдумывай цифры, компании, должности, даты, метрики.
- Не используй слова: улики, суд, досье, приговор, следователь, выживаемость.
- Баллы score уже посчитаны системой — не спорь с ними в цифрах, но можешь интерпретировать смысл.
- hrReview.deepDive — главная ценность. Пиши плотно, конкретно, с отсылками к тексту.`,
      user: JSON.stringify({
        persona: {
          id: input.personaId,
          name: persona?.name,
          title: persona?.title,
          tone: persona?.tone,
          lenses: persona?.lenses,
          question: persona?.question,
        },
        lockedScores: signalPack.score,
        lockedMetrics: signalPack.viralMetrics,
        profileHint: {
          role: signalPack.role,
          claimedLevel: signalPack.claimedLevel,
          inferredLevel: signalPack.inferredLevel,
        },
        weakQuoteHints: signalPack.detectedSignals.sampleWeakQuotes,
        resumeText: clipResume(input.resumeText),
      }),
      jsonSchemaName: "hr_full_review_v2",
    });
  } catch (error) {
    if (error instanceof AiConfigError) throw error;
    console.error("[pipeline] ChatGPT failed", error);
    throw new Error(
      error instanceof Error
        ? error.message
        : "ChatGPT не ответил. Попробуй ещё раз.",
    );
  }

  let parsed: GptReportPayload;
  try {
    parsed = JSON.parse(ai.content) as GptReportPayload;
  } catch {
    throw new Error("ChatGPT вернул нечитаемый ответ. Попробуй ещё раз.");
  }

  const resume = input.resumeText;
  const rawProblems = (parsed.topProblems ?? [])
    .filter((p) => p?.title && p?.quote && p?.roast)
    .slice(0, 8)
    .map((p, i): Problem => {
      const quote = String(p.quote).trim();
      const groundedQuote = quoteInResume(quote, resume)
        ? quote
        : groundedBase.topProblems[i]?.quote || quote.slice(0, 180);
      return {
        id: `p-${i}`,
        severity: (["critical", "high", "medium", "low"] as const).includes(
          p.severity as Problem["severity"],
        )
          ? (p.severity as Problem["severity"])
          : i === 0
            ? "critical"
            : "high",
        title: String(p.title).trim().slice(0, 120),
        quote: groundedQuote,
        roast: String(p.roast).trim(),
        diagnosis: String(p.diagnosis ?? p.roast).trim(),
        recommendation: String(
          p.recommendation ?? "Перепиши пункт: действие → результат.",
        ).trim(),
        suggestedRewrite: p.suggestedRewrite?.trim() || undefined,
      };
    });

  const topProblems =
    rawProblems.length > 0 ? rawProblems : groundedBase.topProblems;

  const strengths = (parsed.strengths ?? [])
    .filter((s) => s?.title && s?.comment)
    .slice(0, 4)
    .map((s, i) => ({
      id: `s-${i}`,
      title: String(s.title).trim(),
      quote:
        s.quote && quoteInResume(s.quote, resume) ? s.quote.trim() : undefined,
      comment: String(s.comment).trim(),
    }));

  const shareQuotes = (parsed.shareQuotes ?? [])
    .filter((q) => q?.text && String(q.text).trim().length > 12)
    .slice(0, 4)
    .map((q, i) => ({
      id: `q-${i}`,
      kind: (q.kind ?? "precise") as "precise" | "funny" | "safe",
      text: String(q.text).trim(),
    }));

  const improvementPlan = (parsed.improvementPlan ?? [])
    .filter((s) => s?.action && String(s.action).trim().length >= 8)
    .slice(0, 6)
    .map((s, i) => ({
      id: `plan-${i}`,
      horizon: (s.horizon ??
        (i === 0 ? "10m" : i === 1 ? "30m" : "recall")) as
        | "10m"
        | "30m"
        | "recall",
      action: String(s.action).trim(),
    }));

  const hrReviewRaw = parsed.hrReview;
  const hrReview =
    hrReviewRaw?.firstImpression &&
    hrReviewRaw?.deepDive &&
    hrReviewRaw?.hiringTake &&
    hrReviewRaw?.fixPriority
      ? {
          firstImpression: hrReviewRaw.firstImpression.trim(),
          deepDive: hrReviewRaw.deepDive.trim(),
          hiringTake: hrReviewRaw.hiringTake.trim(),
          fixPriority: hrReviewRaw.fixPriority.trim(),
        }
      : fallbackHrReview({
          ...groundedBase,
          topProblems,
          improvementPlan:
            improvementPlan.length > 0
              ? improvementPlan
              : groundedBase.improvementPlan,
        });

  const merged: AnalysisReport = {
    ...groundedBase,
    verdict: {
      title:
        parsed.verdict?.title?.trim() ||
        groundedBase.verdict.title,
      comment:
        parsed.verdict?.comment?.trim() ||
        groundedBase.verdict.comment,
    },
    hrReview,
    topProblems,
    strengths: strengths.length > 0 ? strengths : groundedBase.strengths,
    shareQuotes:
      shareQuotes.length > 0 ? shareQuotes : groundedBase.shareQuotes,
    improvementPlan:
      improvementPlan.length > 0
        ? improvementPlan
        : groundedBase.improvementPlan,
    // locked
    score: groundedBase.score,
    candidateProfile: groundedBase.candidateProfile,
    viralMetrics: groundedBase.viralMetrics,
    theatreFindings: groundedBase.theatreFindings,
    recommendedPersonaId: groundedBase.recommendedPersonaId,
    recommendationReason: groundedBase.recommendationReason,
  };

  // Ensure hrReview always present for zod
  const withReview: AnalysisReport = {
    ...merged,
    hrReview: merged.hrReview ?? fallbackHrReview(merged),
  };

  const grounded = groundReport(withReview, input.resumeText);
  // preserve hrReview through grounding
  const finalReport = AnalysisReportSchema.parse({
    ...grounded,
    hrReview: withReview.hrReview,
  });

  return {
    report: finalReport,
    provider: ai.provider,
    model: ai.model,
    costUsd: ai.costUsd,
  };
}
