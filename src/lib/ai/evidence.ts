/**
 * Этапы 1–2 конвейера v3.
 *
 * Этап 1 (extract): LLM строит Evidence Map — карту заявлений резюме
 * с дословными цитатами и признаками доказанности. Цитаты валидируются
 * против исходного текста; невалидные отбрасываются.
 *
 * Этап 2 (score): LLM оценивает измерения качества, опираясь ТОЛЬКО на
 * evidence map + эвристические сигналы. Итоговый балл считаем сами по
 * весам из ТЗ — модель не решает арифметику.
 */

import { runAi } from "@/lib/ai/gateway";
import { quoteInResume } from "@/lib/ai/grounding";
import type { AnalysisReport } from "@/lib/ai/schemas";

export type EvidenceClaim = {
  quote: string;
  type: "achievement" | "duty" | "skill" | "selfpraise" | "other";
  hasMetric: boolean;
  hasScale: boolean;
  hasPersonalAction: boolean;
  hasOutcome: boolean;
  isGeneric: boolean;
  note?: string;
};

export type EvidenceMap = {
  profile: AnalysisReport["candidateProfile"];
  claims: EvidenceClaim[];
  contradictions: Array<{ a: string; b: string; why: string }>;
  missing: string[];
};

export type ScoreResult = {
  score: AnalysisReport["score"];
  reasons: Partial<Record<keyof AnalysisReport["score"], string>>;
};

/* -------------------------------------------------- stage 1: extract */

const EXTRACT_SYSTEM = `Ты аналитик резюме. Твоя задача — построить карту доказательств (Evidence Map) по тексту резюме. Никакого юмора, никаких оценок — только факты.

Верни строго JSON:
{
  "profile": {
    "primaryRole": "основная профессия по-русски",
    "professionalFamily": "engineering|product|project_management|sales|marketing|finance|hr|legal|operations|manufacturing|consulting|management|executive|other",
    "claimedLevel": "junior|middle|senior|lead|head|director|executive — какой уровень ЗАЯВЛЕН (заголовком, должностями)",
    "inferredLevel": "какой уровень реально ДОКАЗАН содержанием",
    "industry": "отрасль или null",
    "confidence": 0.0–1.0
  },
  "claims": [
    {
      "quote": "ДОСЛОВНАЯ цитата из резюме (подстрока исходного текста, 10–200 символов)",
      "type": "achievement|duty|skill|selfpraise|other",
      "hasMetric": есть ли цифра/процент/сумма,
      "hasScale": понятен ли масштаб (команда, бюджет, нагрузка, размер),
      "hasPersonalAction": ясно ли личное действие (не «участвовал»),
      "hasOutcome": есть ли результат, а не процесс,
      "isGeneric": можно ли вставить в любое резюме без изменений,
      "note": "короткое пояснение, чем фрагмент слаб или силён"
    }
  ],
  "contradictions": [{ "a": "цитата или заявление", "b": "что этому противоречит", "why": "суть конфликта" }],
  "missing": ["чего критически не хватает: размер команды, бюджеты, причины переходов…"]
}

Правила:
- claims: 12–25 самых значимых заявлений. Бери и сильные, и слабые.
- quote обязан быть точной подстрокой исходного текста. Не перефразируй.
- Не выдумывай факты. Если чего-то нет — это пункт для "missing".`;

function clip(text: string, max = 9000): string {
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max)}\n[…обрезано…]`;
}

export async function runExtractStage(
  resumeText: string,
): Promise<{ map: EvidenceMap | null; costUsd: number }> {
  const ai = await runAi({
    stage: "extract",
    system: EXTRACT_SYSTEM,
    user: clip(resumeText),
    jsonSchemaName: "evidence_map_v1",
    temperature: 0.15,
    maxTokens: 4000,
  });

  try {
    const raw = JSON.parse(ai.content) as Partial<EvidenceMap> & {
      profile?: Partial<EvidenceMap["profile"]>;
    };
    const claims = (raw.claims ?? [])
      .filter(
        (c): c is EvidenceClaim =>
          Boolean(c?.quote) && quoteInResume(String(c.quote), resumeText),
      )
      .slice(0, 30)
      .map((c) => ({
        quote: String(c.quote).trim(),
        type: (["achievement", "duty", "skill", "selfpraise", "other"].includes(
          String(c.type),
        )
          ? c.type
          : "other") as EvidenceClaim["type"],
        hasMetric: Boolean(c.hasMetric),
        hasScale: Boolean(c.hasScale),
        hasPersonalAction: Boolean(c.hasPersonalAction),
        hasOutcome: Boolean(c.hasOutcome),
        isGeneric: Boolean(c.isGeneric),
        note: c.note ? String(c.note).slice(0, 300) : undefined,
      }));

    if (claims.length < 4 || !raw.profile?.primaryRole) {
      return { map: null, costUsd: ai.costUsd };
    }

    const map: EvidenceMap = {
      profile: {
        primaryRole: String(raw.profile.primaryRole),
        professionalFamily: String(raw.profile.professionalFamily ?? "other"),
        claimedLevel: String(raw.profile.claimedLevel ?? "middle"),
        inferredLevel: String(raw.profile.inferredLevel ?? "middle"),
        industry: raw.profile.industry
          ? String(raw.profile.industry)
          : undefined,
        confidence: Math.max(
          0,
          Math.min(1, Number(raw.profile.confidence ?? 0.6)),
        ),
      },
      claims,
      contradictions: (raw.contradictions ?? [])
        .filter((c) => c?.a && c?.b)
        .slice(0, 6)
        .map((c) => ({
          a: String(c.a),
          b: String(c.b),
          why: String(c.why ?? ""),
        })),
      missing: (raw.missing ?? []).map(String).slice(0, 8),
    };
    return { map, costUsd: ai.costUsd };
  } catch {
    return { map: null, costUsd: ai.costUsd };
  }
}

/* -------------------------------------------------- stage 2: score */

/** Веса измерений из ТЗ (§7.1). Сумма = 100. */
const WEIGHTS: Record<
  Exclude<keyof AnalysisReport["score"], "total">,
  number
> = {
  positioning: 15,
  evidence: 20,
  personalContribution: 15,
  scale: 10,
  seniorityConsistency: 15,
  careerLogic: 10,
  structure: 10,
  language: 5,
};

const SCORE_SYSTEM = `Ты калибровщик оценки резюме. Тебе дают Evidence Map (карту заявлений с признаками доказанности) и сигналы текстового анализа. Оцени КАЖДОЕ измерение 0–100 и обоснуй одним предложением.

