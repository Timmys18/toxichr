import type { PersonaId } from "@/lib/personas";
import type {
  AnalysisReport,
  ImprovementStep,
  Problem,
  TheatreFinding,
} from "@/lib/ai/schemas";

const CLICHES = [
  "ответственный",
  "коммуникабельный",
  "стрессоустойчивый",
  "целеустремлённый",
  "целеустремленный",
  "командный игрок",
  "быстро обучаюсь",
  "result-oriented",
  "data-driven",
  "customer-centric",
  "открыт новым возможностям",
  "проактивный",
  "многозадачность",
  "ориентирован на результат",
];

const PARTICIPATION_MARKERS = [
  "участвовал",
  "участвовала",
  "принимал участие",
  "принимала участие",
  "оказывал содействие",
  "содействовал",
  "содействовала",
];

const MANAGEMENT_MARKERS = [
  "руководил",
  "руководила",
  "управлял",
  "управляла",
  "возглавлял",
  "возглавляла",
  "лидировал",
  "лидировала",
];

const AI_MARKERS = [
  "в динамично развивающейся компании",
  "высокий уровень ответственности",
  "эффективное взаимодействие",
  "оптимизация бизнес-процессов",
  "кросс-функциональное взаимодействие",
  "стратегическое развитие",
  "повышение эффективности",
  "успешная реализация",
];

type LineKind = "achievement" | "duty" | "neutral";

type ParsedLine = {
  text: string;
  kind: LineKind;
  hasMetric: boolean;
  hasManagement: boolean;
  hasParticipation: boolean;
};

export type HeuristicFacts = {
  lines: ParsedLine[];
  responsibilitiesCount: number;
  achievementsCount: number;
  clicheHits: string[];
  participialLines: string[];
  managementWithoutScale: string[];
  effectiveCount: number;
  contradictions: Array<{ a: string; b: string; quote: string }>;
  inferredRole: string;
  professionalFamily: string;
  claimedLevel: string;
  inferredLevel: string;
};

function splitLines(text: string): string[] {
  return text
    .split(/\n+/)
    .map((l) => l.replace(/^[\s•\-–—*]+/, "").trim())
    .filter((l) => l.length > 12);
}

function isBioNoise(line: string): boolean {
  const lower = line.toLowerCase();
  return (
    /\b(муж|жен|male|female|родил|born|возраст|лет\b|года\b)\b/i.test(lower) ||
    /\b\d{1,2}[./]\d{1,2}[./]\d{2,4}\b/.test(line) ||
    /телефон|email|@|whatsapp|telegram/i.test(lower) ||
    /^[а-яёa-z\s-]{2,40},\s*\d{1,2}\s*(лет|года)/i.test(lower)
  );
}

function classifyLine(line: string): ParsedLine {
  if (isBioNoise(line)) {
    return {
      text: line,
      kind: "neutral",
      hasMetric: false,
      hasManagement: false,
      hasParticipation: false,
    };
  }
  const lower = line.toLowerCase();
  const hasMetric = /\d/.test(line) && !isBioNoise(line);
  const hasManagement = MANAGEMENT_MARKERS.some((m) => lower.includes(m));
  const hasParticipation = PARTICIPATION_MARKERS.some((m) => lower.includes(m));
  const dutyMarkers =
    lower.includes("обязанност") ||
    lower.includes("осуществлял") ||
    lower.includes("обеспечивал") ||
    hasParticipation;

  let kind: LineKind = "neutral";
  if (hasMetric && !hasParticipation) kind = "achievement";
  else if (dutyMarkers && !hasMetric) kind = "duty";

  return {
    text: line,
    kind,
    hasMetric,
    hasManagement,
    hasParticipation,
  };
}

