import { aiLiveEnabled, runAi } from "@/lib/ai/gateway";
import type { AnalysisReport } from "@/lib/ai/schemas";

export type MatchCategory = "proven" | "hidden" | "clarify" | "missing";

export type VacancyRequirement = {
  id: string;
  text: string;
  category?: MatchCategory;
  evidence?: string;
  explanation: string;
};

export type VacancyReview = {
  title: string;
  summary: string;
  requirements: VacancyRequirement[];
  redFlags: string[];
  corporateWater: string[];
  tailoredIntro?: string;
  coverLetter?: string;
  interviewQuestions: string[];
};

const STOP_WORDS = new Set([
  "который",
  "работа",
  "опыт",
  "навыки",
  "знание",
  "умение",
  "будет",
  "должен",
  "наша",
  "нашей",
  "компания",
  "команде",
  "требования",
  "обязанности",
]);

function words(text: string): string[] {
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .match(/[а-яёa-z0-9+#.-]{4,}/gi)
        ?.filter((word) => !STOP_WORDS.has(word)) ?? [],
    ),
  );
}

function requirementLines(text: string): string[] {
  const raw = text
    .split(/\n+|(?<=[.!?])\s+(?=[А-ЯA-Z])/)
    .map((line) => line.replace(/^[\s•*—–-]+/, "").trim())
    .filter((line) => line.length >= 12 && line.length <= 280)
    .filter((line) => !/^(о компании|условия|мы предлагаем|требования|обязанности)[:.]?$/i.test(line));
  return Array.from(new Set(raw)).slice(0, 14);
}

