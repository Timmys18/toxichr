import { z } from "zod";

import type { PersonaId } from "@/lib/personas";

const UserFacingBlockSchema = z.object({
  type: z.enum(["finding", "strength", "observation", "question", "summary"]),
  findingIds: z.array(z.string().min(1)).max(6),
  content: z.string().min(20).max(1600),
});

export const PersonaDraftSchema = z.object({
  verdict: z.object({
    title: z.string().min(3).max(160),
    comment: z.string().min(20).max(900),
  }),
  contentBlocks: z.array(UserFacingBlockSchema).min(2).max(10),
  priorities: z.array(z.object({
    findingIds: z.array(z.string().min(1)).min(1).max(6),
    action: z.string().min(12).max(600),
  })).min(1).max(5),
  shareLines: z.array(z.string().min(8).max(240)).min(1).max(3),
});

export type PersonaDraft = z.infer<typeof PersonaDraftSchema>;

const text = { type: "string" } as const;
export const PERSONA_DRAFT_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "contentBlocks", "priorities", "shareLines"],
  properties: {
    verdict: {
      type: "object", additionalProperties: false, required: ["title", "comment"],
      properties: { title: text, comment: text },
    },
    contentBlocks: {
      type: "array", minItems: 2, maxItems: 10,
      items: {
        type: "object", additionalProperties: false, required: ["type", "findingIds", "content"],
        properties: {
          type: { type: "string", enum: ["finding", "strength", "observation", "question", "summary"] },
          findingIds: { type: "array", maxItems: 6, items: text }, content: text,
        },
      },
    },
    priorities: {
      type: "array", minItems: 1, maxItems: 5,
      items: {
        type: "object", additionalProperties: false, required: ["findingIds", "action"],
        properties: { findingIds: { type: "array", minItems: 1, maxItems: 6, items: text }, action: text },
      },
    },
    shareLines: { type: "array", minItems: 1, maxItems: 3, items: text },
  },
};