function detectRole(text: string): { role: string; family: string } {
  const lower = text.toLowerCase();
  const rules: Array<{ match: RegExp; role: string; family: string }> = [
    { match: /product manager|продакт|product owner/i, role: "Product Manager", family: "product" },
    { match: /project manager|руководитель проект|пм\b/i, role: "Руководитель проектов", family: "project_management" },
    { match: /backend|frontend|разработчик|developer|engineer/i, role: "Разработчик", family: "engineering" },
    { match: /sales|продаж|account manager/i, role: "Менеджер по продажам", family: "sales" },
    { match: /marketing|маркетолог/i, role: "Маркетолог", family: "marketing" },
    { match: /hr|рекрутер|персонал/i, role: "HR", family: "hr" },
    { match: /директор|ceo|cfo|cto|топ-менеджер/i, role: "Руководитель", family: "executive" },
  ];

  for (const rule of rules) {
    if (rule.match.test(lower)) {
      return { role: rule.role, family: rule.family };
    }
  }
  return { role: "Специалист", family: "general" };
}

function detectLevels(text: string): { claimed: string; inferred: string } {
  const lower = text.toLowerCase();
  let claimed = "middle";
  if (/junior|младший|стажёр|стажер/i.test(lower)) claimed = "junior";
  if (/senior|старший|ведущий/i.test(lower)) claimed = "senior";
  if (/lead|тимлид|руководитель|head|director|директор/i.test(lower)) claimed = "lead";

  return { claimed, inferred: claimed };
}

function teamSizeMentioned(line: string): boolean {
  const lower = line.toLowerCase();
  return (
    /\d+\s*(человек|сотрудник|чел|people|members)/i.test(lower) ||
    /команд[аы]\s+(из\s+)?\d+/i.test(lower)
  );
}

export function extractFacts(text: string): HeuristicFacts {
  const lines = splitLines(text).map(classifyLine);
  const responsibilitiesCount = lines.filter((l) => l.kind === "duty").length;
  const achievementsCount = lines.filter((l) => l.kind === "achievement").length;
  const lower = text.toLowerCase();

  const clicheHits = CLICHES.filter((c) => lower.includes(c));
  const participialLines = lines
    .filter((l) => l.hasParticipation)
    .map((l) => l.text);
  const managementWithoutScale = lines
    .filter((l) => l.hasManagement && !teamSizeMentioned(l.text))
    .map((l) => l.text);

  const effectiveCount = (lower.match(/эффективн/g) ?? []).length;

  const contradictions: HeuristicFacts["contradictions"] = [];
  if (lower.includes("кратко") && text.length > 4500) {
    contradictions.push({
      a: "умею кратко излагать",
      b: `${Math.ceil(text.length / 1800)}+ страниц текста`,
      quote: lines[0]?.text ?? text.slice(0, 120),
    });
  }
  if (lower.includes("неопределённост") && lower.includes("регламент")) {
    contradictions.push({
      a: "работа в неопределённости",
      b: "опыт только по регламенту",
      quote:
        lines.find((l) => /регламент|процедур/i.test(l.text))?.text ??
        "Работа в условиях неопределённости при соблюдении регламентов.",
    });
  }

  const { role, family } = detectRole(text);
  const { claimed, inferred } = detectLevels(text);

  let inferredLevel = inferred;
  if (achievementsCount < 2 && responsibilitiesCount > 6) inferredLevel = "middle";
  if (achievementsCount >= 4 && claimed === "senior") inferredLevel = "senior";

  return {
    lines,
    responsibilitiesCount,
    achievementsCount,
    clicheHits,
    participialLines,
    managementWithoutScale,
    effectiveCount,
    contradictions,
    inferredRole: role,
    professionalFamily: family,
    claimedLevel: claimed,
    inferredLevel,
  };
}

function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(n)));
}

function clipQuote(quote: string, max = 90) {
  const t = quote.trim().replace(/\s+/g, " ");
  return t.length <= max ? t : `${t.slice(0, max - 1)}…`;
}

