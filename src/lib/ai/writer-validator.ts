import { z } from "zod";

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
  priorities: z
    .array(z.object({ findingIds: z.array(z.string().min(1)).min(1).max(6), action: z.string().min(12).max(600) }))
    .min(1)
    .max(5),
  shareLines: z.array(z.string().min(8).max(240)).min(1).max(3),
});

export type PersonaDraft = z.infer<typeof PersonaDraftSchema>;

const BANNED_USER_FACING = /(доказательств(?:о|а|у|ом|е)?|приговор(?:а|у|ом|е)?|при[её]м(?:а|у|ом|е|ы)?|прожарк\w*)/iu;
// \b в JavaScript не распознаёт границы русских слов, поэтому без него.
const ABILITY_CLAIMS = /(кандидат|вы|ты|он|она)\s+(не\s+)?(умеет|может|способен|неспособен|не знает|знает)/iu;
const DIRECT_IDENTIFIERS = /(?:\+?\d[\d\s()\-]{8,}\d|[\w.+-]+@[\w-]+\.[\w.-]+|https?:\/\/|\b(?:ооо|зао|пао|ип)\s+[«"]?[^\n]{2,}|\b\d{1,2}[./-]\d{1,2}[./-]\d{2,4}\b)/iu;

export function stripSensitiveShareText(text: string): string | null {
  if (DIRECT_IDENTIFIERS.test(text)) return null;
  const compact = text.replace(/\b\d{5,}\b/g, "").replace(/\s{2,}/g, " ").trim();
  return compact.length >= 8 ? compact : null;
}

export function validatePersonaDraft(input: unknown, findingIds: Set<string>): {
  ok: boolean;
  draft?: PersonaDraft;
  errors: string[];
} {
  const parsed = PersonaDraftSchema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: ["неверная структура JSON"] };
  const draft = parsed.data;
  const errors: string[] = [];
  const allText = [draft.verdict.title, draft.verdict.comment, ...draft.contentBlocks.map((b) => b.content), ...draft.priorities.map((p) => p.action), ...draft.shareLines].join("\n");
  if (BANNED_USER_FACING.test(allText)) errors.push("запрещённая пользовательская лексика");
  if (ABILITY_CLAIMS.test(allText)) errors.push("оценка способности человека вместо текста резюме");
  for (const block of draft.contentBlocks) {
    if (block.type !== "summary" && block.findingIds.length === 0) errors.push("содержательный блок без findingId");
    if (block.findingIds.some((id) => !findingIds.has(id))) errors.push("ссылка на несуществующий findingId");
  }
  for (const priority of draft.priorities) {
    if (priority.findingIds.some((id) => !findingIds.has(id))) errors.push("приоритет со ссылкой на несуществующий findingId");
  }
  if (draft.shareLines.some((line) => !stripSensitiveShareText(line))) errors.push("shareLines содержат идентификатор или слишком коротки");
  return errors.length ? { ok: false, errors: [...new Set(errors)] } : { ok: true, draft, errors: [] };
}
