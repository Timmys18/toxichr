/**
 * Конвейер v3: extract (evidence map) → score → persona → grounding.
 *
 * Эвристики больше не источник истины — только сигналы и fallback.
 * Каждый этап шлёт события наружу (onEvent) — из них строится живой
 * Analysis Theatre без фальшивых сообщений.
 */

import type { PersonaId } from "@/lib/personas";
import { PERSONAS } from "@/lib/personas";
import {
  AnalysisReportSchema,
  type AnalysisReport,
  type Problem,
  type TheatreFinding,
} from "@/lib/ai/schemas";
import { runHeuristicAnalysis } from "@/lib/ai/heuristics";
import { AiConfigError, runAi, runAiStream } from "@/lib/ai/gateway";
import { groundReport, quoteInResume } from "@/lib/ai/grounding";
import { voicePromptBlock } from "@/lib/ai/persona-voice";
import { guessCandidateFirstName } from "@/lib/documents/candidate-name";
import {
  runExtractStage,
  scoreFromEvidence,
  type EvidenceMap,
} from "@/lib/ai/evidence";

export type PipelineStage = "extract" | "score" | "persona";

export type PipelineEvent =
  | { type: "stage"; stage: PipelineStage; status: "start" | "done" }
  | { type: "finding"; stage: PipelineStage; message: string }
  | { type: "roast"; delta: string };

