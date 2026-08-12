export type ShareMode = "pro" | "loud" | "progress" | "challenge";

export type ShareFormat = "og" | "square" | "story";

export type ShareMetricKey =
  | "total"
  | "evidence"
  | "positioning"
  | "corporateWater"
  | "seniorityConsistency";

export type AnonymizationSettings = {
  showName: boolean;
  showPhoto: boolean;
  showCompanies: boolean;
  showRole: boolean;
  showLevel: boolean;
};

export const SHARE_MODES: {
  id: ShareMode;
  title: string;
  subtitle: string;
  platforms: string;
}[] = [
  {
    id: "pro",
    title: "Публично и профессионально",
    subtitle: "Самоирония + вывод. Для LinkedIn и Facebook.",
    platforms: "LinkedIn · Facebook",
  },
  {
    id: "loud",
    title: "Громко и смешно",
    subtitle: "Жёсткий удар и вызов. Для Telegram и X.",
    platforms: "Telegram · X",
  },
  {
    id: "progress",
    title: "Счёт и вывод",
    subtitle: "Выживаемость + главный удар. Для LinkedIn.",
    platforms: "LinkedIn",
  },
  {
    id: "challenge",
    title: "Вызвать друга",
    subtitle: "«Проверим твоё?» Для Telegram и личных сообщений.",
    platforms: "Telegram · DM",
  },
];

export const SHARE_FORMATS: {
  id: ShareFormat;
  label: string;
  size: string;
  ratio: string;
}[] = [
  { id: "og", label: "Open Graph", size: "1200×630", ratio: "aspect-[1200/630]" },
  { id: "square", label: "Square", size: "1080×1080", ratio: "aspect-square" },
  {
    id: "story",
    label: "Story",
    size: "1080×1920",
    ratio: "aspect-[1080/1920]",
  },
];

export const DEFAULT_ANONYMIZATION: AnonymizationSettings = {
  showName: false,
  showPhoto: false,
  showCompanies: false,
  showRole: true,
  showLevel: true,
};

export const METRIC_OPTIONS: {
  key: ShareMetricKey;
  label: string;
}[] = [
  { key: "total", label: "Выживаемость" },
  { key: "evidence", label: "Доказанность" },
  { key: "positioning", label: "Ясность" },
  { key: "corporateWater", label: "Корп. вода" },
  { key: "seniorityConsistency", label: "Уровень" },
];

export function buildShareCaption(input: {
  mode: ShareMode;
  personaName: string;
  score: number;
  quote: string;
  role?: string;
}): string {
  const roleBit = input.role ? ` (${input.role})` : "";

  switch (input.mode) {
    case "pro":
      return [
        `Я отдал резюме${roleBit} самому токсичному AI-рекрутеру.`,
        `${input.personaName} оценил(а) убедительность резюме на ${input.score}/100.`,
        `«${input.quote}»`,
        "",
        "Неприятно, но справедливо. Главный вывод: рынок видит не весь опыт, а только то, что удалось доказать.",
      ].join("\n");
    case "loud":
      return [
        `${input.personaName}: ${input.score}/100`,
        `«${input.quote}»`,
        "",
        "Проверим твоё?",
      ].join("\n");
    case "progress":
      return [
        `Разбор резюме${roleBit}: ${input.score}/100.`,
        `«${input.quote}»`,
        "",
        "Разбор честный. Дальше — правки по плану из отчёта.",
      ].join("\n");
    case "challenge":
      return [
        `${input.personaName} разнёс моё резюме на ${input.score}/100.`,
        `«${input.quote}»`,
        "",
        "Вызываю тебя. Справишься лучше?",
      ].join("\n");
  }
}