/** Structural rewrite templates — never invent metrics/companies. */
function suggestRewrite(title: string, quote: string, role: string): string {
  const q = clipQuote(quote, 70);
  switch (title) {
    case "Участие без роли":
      return `В роли ${role}: вместо «участвовал(а)» — конкретный глагол действия по «${q}». Добавь зону ответственности и итог; цифру — только если она у тебя есть.`;
    case "Руководство без масштаба":
      return `Руководил(а) [N человек / направления]: «${q}». Укажи состав команды или бюджет зоны и управленческий итог — без выдуманных цифр.`;
    case "Обязанности вместо достижений":
      return `Действие → контекст → результат: перепиши «${q}» так, чтобы было ясно, что изменилось после твоей работы. Метрику вставь только из реальных данных.`;
    case "Корпоративные клише":
      return `Убери клише («${q}»). Вместо прилагательных — один короткий кейс: задача, твоя роль, итог.`;
    case "Инфляция «эффективности»":
      return `Оставь «эффективн…» максимум один раз и только рядом с фактом. Остальное замени формулировкой «сделал X → получил Y».`;
    case "Внутреннее противоречие":
      return `Оставь одну из конфликтующих линий и подкрепи её фактом, либо явно разведи контексты. Цитата: «${q}».`;
    case "Мало конкретики":
      return `Добавь 2–3 пункта в формате: роль → что сделал → для кого/в каком масштабе → чем закончилось. Без выдуманных цифр.`;
    default:
      return `Перепиши «${q}» в формате: действие → роль → результат. Цифры и названия — только из реального опыта.`;
  }
}

function buildScore(facts: HeuristicFacts, text: string) {
  const evidence = clamp(
    20 + facts.achievementsCount * 12 - facts.participialLines.length * 8,
  );
  const positioning = clamp(55 + (facts.clicheHits.length > 3 ? -20 : 10));
  const personalContribution = clamp(
    40 + facts.achievementsCount * 10 - facts.participialLines.length * 9,
  );
  const scale = clamp(70 - facts.managementWithoutScale.length * 14);
  const seniorityConsistency = clamp(
    75 -
      (facts.claimedLevel === "senior" && facts.achievementsCount < 3 ? 25 : 0) -
      (facts.claimedLevel === "lead" && facts.managementWithoutScale.length > 1
        ? 20
        : 0),
  );
  const careerLogic = clamp(68);
  const structure = clamp(80 - (text.length > 6000 ? 15 : 0));
  const language = clamp(
    72 - facts.clicheHits.length * 6 - facts.effectiveCount * 2,
  );

  const total = clamp(
    positioning * 0.15 +
      evidence * 0.2 +
      personalContribution * 0.15 +
      scale * 0.1 +
      seniorityConsistency * 0.15 +
      careerLogic * 0.1 +
      structure * 0.1 +
      language * 0.05,
  );

  return {
    total,
    positioning,
    evidence,
    personalContribution,
    scale,
    seniorityConsistency,
    careerLogic,
    structure,
    language,
  };
}

