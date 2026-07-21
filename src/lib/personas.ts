export type PersonaId = "tamara" | "lera" | "gleb" | "vadik";

export type Persona = {
  id: PersonaId;
  name: string;
  title: string;
  question: string;
  quote: string;
  /** Короткий фирменный тон для UI */
  tone: string;
  lenses: [string, string, string];
  /** Tailwind accent tokens for persona chrome */
  accent: {
    chip: string;
    bar: string;
    glow: string;
  };
};

export const PERSONAS: Persona[] = [
  {
    id: "tamara",
    name: "Тамара Петровна",
    title: "HR-директор корпорации",
    question: "Серьёзный управленец или должностная инструкция?",
    quote:
      "Руководили подразделением. Размер не указан. Возможно, вы и комнатное растение.",
    tone: "Строго. По регламенту. Без пафоса.",
    lenses: ["стабильность", "масштаб", "полномочия"],
    accent: {
      chip: "bg-ink text-paper",
      bar: "bg-ink",
      glow: "rgba(10,10,10,0.12)",
    },
  },
  {
    id: "lera",
    name: "Лера",
    title: "Lead recruiter · tech",
    question: "Почему остановиться на тебе, а не на следующих 40?",
    quote:
      "Data-driven и customer-centric. Осталось добавить хоть что-то уникальное.",
    tone: "Быстро. Иронично. Режет шаблон.",
    lenses: ["позиционирование", "метрики", "читаемость"],
    accent: {
      chip: "bg-signal text-paper",
      bar: "bg-signal",
      glow: "rgba(37,99,235,0.16)",
    },
  },
  {
    id: "gleb",
    name: "Глеб Аркадьевич",
    title: "Партнёр консалтинга",
    question: "Опыт убедителен — или просто сложно оформлен?",
    quote:
      "Вы повысили эффективность. Не уточнять, чью и насколько, было стратегическим решением?",
    tone: "Холодно. Через логику. Без эмоций.",
    lenses: ["логика", "доказательства", "narrative"],
    accent: {
      chip: "bg-graphite text-toxic",
      bar: "bg-toxic",
      glow: "rgba(200,241,53,0.2)",
    },
  },
  {
    id: "vadik",
    name: "Вадик",
    title: "Фаундер стартапа",
    question: "Принесёшь пользу или ещё один созвон?",
    quote:
      "Хотите влиять на стратегию. Сначала попробуйте повлиять на выручку.",
    tone: "Прямо. Нервно. Только ownership.",
    lenses: ["ownership", "скорость", "выручка"],
    accent: {
      chip: "bg-roast text-paper",
      bar: "bg-roast",
      glow: "rgba(225,29,56,0.16)",
    },
  },
];

/** Человекочитаемые метрики для UI */
export const SCORE_LABEL = {
  total: {
    short: "Убедительность",
    hint: "Насколько текст продаёт опыт. Не оценка тебя как человека.",
  },
  evidence: {
    short: "Доказательства",
    hint: "Есть ли результаты и факты, а не только обязанности.",
  },
  positioning: {
    short: "Ясность роли",
    hint: "Понятно ли за 10 секунд, кто ты и чем полезен.",
  },
  water: {
    short: "Вода",
    hint: "Клише, «эффективность» и пустые слова без фактов.",
  },
  level: {
    short: "Уровень",
    hint: "Тянет ли текст на заявленный грейд.",
  },
} as const;