export type PipelineInput = {
  resumeText: string;
  personaId: PersonaId;
  onEvent?: (event: PipelineEvent) => void;
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
  // deepDive теперь приходит стримом (Часть 1), в JSON только эти три:
  firstImpression?: string;
  hiringTake?: string;
  fixPriority?: string;
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
  strengths?: Array<{ title?: string; quote?: string; comment?: string }>;
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

/** Реальные находки театра из evidence map — не из регэкспов. */
function theatreFromEvidence(map: EvidenceMap): TheatreFinding[] {
  const findings: TheatreFinding[] = [];
  const achievements = map.claims.filter(
    (c) => c.type === "achievement" && (c.hasMetric || c.hasOutcome),
  ).length;
  const duties = map.claims.filter((c) => c.type === "duty").length;
  const generic = map.claims.filter((c) => c.isGeneric).length;

  findings.push({
    id: "ev-counts",
    stage: "classify",
    message: `Найдено ${duties} обязанностей и ${achievements} доказанных результатов. ${
      achievements < duties ? "Обязанности ведут всухую." : "Неожиданно достойно."
    }`,
  });

  if (generic > 0) {
    findings.push({
      id: "ev-generic",
      stage: "water",
      message: `${generic} формулировок можно вставить в любое резюме без изменений. Уникальность отказалась давать показания.`,
    });
  }

  const worst = map.claims.find(
    (c) => c.isGeneric && !c.hasMetric && !c.hasPersonalAction,
  );
  if (worst) {
    findings.push({
      id: "ev-worst",
      stage: "evidence",
      message: `«${worst.quote.slice(0, 90)}» — ${worst.note ?? "ни личной роли, ни цифр, ни результата"}.`,
    });
  }

  if (map.contradictions[0]) {
    findings.push({
      id: "ev-contra",
      stage: "evidence",
      message: `Противоречие: ${map.contradictions[0].why}`,
    });
  }

  if (map.missing[0]) {
    findings.push({
      id: "ev-missing",
      stage: "seniority",
      message: `В деле не хватает: ${map.missing.slice(0, 3).join(", ")}.`,
    });
  }

  if (map.profile.claimedLevel !== map.profile.inferredLevel) {
    findings.push({
      id: "ev-level",
      stage: "seniority",
      message: `Заявлен уровень «${map.profile.claimedLevel}», доказан — «${map.profile.inferredLevel}». Разрыв зафиксирован.`,
    });
  }

  return findings;
}

export async function runAnalysisPipeline(
  input: PipelineInput,
): Promise<PipelineResult> {
  const emit = input.onEvent ?? (() => {});
  let totalCost = 0;

  // Сигналы и полный fallback — локально, мгновенно.
  const heuristic = runHeuristicAnalysis(input.resumeText, input.personaId);
  const heuristicBase = groundReport(heuristic, input.resumeText);
  const persona = PERSONAS.find((p) => p.id === input.personaId);
  const candidateFirstName = guessCandidateFirstName(input.resumeText);

  /* ---------- Этап 1: Evidence Map ---------- */
  emit({ type: "stage", stage: "extract", status: "start" });
  let evidenceMap: EvidenceMap | null = null;
  try {
    const extract = await runExtractStage(input.resumeText);
    evidenceMap = extract.map;
    totalCost += extract.costUsd;
  } catch (error) {
    if (error instanceof AiConfigError) throw error;
    // AI недоступен (таймаут/сеть) — нет смысла тянуть время на persona, падаем сразу.
    if (
      error instanceof Error &&
      /не ответил|связаться с AI/.test(error.message)
    ) {
      throw error;
    }
    console.error("[pipeline] extract stage failed, using heuristics", error);
  }
  emit({ type: "stage", stage: "extract", status: "done" });

  const theatreFindings = evidenceMap
    ? theatreFromEvidence(evidenceMap)
    : heuristicBase.theatreFindings;
  for (const f of theatreFindings) {
    emit({ type: "finding", stage: "extract", message: f.message });
  }

  /* ---------- Этап 2: Скоринг (локально, без вызова AI) ---------- */
  emit({ type: "stage", stage: "score", status: "start" });
  const finalScore = evidenceMap
    ? scoreFromEvidence(evidenceMap, heuristicBase.score)
    : heuristicBase.score;
  emit({ type: "stage", stage: "score", status: "done" });

  const finalProfile = evidenceMap?.profile ?? heuristicBase.candidateProfile;
  emit({
    type: "finding",
    stage: "score",
    message: `Убедительность текста: ${finalScore.total}/100. Дело передаётся: ${persona?.name ?? "HR"}.`,
  });

  // Метрики: счётчики из evidence map (факты), остальное — эвристики.
  const viralMetrics = evidenceMap
    ? {
        ...heuristicBase.viralMetrics,
        responsibilitiesCount: evidenceMap.claims.filter(
          (c) => c.type === "duty",
        ).length,
        achievementsCount: evidenceMap.claims.filter(
          (c) => c.type === "achievement" && (c.hasMetric || c.hasOutcome),
        ).length,
        unprovenClaimsCount: evidenceMap.claims.filter(
          (c) =>
            (c.type === "selfpraise" || c.isGeneric) &&
            !c.hasMetric &&
            !c.hasOutcome,
        ).length,
      }
    : heuristicBase.viralMetrics;

  /* ---------- Этап 3: Персона ---------- */
  emit({ type: "stage", stage: "persona", status: "start" });

  const DELIM = "===DATA===";
  let roastText = "";
  let dataText = "";
  let past = false;
  let carry = "";
  let ai;
  try {
    ai = await runAiStream(
      {
      stage: "persona",
      system: `${PERSONA_SYSTEM[input.personaId]}

${voicePromptBlock(input.personaId, candidateFirstName)}

Задача: сделать РАЗВЁРНУТЫЙ разбор резюме как живой HR, а не набор коротких карточек.
Пиши по-русски. Бей по ТЕКСТУ резюме, не по личности (не возраст, пол, внешность, здоровье).

Тебе передана карта доказательств (evidenceMap): заявления резюме с признаками доказанности, противоречия и пробелы. Это результат аналитического этапа — строй разбор НА НЕЙ, а не на общих впечатлениях. Самые слабые места = claims с isGeneric/без метрик; самые важные пробелы = missing.

ФОРМАТ ОТВЕТА — СТРОГО ДВЕ ЧАСТИ.

ЧАСТЬ 1 — РАЗБОР (обычный текст, НЕ JSON): 4-6 плотных абзацев живой речью персонажа. Это главная ценность. Ссылайся на конкретные формулировки из резюме. Разные абзацы — разные углы, без повторов, без воды и вводных, сразу по делу.

Затем на ОТДЕЛЬНОЙ строке ровно маркер:
===DATA===

ЧАСТЬ 2 — JSON (строго, без текста-разбора):
{
  "verdict": { "title": "короткий жёсткий заголовок по ЭТОМУ резюме", "comment": "2-4 предложения от лица персонажа" },
  "firstImpression": "2-3 абзаца: что видишь за 20 секунд",
  "hiringTake": "1-2 абзаца: позвала бы / не позвала бы на следующий этап и почему",
  "fixPriority": "2-3 абзаца: что править в первую очередь, в каком порядке",
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
- topProblems: 4–7 штук. Каждая quote ОБЯЗАНА быть дословным фрагментом из резюме — бери из evidenceMap.claims.
- Не копируй шаблонные фразы — пиши уникально под этот текст.
- Не выдумывай цифры, компании, должности, даты, метрики.
- Не используй слова: улики, суд, досье, приговор, следователь, выживаемость.
- Баллы score уже посчитаны с обоснованиями (scoreReasons) — не спорь с цифрами, но используй обоснования в тексте.
- Разбор (Часть 1) — главная ценность. Пиши плотно, конкретно, с отсылками к тексту. После маркера ===DATA=== — только валидный JSON.`,
      user: JSON.stringify({
        persona: {
          id: input.personaId,
          name: persona?.name,
          title: persona?.title,
          tone: persona?.tone,
          lenses: persona?.lenses,
          question: persona?.question,
        },
        lockedScores: finalScore,
        scoreReasons: {},
        lockedMetrics: viralMetrics,
        profile: finalProfile,
        evidenceMap: evidenceMap
          ? {
              claims: evidenceMap.claims,
              contradictions: evidenceMap.contradictions,
              missing: evidenceMap.missing,
            }
          : { note: "evidence map недоступна — работай по тексту" },
        resumeText: clipResume(input.resumeText),
      }),
      temperature: 0.9,
      maxTokens: 2600,
      },
      (delta) => {
        if (past) {
          dataText += delta;
          return;
        }
        carry += delta;
        const idx = carry.indexOf(DELIM);
        if (idx >= 0) {
          const before = carry.slice(0, idx);
          if (before) {
            roastText += before;
            emit({ type: "roast", delta: before });
          }
          dataText += carry.slice(idx + DELIM.length);
          past = true;
          carry = "";
          return;
        }
        // придержим хвост длиной с маркер — вдруг он разорван между кусками
        if (carry.length > DELIM.length) {
          const flush = carry.slice(0, carry.length - DELIM.length);
          roastText += flush;
          emit({ type: "roast", delta: flush });
          carry = carry.slice(carry.length - DELIM.length);
        }
      },
    );
    if (!past && carry) {
      roastText += carry;
      emit({ type: "roast", delta: carry });
    }
    totalCost += ai.costUsd;
  } catch (error) {
    if (error instanceof AiConfigError) throw error;
    console.error("[pipeline] persona stage failed", error);
    throw new Error(
      error instanceof Error ? error.message : "AI не ответил. Попробуй ещё раз.",
    );
  }
  emit({ type: "stage", stage: "persona", status: "done" });

  let parsed: GptReportPayload = {};
  const jStart = dataText.indexOf("{");
  const jEnd = dataText.lastIndexOf("}");
  if (jStart >= 0 && jEnd > jStart) {
    try {
      parsed = JSON.parse(dataText.slice(jStart, jEnd + 1)) as GptReportPayload;
    } catch {
      /* JSON битый — уедем на эвристику/фолбэк ниже */
    }
  }

  const resume = input.resumeText;
  const rawProblems = (parsed.topProblems ?? [])
    .filter((p) => p?.title && p?.quote && p?.roast)
    .slice(0, 8)
    .map((p, i): Problem => {
      const quote = String(p.quote).trim();
      const groundedQuote = quoteInResume(quote, resume)
        ? quote
        : heuristicBase.topProblems[i]?.quote || quote.slice(0, 180);
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
    rawProblems.length > 0 ? rawProblems : heuristicBase.topProblems;

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
      horizon: (s.horizon ?? (i === 0 ? "10m" : i === 1 ? "30m" : "recall")) as
        | "10m"
        | "30m"
        | "recall",
      action: String(s.action).trim(),
    }));

  // deepDive пришёл стримом (Часть 1); остальное — из JSON (или из вложенного hrReview для совместимости)
  const deepDive = (roastText || parsed.hrReview?.deepDive || "").trim();
  const firstImpression = (
    parsed.firstImpression ||
    parsed.hrReview?.firstImpression ||
    ""
  ).trim();
  const hiringTake = (
    parsed.hiringTake ||
    parsed.hrReview?.hiringTake ||
    ""
  ).trim();
  const fixPriority = (
    parsed.fixPriority ||
    parsed.hrReview?.fixPriority ||
    ""
  ).trim();
  const hrReview =
    deepDive.length > 40 && firstImpression && hiringTake && fixPriority
      ? { firstImpression, deepDive, hiringTake, fixPriority }
      : null;

  const merged: AnalysisReport = {
    ...heuristicBase,
    candidateProfile: finalProfile,
    score: finalScore,
    viralMetrics,
    theatreFindings,
    verdict: {
      title: parsed.verdict?.title?.trim() || heuristicBase.verdict.title,
      comment:
        parsed.verdict?.comment?.trim() || heuristicBase.verdict.comment,
    },
    hrReview: hrReview ?? fallbackHrReview(heuristicBase),
    topProblems,
    strengths: strengths.length > 0 ? strengths : heuristicBase.strengths,
    shareQuotes:
      shareQuotes.length > 0 ? shareQuotes : heuristicBase.shareQuotes,
    improvementPlan:
      improvementPlan.length > 0
        ? improvementPlan
        : heuristicBase.improvementPlan,
    recommendedPersonaId: heuristicBase.recommendedPersonaId,
    recommendationReason: heuristicBase.recommendationReason,
  };

  const grounded = groundReport(merged, input.resumeText);
  const finalReport = AnalysisReportSchema.parse({
    ...grounded,
    hrReview: merged.hrReview,
  });

  return {
    report: finalReport,
    provider: ai.provider,
    model: ai.model,
    costUsd: totalCost,
  };
}