function buildProblems(facts: HeuristicFacts): Problem[] {
  const problems: Problem[] = [];
  let idx = 0;
  const role = facts.inferredRole;

  const add = (
    severity: Problem["severity"],
    title: string,
    quote: string,
    roast: string,
    diagnosis: string,
    recommendation: string,
  ) => {
    problems.push({
      id: `p-${idx++}`,
      severity,
      title,
      quote,
      roast,
      diagnosis,
      recommendation,
      suggestedRewrite: suggestRewrite(title, quote, role),
    });
  };

  if (facts.participialLines[0]) {
    const quote = facts.participialLines[0];
    add(
      "critical",
      "Участие без роли",
      quote,
      "В качестве кого: руководителя, исполнителя или очевидца?",
      "Неясны личная роль, масштаб и измеримый результат.",
      "Укажи, что именно сделал ты, с кем работал и какой был эффект.",
    );
  }

  if (facts.managementWithoutScale[0]) {
    const quote = facts.managementWithoutScale[0];
    add(
      "high",
      "Руководство без масштаба",
      quote,
      "Руководили. Размер команды не указан. Возможно, вы и комнатное растение.",
      "Заявлено управление, но не видно ни команды, ни полномочий, ни результата.",
      "Добавь размер команды, зону ответственности и управленческий итог.",
    );
  }

  if (facts.responsibilitiesCount > facts.achievementsCount * 2) {
    const quote =
      facts.lines.find((l) => l.kind === "duty")?.text ??
      "Список обязанностей без измеримых результатов.";
    add(
      "high",
      "Обязанности вместо достижений",
      quote,
      `Найдено ${facts.responsibilitiesCount} обязанностей и ${facts.achievementsCount} результатов. Обязанности пока ведут всухую.`,
      "Резюме читается как должностная инструкция, а не как доказательство ценности.",
      "Перепиши 3–5 пунктов в формате: действие → масштаб → результат → метрика.",
    );
  }

  if (facts.clicheHits.length >= 2) {
    add(
      "medium",
      "Корпоративные клише",
      facts.clicheHits.slice(0, 3).join(", "),
      "Шаблонные формулировки не отличают вас от сотен похожих резюме.",
      "Клише занимают место фактов и снижают доверие рекрутера.",
      "Замени общие прилагательные на конкретные кейсы и цифры.",
    );
  }

  if (facts.effectiveCount >= 4) {
    add(
      "medium",
      "Инфляция «эффективности»",
      `эффективн… ×${facts.effectiveCount}`,
      `Слово «эффективный» встречается ${facts.effectiveCount} раз. Эффективность отказалась давать показания.`,
      "Повтор эффективности без метрик выглядит как попытка звучать серьёзно без доказательств.",
      "Оставь слово один раз — там, где есть цифра или сравнение до/после.",
    );
  }

  for (const c of facts.contradictions) {
    add(
      "high",
      "Внутреннее противоречие",
      c.quote,
      `${c.a} и ${c.b} в одном документе — смело.`,
      "Противоречие снижает доверие к остальным заявлениям.",
      "Убери конфликтующие формулировки или подкрепи их фактами.",
    );
  }

  if (problems.length === 0) {
    const quote =
      facts.lines[0]?.text ?? "Резюме слишком краткое для глубокого разбора.";
    add(
      "medium",
      "Мало конкретики",
      quote,
      "Текста мало — сигналов для найма тоже мало.",
      "Недостаточно конкретики, чтобы оценить масштаб и вклад.",
      "Добавь 2–3 роли с результатами, цифрами и контекстом.",
    );
  }

  return problems.slice(0, 6);
}

function buildImprovementPlan(
  facts: HeuristicFacts,
  problems: Problem[],
): ImprovementStep[] {
  const byTitle = (title: string) => problems.find((p) => p.title === title);
  const steps: ImprovementStep[] = [];
  let i = 0;

  const push = (
    horizon: ImprovementStep["horizon"],
    action: string,
    problemIds?: string[],
  ) => {
    steps.push({
      id: `plan-${i++}`,
      horizon,
      action,
      problemIds: problemIds?.length ? problemIds : undefined,
    });
  };

  const cliche = byTitle("Корпоративные клише");
  if (cliche || facts.clicheHits.length > 0) {
    push(
      "10m",
      facts.clicheHits.length > 0
        ? `Вырежи клише: ${facts.clicheHits.slice(0, 3).join(", ")}. Оставь место под факты.`
        : "Вырежи шаблонные прилагательные из summary и первых абзацев.",
      cliche ? [cliche.id] : undefined,
    );
  } else if (facts.effectiveCount >= 2) {
    const eff = byTitle("Инфляция «эффективности»");
    push(
      "10m",
      `Найди повторы «эффективн…» (${facts.effectiveCount}) и оставь максимум одно рядом с фактом.`,
      eff ? [eff.id] : undefined,
    );
  } else {
    push(
      "10m",
      "Сократи summary до 3–4 строк и убери повторы формулировок.",
    );
  }

  const duty = byTitle("Обязанности вместо достижений");
  const part = byTitle("Участие без роли");
  const mgmt = byTitle("Руководство без масштаба");

  if (part) {
    push(
      "30m",
      "В каждом пункте с «участвовал» укажи свою роль и итог; без роли — вырежи.",
      [part.id],
    );
  } else if (mgmt) {
    push(
      "30m",
      "К каждому управленческому пункту добавь размер команды или зону ответственности.",
      [mgmt.id],
    );
  } else if (duty) {
    push(
      "30m",
      `Перепиши 3 пункта обязанностей (сейчас ${facts.responsibilitiesCount} обяз. / ${facts.achievementsCount} рез.) в формат действие → результат.`,
      [duty.id],
    );
  } else {
    push(
      "30m",
      "Усиль 3 главных пункта: роль, масштаб, чем закончилось.",
    );
  }

  const recallBits: string[] = [];
  if (mgmt || facts.managementWithoutScale.length > 0) {
    recallBits.push("размер команды / зона");
  }
  if (facts.achievementsCount < 3) {
    recallBits.push("2–3 измеримых результата");
  }
  if (byTitle("Внутреннее противоречие")) {
    recallBits.push("контекст спорных формулировок");
  }
  if (recallBits.length === 0) {
    recallBits.push("цифры, бюджеты, личные решения — только из памяти, без выдумки");
  }

  push(
    "recall",
    `Вспомни и допиши: ${recallBits.join("; ")}.`,
    problems.slice(0, 2).map((p) => p.id),
  );

  return steps.slice(0, 6);
}