Калибровка:
- 80–100: редкий уровень, доказательства убедительны почти везде
- 60–79: крепко, но с заметными пробелами
- 40–59: типичное слабое резюме — заявления есть, доказательств мало
- 20–39: серьёзные проблемы в этом измерении
- 0–19: измерение фактически отсутствует

Верни строго JSON:
{
  "positioning": { "value": 0-100, "reason": "…" },
  "evidence": { "value": 0-100, "reason": "…" },
  "personalContribution": { "value": 0-100, "reason": "…" },
  "scale": { "value": 0-100, "reason": "…" },
  "seniorityConsistency": { "value": 0-100, "reason": "…" },
  "careerLogic": { "value": 0-100, "reason": "…" },
  "structure": { "value": 0-100, "reason": "…" },
  "language": { "value": 0-100, "reason": "…" }
}

Правила:
- Опирайся только на переданные данные, ничего не выдумывай.
- Не завышай из вежливости и не занижай для драмы.
- reason — конкретное обоснование со ссылкой на данные (счётчики, признаки, противоречия).`;

function clamp100(n: unknown, fallback: number): number {
  const v = Number(n);
  return Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : fallback;
}

export async function runScoreStage(
  map: EvidenceMap,
  heuristicScore: AnalysisReport["score"],
  signals: Record<string, unknown>,
): Promise<{ result: ScoreResult | null; costUsd: number }> {
  const stats = {
    claimsTotal: map.claims.length,
    achievements: map.claims.filter((c) => c.type === "achievement").length,
    duties: map.claims.filter((c) => c.type === "duty").length,
    withMetric: map.claims.filter((c) => c.hasMetric).length,
    withScale: map.claims.filter((c) => c.hasScale).length,
    withPersonalAction: map.claims.filter((c) => c.hasPersonalAction).length,
    generic: map.claims.filter((c) => c.isGeneric).length,
    contradictions: map.contradictions.length,
    missing: map.missing,
  };

  const ai = await runAi({
    stage: "score",
    system: SCORE_SYSTEM,
    user: JSON.stringify({
      profile: map.profile,
      evidenceStats: stats,
      weakestClaims: map.claims
        .filter((c) => c.isGeneric || (!c.hasMetric && !c.hasOutcome))
        .slice(0, 8)
        .map((c) => ({ quote: c.quote, note: c.note })),
      strongestClaims: map.claims
        .filter((c) => c.hasMetric && c.hasOutcome)
        .slice(0, 5)
        .map((c) => ({ quote: c.quote, note: c.note })),
      contradictions: map.contradictions,
      textSignals: signals,
    }),
    jsonSchemaName: "score_v1",
    temperature: 0.1,
    maxTokens: 1500,
  });

  try {
    const raw = JSON.parse(ai.content) as Record<
      string,
      { value?: number; reason?: string }
    >;
    const dims = Object.keys(WEIGHTS) as Array<keyof typeof WEIGHTS>;
    const score = { total: 0 } as AnalysisReport["score"];
    const reasons: ScoreResult["reasons"] = {};
    let weighted = 0;
    for (const dim of dims) {
      const v = clamp100(raw[dim]?.value, heuristicScore[dim]);
      score[dim] = v;
      weighted += (v * WEIGHTS[dim]) / 100;
      if (raw[dim]?.reason) reasons[dim] = String(raw[dim].reason).slice(0, 240);
    }
    score.total = Math.max(0, Math.min(100, Math.round(weighted)));
    return { result: { score, reasons }, costUsd: ai.costUsd };
  } catch {
    return { result: null, costUsd: ai.costUsd };
  }
}