const BANNED_USER_FACING = /(доказател\w*|приговор\w*|(?:^|[^а-яё])при[её]м(?:а|у|ом|е|ы|ов|ам|ами|ах)?(?=$|[^а-яё])|прожарк\w*)/iu;
const ABILITY_CLAIMS = /(?:кандидат|человек|вы|ты|он|она)[^.!?\n]{0,60}(?:умеет|может|способен|способна|неспособен|неспособна|не\s+знает|знает)(?![а-яё])/iu;
const ABILITY_NOUNS = /(?:способност(?:ь|и|ей|ям|ями|ях)|умени(?:е|я|й|ям|ями|ях))(?![а-яё])/iu;
const PERSON_JUDGMENT = /(?:настоящий|сильный|слабый|плохой|хороший|выдающийся)\s+(?:лидер|руководитель|специалист|профессионал|кандидат)/iu;
const DIRECT_IDENTIFIERS = /(?:\+?\d[\d\s()\-]{8,}\d|[\w.+-]+@[\w-]+\.[\w.-]+|https?:\/\/|\b(?:ооо|зао|пао|ип)\s+[«"]?[^\n]{2,}|\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b|\b\d[\d\s.,]{2,}\s*(?:₽|руб\.?|usd|eur|доллар\w*|евро)\b)/iu;
const GENERIC_HR = /(следует отметить|важно понимать|рекомендуется (?:улучшить|добавить|обратить)|кандидат демонстрирует|сильные стороны кандидата|имеются зоны роста|необходимо усилить)/giu;
const PLACEHOLDER_COPY = /(короткий вывод|свободный законченный текст|конкретное действие с текстом|авторск\w+\s+(?:заголов|ремарк)|два.?четыре законченных предложения)/iu;
const BRIGHT_MOMENT = /(?:[?!]|—|уже|пока|даже|видимо|неловко|осталось|прекрасн|раздражает|состоялось)/iu;

const PERSONA_MARKERS: Record<PersonaId, RegExp> = {
  tamara: /(статус|вес|полномочи|ответствен|управлен|масштаб|зрел|устойчив|корпоратив|директор|должност|руковод)/giu,
  lera: /(позиционир|секунд|рынок|чита|заголов|навык|одинак|ai-|канцеляр|рекрутер|профил|сигнал|отлич)/giu,
  gleb: /(логик|причин|утвержден|утверждени|формулиров|уточняющ|исходн|что изменилось|структур|содержан|масштаб|детал|существен)/giu,
  vadik: /(лично|что сделал|запуст|результат|клиент|продукт|самостоятель|встреч|ресурс|ownership|эффект|действ)/giu,
};

export type SharePrivacyContext = { sourceText?: string; blockedTerms?: string[] };
export type PersonaQualityMetrics = {
  professionalDepth: number;
  specificity: number;
  personaDistinctiveness: number;
  sarcasm: number;
  punchQuality: number;
  usefulness: number;
  grounding: "pass" | "fail";
};

function normalizedWords(value: string): Set<string> {
  return new Set(value.toLowerCase().match(/[a-zа-яё-]{6,}/giu) ?? []);
}

export function buildSharePrivacyContext(sourceText: string, explicitTerms: string[] = []): SharePrivacyContext {
  const lines = sourceText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const likelyName = lines.slice(0, 4).find((line) => /^[А-ЯЁA-Z][а-яёa-z-]+(?:\s+[А-ЯЁA-Z][а-яёa-z-]+){1,2}$/.test(line));
  const organizations = [...sourceText.matchAll(/\b(?:ООО|ЗАО|ПАО|АО|ИП)\s+[«"]?([^\n,»"]{2,60})/giu)].map((match) => match[1].trim());
  return { sourceText, blockedTerms: [...explicitTerms, ...(likelyName ? [likelyName] : []), ...organizations].filter(Boolean) };
}

export function stripSensitiveShareText(textValue: string, privacy: SharePrivacyContext = {}): string | null {
  if (DIRECT_IDENTIFIERS.test(textValue) || /\b\d{5,}\b/.test(textValue)) return null;
  const lower = textValue.toLowerCase();
  if ((privacy.blockedTerms ?? []).some((term) => term.trim().length >= 4 && lower.includes(term.trim().toLowerCase()))) return null;
  if (privacy.sourceText) {
    const sourceWords = normalizedWords(privacy.sourceText);
    const uncommonOverlap = [...normalizedWords(textValue)].filter((word) => sourceWords.has(word) && !/резюме|текст|работ|опыт|роль|результат/.test(word));
    if (uncommonOverlap.length >= 3) return null;
  }
  const compact = textValue.replace(/\s{2,}/g, " ").trim();
  return compact.length >= 8 ? compact : null;
}

export function scorePersonaQuality(draft: PersonaDraft, findingIds: Set<string>, personaId?: PersonaId): PersonaQualityMetrics {
  const prose = [draft.verdict.title, draft.verdict.comment, ...draft.contentBlocks.map((b) => b.content)].join(" ");
  const linked = draft.contentBlocks.filter((block) => block.type === "summary" || block.findingIds.some((id) => findingIds.has(id))).length;
  const markerHits = personaId ? new Set(prose.match(PERSONA_MARKERS[personaId])?.map((v) => v.toLowerCase()) ?? []).size : 1;
  const hasBrightMoment = BRIGHT_MOMENT.test(prose);
  const usefulVerbs = draft.priorities.filter((item) => /(назов|укаж|убер|перепиш|собер|покаж|уточн|сократ|остав|добав)/iu.test(item.action)).length;
  return {
    professionalDepth: prose.length >= 500 && draft.contentBlocks.length >= 3 ? 5 : prose.length >= 280 ? 4 : 3,
    specificity: linked === draft.contentBlocks.length && draft.contentBlocks.some((block) => block.findingIds.length > 1) ? 5 : linked / draft.contentBlocks.length >= 0.8 ? 4 : 2,
    personaDistinctiveness: markerHits >= 2 ? 5 : markerHits === 1 ? 4 : 2,
    sarcasm: hasBrightMoment && /[?!—]/u.test(prose) ? 5 : hasBrightMoment ? 4 : 2,
    punchQuality: hasBrightMoment && draft.verdict.title.length <= 90 ? 5 : hasBrightMoment ? 4 : 2,
    usefulness: usefulVerbs >= 2 ? 5 : usefulVerbs === 1 ? 4 : 2,
    grounding: linked === draft.contentBlocks.length ? "pass" : "fail",
  };
}

export function validatePersonaDraft(
  input: unknown,
  findingIds: Set<string>,
  options: { personaId?: PersonaId; privacy?: SharePrivacyContext; enforceVoice?: boolean } = {},
): { ok: boolean; draft?: PersonaDraft; errors: string[]; quality?: PersonaQualityMetrics } {
  const parsed = PersonaDraftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: ["неверная структура JSON"] };
  const draft = parsed.data;
  const errors: string[] = [];
  const allText = [draft.verdict.title, draft.verdict.comment, ...draft.contentBlocks.map((b) => b.content), ...draft.priorities.map((p) => p.action), ...draft.shareLines].join("\n");
  if (BANNED_USER_FACING.test(allText)) errors.push("запрещённая пользовательская лексика");
  if (ABILITY_CLAIMS.test(allText)) errors.push("оценка способности человека вместо текста резюме");
  if (ABILITY_NOUNS.test(allText)) errors.push("оценка способности человека вместо текста резюме");
  if (PERSON_JUDGMENT.test(allText)) errors.push("оценка человека вместо того, что показывает резюме");
  if ((allText.match(GENERIC_HR) ?? []).length >= 2) errors.push("слишком общий корпоративный HR-язык");
  if (PLACEHOLDER_COPY.test(allText)) errors.push("скопирована служебная подсказка вместо авторского текста");
  if ([draft.verdict.title, draft.verdict.comment].some((value) => /^\s*\.{3,}\s*$/.test(value))) errors.push("оставлена служебная заглушка вместо текста");
  for (const block of draft.contentBlocks) {
    if (block.type !== "summary" && block.findingIds.length === 0) errors.push("содержательный блок без findingId");
    if (block.findingIds.some((id) => !findingIds.has(id))) errors.push("ссылка на несуществующий findingId");
  }
  for (const priority of draft.priorities) {
    if (priority.findingIds.some((id) => !findingIds.has(id))) errors.push("приоритет со ссылкой на несуществующий findingId");
  }
  if (draft.shareLines.some((line) => !stripSensitiveShareText(line, options.privacy))) errors.push("shareLines раскрывают идентификатор или слишком коротки");
  if (!BRIGHT_MOMENT.test(allText)) errors.push("нет яркого авторского момента");
  if (draft.contentBlocks.length >= 3 && new Set(draft.contentBlocks.map((block) => block.type)).size === 1) errors.push("механически одинаковая структура блоков");
  const quality = scorePersonaQuality(draft, findingIds, options.personaId);
  if (options.enforceVoice && quality.personaDistinctiveness < 4) errors.push("голос персоны недостаточно различим");
  if (options.enforceVoice && (quality.professionalDepth < 4 || quality.specificity < 4 || quality.usefulness < 4)) errors.push("недостаточно профессиональной конкретики");
  return errors.length ? { ok: false, errors: [...new Set(errors)], quality } : { ok: true, draft, errors: [], quality };
}