function buildTheatreFindings(facts: HeuristicFacts): TheatreFinding[] {
  const findings: TheatreFinding[] = [
    {
      id: "t1",
      stage: "extract",
      message: `Извлекаем показания: ${facts.lines.length} значимых фрагментов.`,
    },
    {
      id: "t2",
      stage: "classify",
      message: `Отделяем достижения от инструкции: ${facts.responsibilitiesCount} обязанностей, ${facts.achievementsCount} результатов.`,
    },
    {
      id: "t3",
      stage: "seniority",
      message: `Заявлено ${facts.claimedLevel}, по доказательствам ближе к ${facts.inferredLevel}.`,
    },
  ];

  if (facts.managementWithoutScale.length > 0) {
    findings.push({
      id: "t4",
      stage: "evidence",
      message: "Заявлено руководство. Размер команды скрывается от следствия.",
    });
  }

  if (facts.effectiveCount > 0) {
    findings.push({
      id: "t5",
      stage: "water",
      message: `Слово «эффективный» использовано ${facts.effectiveCount} раз.`,
    });
  }

  if (facts.clicheHits.length > 0) {
    findings.push({
      id: "t6",
      stage: "language",
      message: `Обнаружено ${facts.clicheHits.length} корпоративных клише.`,
    });
  }

  findings.push({
    id: "t7",
    stage: "handoff",
    message: "Передаём дело выбранному HR.",
  });

  return findings;
}

export function recommendPersona(facts: HeuristicFacts): {
  id: PersonaId;
  reason: string;
} {
  if (facts.managementWithoutScale.length > 0 && facts.claimedLevel !== "junior") {
    return {
      id: "tamara",
      reason: "Много управления, мало масштаба и полномочий.",
    };
  }
  if (facts.clicheHits.length >= 3 || facts.professionalFamily === "engineering") {
    return {
      id: "lera",
      reason: "Позиционирование размыто, много шаблонного языка.",
    };
  }
  if (facts.contradictions.length > 0 || facts.claimedLevel === "lead") {
    return {
      id: "gleb",
      reason: "Есть логические разрывы и широкие формулировки.",
    };
  }
  if (
    facts.participialLines.length > 1 ||
    facts.professionalFamily === "product"
  ) {
    return {
      id: "vadik",
      reason: "Много координации, мало личного ownership и цифр.",
    };
  }
  return {
    id: "lera",
    reason: "Резюме похоже на сотни других — нужен жёсткий recruiter take.",
  };
}

const PERSONA_ROAST: Record<
  PersonaId,
  (p: Problem) => { roast: string; comment: string }
