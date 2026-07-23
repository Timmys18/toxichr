/**
 * Извлечение ИМЕНИ кандидата из резюме — только имя (given name),
 * чтобы HR-персонаж мог обратиться по-человечески.
 *
 * Работает по «шапке» документа (имя почти всегда в первых строках).
 * Возвращает null, если уверенности нет — тогда персонаж обращается
 * без имени и ничего не выдумывает.
 */

const PATRONYMIC_RE =
  /(вич|вна|ична|ыч|оглы|кызы|уулу)$/i;

// Компактный словарь распространённых русских имён для дизамбигуации
// пары «Фамилия Имя» ↔ «Имя Фамилия».
const RU_GIVEN = new Set(
  [
    "александр","алексей","анатолий","андрей","антон","аркадий","артём","артем","борис",
    "вадим","валентин","валерий","василий","виктор","виталий","владимир","владислав","вячеслав",
    "геннадий","георгий","глеб","григорий","даниил","денис","дмитрий","евгений","егор","иван",
    "игорь","илья","кирилл","константин","лев","леонид","максим","марк","михаил","никита",
    "николай","олег","павел","пётр","петр","роман","руслан","сергей","станислав","степан",
    "тимофей","тимур","фёдор","федор","эдуард","юрий","ярослав",
    "анна","алёна","алена","алина","алла","анастасия","ангелина","валентина","вера","вероника",
    "виктория","галина","дарья","диана","екатерина","елена","елизавета","жанна","зоя","инна",
    "ирина","карина","кристина","ксения","лариса","лидия","любовь","людмила","маргарита","марина",
    "мария","надежда","наталья","наталия","нина","оксана","ольга","полина","светлана","софия",
    "софья","тамара","татьяна","юлия","яна",
  ],
);

// Слова-роли/секции, которые выглядят как имя, но им не являются.
const ROLE_STOPWORDS = new Set(
  [
    "backend","frontend","fullstack","developer","engineer","manager","designer",
    "analyst","architect","lead","senior","junior","middle","head","director",
    "product","project","program","marketing","sales","finance","legal","support",
    "specialist","consultant","founder","owner","officer","scientist","researcher",
    "разработчик","инженер","менеджер","дизайнер","аналитик","архитектор","директор",
    "руководитель","специалист","консультант","маркетолог","продавец","юрист",
    "ведущий","старший","младший","главный","резюме","город","москва","петербург",
  ],
);

function isNameToken(t: string): boolean {
  return /^[А-ЯЁ][а-яё]+(-[А-ЯЁ][а-яё]+)?$/.test(t) || /^[A-Z][a-z]+$/.test(t);
}

function fromLine(line: string): string | null {
  const clean = line.replace(/[|•·,]/g, " ").replace(/\s+/g, " ").trim();
  if (!clean || /\d/.test(clean)) return null;
  const tokens = clean.split(" ").filter(Boolean);
  const namish = tokens.filter(isNameToken);
  if (namish.length < 2 || namish.length > 4 || tokens.length > 5) return null;
  // если любой «именной» токен — на самом деле роль/секция, это не строка имени
  if (namish.some((t) => ROLE_STOPWORDS.has(t.toLowerCase()))) return null;

  // латиница: "John Smith" → первый токен
  if (/^[A-Za-z]/.test(namish[0])) {
    return namish[0].length >= 2 ? namish[0] : null;
  }

  const patrIdx = namish.findIndex((t) => PATRONYMIC_RE.test(t));
  if (patrIdx >= 0) {
    // Есть отчество. «Фамилия Имя Отчество» → имя перед отчеством.
    const before = namish[patrIdx - 1];
    if (before) return before;
    // «Имя Отчество …» → имя сразу перед отчеством отсутствует, берём первый.
    return namish[0];
  }

  // Два токена без отчества: выбираем тот, что есть в словаре имён.
  const byDict = namish.find((t) => RU_GIVEN.has(t.toLowerCase()));
  if (byDict) return byDict;

  // Иначе не угадываем — возвращаем null (лучше без имени, чем фамилией).
  return null;
}

export function guessCandidateFirstName(rawText: string): string | null {
  const head = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 12);

  for (const line of head) {
    // пропускаем очевидные заголовки-секции
    if (/резюме|curriculum|vitae|cv|контакт|опыт|навык/i.test(line)) continue;
    const name = fromLine(line);
    if (name) return name;
  }
  return null;
}