function bestEvidence(requirement: string, resumeText: string) {
  const wanted = words(requirement);
  const lines = resumeText
    .split(/\n+|(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter((line) => line.length > 8);
  let best = "";
  let hits = 0;
  for (const line of lines) {
    const lineWords = new Set(words(line));
    const count = wanted.filter((word) => lineWords.has(word)).length;
    if (count > hits) {
      hits = count;
      best = line;
    }
  }
  return { text: best, hits, ratio: wanted.length ? hits / wanted.length : 0 };
}

function heuristicReview(
  vacancyText: string,
  resumeText?: string,
): VacancyReview {
  const lines = requirementLines(vacancyText);
  const title = vacancyText.split(/\n/).find((line) => line.trim())?.trim() ?? "Вакансия";
  const redFlags = [
    [/(ненормирован|быть на связи 24|работа по выходным)/i, "Границы рабочего времени сформулированы размыто."],
    [/(стрессоустойчив|многозадачност)/i, "Возможна перегрузка, замаскированная под личное качество."],
    [/(молод[аяой] динамич|work hard|делать всё)/i, "Под культурой может скрываться отсутствие процессов."],
  ]
    .filter(([pattern]) => (pattern as RegExp).test(vacancyText))
    .map(([, message]) => message as string);
  if (!/(₽|руб|зарплат|оклад|доход|salary)/i.test(vacancyText)) {
    redFlags.push("Не указан диапазон дохода.");
  }

  const waterPhrases = [
    "динамично развивающаяся компания",
    "дружный коллектив",
    "амбициозные задачи",
    "конкурентная заработная плата",
    "возможности роста",
  ].filter((phrase) => vacancyText.toLowerCase().includes(phrase));

  const requirements = lines.map((line, index): VacancyRequirement => {
    if (!resumeText) {
      return {
        id: `req-${index}`,
        text: line,
        explanation: "Требование работодателя; соответствие появится после добавления резюме.",
      };
    }
    const evidence = bestEvidence(line, resumeText);
    const category: MatchCategory =
      evidence.ratio >= 0.5 && evidence.hits >= 2
        ? "proven"
        : evidence.ratio >= 0.28
          ? "hidden"
          : evidence.hits > 0
            ? "clarify"
            : "missing";
    const explanation = {
      proven: "В резюме есть прямое подтверждение.",
      hidden: "Похожий опыт есть, но он не подан как ответ на это требование.",
      clarify: "Есть слабый сигнал; нужен конкретный факт от кандидата.",
      missing: "В резюме подтверждения не найдено. Добавлять такой опыт нельзя.",
    }[category];
    return {
      id: `req-${index}`,
      text: line,
      category,
      evidence: category === "missing" ? undefined : evidence.text,
      explanation,
    };
  });

  const usefulEvidence = requirements
    .filter((item) => item.category === "proven" || item.category === "hidden")
    .map((item) => item.evidence)
    .filter((item): item is string => Boolean(item))
    .slice(0, 3);
  const questions = requirements
    .filter((item) => item.category === "clarify" || item.category === "missing")
    .slice(0, 8)
    .map((item) => `Как ваш реальный опыт связан с требованием: «${item.text}»?`);

  return {
    title: title.slice(0, 120),
    summary: resumeText
      ? "Требования сопоставлены только с тем, что удалось найти в резюме. Отсутствующий опыт не добавлялся."
      : "Вакансия разобрана на реальные требования, словесный шум и возможные красные флаги.",
    requirements,
    redFlags,
    corporateWater: waterPhrases,
    tailoredIntro: resumeText
      ? usefulEvidence.length
        ? `Кандидат на позицию «${title.slice(0, 80)}». Релевантный опыт: ${usefulEvidence.join("; ")}.`
        : `Кандидат на позицию «${title.slice(0, 80)}». Релевантные доказательства требуют уточнения.`
      : undefined,
    coverLetter: resumeText
      ? `Здравствуйте! Рассматриваю позицию «${title.slice(0, 80)}». ${
          usefulEvidence.length
            ? `В моём опыте есть: ${usefulEvidence.join("; ")}.`
            : "Готов подробно обсудить релевантный опыт, не отражённый в текущей версии резюме."
        } Буду рад обсудить задачи роли на встрече.`
      : undefined,
    interviewQuestions: questions,
  };
}

async function aiReview(input: {
  vacancyText: string;
  resumeText?: string;
  report?: AnalysisReport;
}): Promise<VacancyReview | null> {
  if (!aiLiveEnabled()) return null;
  const response = await runAi({
    stage: "vacancy",
    system: `Разбери вакансию без маркетинговой воды. Если дано резюме, сопоставь каждое существенное требование строго по четырём категориям:
proven — прямо доказано; hidden — опыт есть, но спрятан; clarify — нужен дополнительный факт; missing — подтверждения нет.
Evidence может быть только дословной строкой из резюме. Не добавляй кандидату опыт, цифры или технологии.
Верни JSON с полями title, summary, requirements[{id,text,category,evidence,explanation}], redFlags[], corporateWater[], tailoredIntro, coverLetter, interviewQuestions[].`,
    user: JSON.stringify(input),
    jsonSchemaName: "vacancy_review",
    temperature: 0.2,
    maxTokens: 2600,
  });
  const start = response.content.indexOf("{");
  const end = response.content.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  return JSON.parse(response.content.slice(start, end + 1)) as VacancyReview;
}

export async function reviewVacancy(input: {
  vacancyText: string;
  resumeText?: string;
  report?: AnalysisReport;
}) {
  const fallback = heuristicReview(input.vacancyText, input.resumeText);
  const ai = await aiReview(input).catch(() => null);
  if (!ai?.requirements?.length) return fallback;

  const allowedCategories = new Set<MatchCategory>([
    "proven",
    "hidden",
    "clarify",
    "missing",
  ]);
  return {
    ...fallback,
    ...ai,
    requirements: ai.requirements.slice(0, 16).map((item, index) => ({
      ...item,
      id: item.id || `req-${index}`,
      category:
        item.category && allowedCategories.has(item.category)
          ? item.category
          : input.resumeText
            ? "clarify"
            : undefined,
      evidence:
        item.evidence && input.resumeText?.includes(item.evidence)
          ? item.evidence
          : undefined,
    })),
  } satisfies VacancyReview;
}