> = {
  tamara: (p) => {
    const byTitle: Record<string, string> = {
      "Руководство без масштаба":
        "У нас за такие формулировки сначала согласовывают должность, потом человека.",
      "Участие без роли":
        "«Участвовал» — это не должность. Кто ставил задачу и кто отвечал за итог?",
      "Обязанности вместо достижений":
        "Должностная инструкция — не аргумент на грейд. Где результат вашей зоны?",
      "Корпоративные клише":
        "Клише мы читаем как отсутствие доказательств. Факты — пожалуйста, прилагательные — нет.",
      "Инфляция «эффективности»":
        "Эффективность без цифры в корпорации называется «мнение».",
      "Внутреннее противоречие":
        "В одном файле две несовместимые версии событий. Какую утверждаем?",
      "Мало конкретики":
        "Материала недостаточно, чтобы согласовать уровень. Добавьте доказательства.",
    };
    return {
      roast: byTitle[p.title] ?? p.roast,
      comment:
        "Опыт может быть серьёзным. Но на бумаге выглядит как заявка на доверие без приложений.",
    };
  },
  lera: (p) => {
    const byTitle: Record<string, string> = {
      "Корпоративные клише":
        "Вы customer-centric и result-oriented. Осталось добавить хоть что-то, что встречается только у вас.",
      "Участие без роли":
        "«Участвовал» = я рядом стоял. На рынке таких сотни — мне нужен ownership.",
      "Обязанности вместо достижений":
        "Список задач я вижу в каждой вакансии. Покажите, чем вы лучше шаблона.",
      "Руководство без масштаба":
        "Руководили — ок. Сколько человек и какой outcome? Без этого не отличить от тимлида в Excel.",
      "Инфляция «эффективности»":
        "Слово «эффективный» у меня уже аллергия. Дайте кейс.",
      "Внутреннее противоречие":
        "Две версии в одном резюме — я закрою вкладку, а не разберусь.",
      "Мало конкретики":
        "Мало текста — мало сигналов. Добавьте 2–3 доказанных пункта.",
    };
    return {
      roast: byTitle[p.title] ?? p.roast,
      comment:
        "На рынке таких профилей сотни. Без цифр и ясной роли я не остановлюсь на этом файле.",
    };
  },
  gleb: (p) => {
    const byTitle: Record<string, string> = {
      "Внутреннее противоречие":
        "Формулировка достаточно широкая, чтобы включать пол-экономики, но недостаточно конкретная, чтобы понять вашу роль.",
      "Обязанности вместо достижений":
        "Документ описывает функцию, а не доказанную ценность. Это разные жанры.",
      "Руководство без масштаба":
        "Управление без масштаба — утверждение без операционализации.",
      "Участие без роли":
        "Участие без роли — логическая дыра: субъект действия не определён.",
      "Корпоративные клише":
        "Клише — это шум. Шум снижает отношение сигнал/шум до уровня шаблона.",
      "Инфляция «эффективности»":
        "Повтор «эффективности» без метрик — риторика, не аргумент.",
      "Мало конкретики":
        "Выборка слишком мала для вывода о уровне. Расширьте доказательную базу.",
    };
    return {
      roast: byTitle[p.title] ?? p.roast,
      comment:
        "Документ страдает не от недостатка слов, а от недостатка доказательной структуры.",
    };
  },
  vadik: (p) => {
    const byTitle: Record<string, string> = {
      "Участие без роли":
        "«Кросс-функциональное взаимодействие» — это когда ты сам ничего не сделал, но знаешь имена тех, кто сделал?",
      "Обязанности вместо достижений":
        "Мне не нужна твоя должностная. Мне нужно: что сломал, что починил, что принёс.",
      "Руководство без масштаба":
        "Руководил — круто. Сколько людей и какой P&L / ship? Иначе это Zoom-менеджмент.",
      "Корпоративные клише":
        "Клише = я не знаю, чем ты полезен. Пиши как билдер, не как презентация.",
      "Инфляция «эффективности»":
        "Эффективность без цифры — это надежда. У стартапа надежда не KPI.",
      "Внутреннее противоречие":
        "Две истории в одном файле — выбери одну и защити её фактами.",
      "Мало конкретики":
        "Мало мяса. Добавь ownership и итог — иначе нечем спорить.",
    };
    return {
      roast: byTitle[p.title] ?? p.roast,
      comment:
        "Мне нужен человек, который приносит результат, а не ещё один созвон с красивым названием.",
    };
  },
};

function buildVerdict(
  personaId: PersonaId,
  score: ReturnType<typeof buildScore>,
  facts: HeuristicFacts,
) {
  const titles: Record<PersonaId, string[]> = {
    tamara: [
      "Руководил всем. Подробности засекречены",
      "Стабильный корпоративный туман",
      "Должность есть, масштаба нет",
    ],
    lera: [
      "Ещё одно идеальное резюме без человека",
      "Сорок первое в очереди",
      "Позиционирование в режиме тумана",
    ],
    gleb: [
      "Стратегия без стратегического содержания",
      "Широко, красиво, недоказуемо",
      "Executive narrative не прошёл проверку",
    ],
    vadik: [
      "Много встреч, мало ownership",
      "Хочет стратегию, цифры не приложил",
      "Координатор под видом билдера",
    ],
  };

  const pick =
    titles[personaId][
      (facts.responsibilitiesCount + facts.achievementsCount) %
        titles[personaId].length
    ];

  const personaComment = PERSONA_ROAST[personaId]({
    id: "v",
    severity: "high",
    title: "",
    quote: "",
    roast: "",
    diagnosis: "",
    recommendation: "",
  });

  return {
    title: pick,
    comment: `${personaComment.comment} Оценка ${score.total}/100 — про убедительность текста резюме, не про вас как специалиста.`,
  };
}

export function runHeuristicAnalysis(
  text: string,
  personaId: PersonaId,
): AnalysisReport {
  const facts = extractFacts(text);
  const score = buildScore(facts, text);
  const baseProblems = buildProblems(facts);
  const recommendation = recommendPersona(facts);

  const topProblems = baseProblems.map((p) => {
    const styled = PERSONA_ROAST[personaId](p);
    return { ...p, roast: styled.roast };
  });

  const corporateWater = clamp(
    35 +
      facts.clicheHits.length * 8 +
      facts.participialLines.length * 6 +
      Math.max(0, facts.responsibilitiesCount - facts.achievementsCount) * 4,
  );

  const aiLanguageProbability = clamp(
    AI_MARKERS.filter((m) => text.toLowerCase().includes(m)).length * 12 +
      facts.clicheHits.length * 5,
  );

  const strengths =
    facts.achievementsCount > 0
      ? (() => {
          const quote = facts.lines.find(
            (l) => l.kind === "achievement" && !isBioNoise(l.text),
          )?.text;
          if (!quote) return [];
          return [
            {
              id: "s1",
              title: "Есть измеримые результаты",
              quote,
              comment: "Неплохо. Даже раздражает — в хорошем смысле.",
            },
          ];
        })()
      : [];

  const shareQuotes = topProblems.slice(0, 3).map((p, i) => ({
    id: `q-${i}`,
    kind: (["precise", "funny", "safe"] as const)[i] ?? "precise",
    text: p.roast,
  }));

  const report: AnalysisReport = {
    candidateProfile: {
      primaryRole: facts.inferredRole,
      professionalFamily: facts.professionalFamily,
      inferredLevel: facts.inferredLevel,
      claimedLevel: facts.claimedLevel,
      confidence: 0.72,
    },
    score,
    viralMetrics: {
      corporateWater,
      careerPathos: clamp(40 + facts.clicheHits.length * 10),
      aiLanguageProbability,
      responsibilitiesCount: facts.responsibilitiesCount,
      achievementsCount: facts.achievementsCount,
      unprovenClaimsCount:
        facts.participialLines.length + facts.managementWithoutScale.length,
      participialCoefficient: clamp(facts.participialLines.length * 18),
    },
    verdict: buildVerdict(personaId, score, facts),
    hrReview: {
      firstImpression: buildVerdict(personaId, score, facts).comment,
      deepDive: topProblems
        .map((p) => `${p.title}. ${p.roast} ${p.diagnosis}`)
        .join("\n\n"),
      hiringTake: `По тексту убедительность ${score.total}/100. Это оценка формулировок, не человека.`,
      fixPriority: buildImprovementPlan(facts, topProblems)
        .map((s) => s.action)
        .join(" "),
    },
    topProblems,
    strengths,
    theatreFindings: buildTheatreFindings(facts),
    shareQuotes,
    improvementPlan: buildImprovementPlan(facts, topProblems),
    contentBlocks: [],
    recommendedPersonaId: recommendation.id,
    recommendationReason: recommendation.reason,
  };

  return report;
}
