import type { PersonaId } from "@/lib/personas";

export type RosterEntry = {
  id: PersonaId;
  name: string;
  role: string;
  tag: string;
  img: string;
  quote: string;
  focus: string;
};

/** Порядок и подача карточек на главной. Вадик первый — его рекомендуем. */
export const ROSTER: RosterEntry[] = [
  {
    id: "vadik",
    name: "Вадик",
    role: "Фаундер стартапа",
    tag: "Рекомендуем первым",
    img: "/hr/vadik.jpg",
    quote: "Проверю, где резюме обещает больше, чем доказывает. Буллшит обычно сдаётся на третьей строке.",
    focus: "Скорость, самостоятельность и влияние на продукт",
  },
  {
    id: "lera",
    name: "Лера",
    role: "Lead recruiter · tech",
    tag: "Tech",
    img: "/hr/lera.jpg",
    quote: "Data-driven и customer-centric — хорошо. Теперь найдём, где за этим прячется реальный опыт.",
    focus: "Ясность опыта и соответствие роли",
  },
  {
    id: "gleb",
    name: "Глеб Аркадьевич",
    role: "Партнёр консалтинга",
    tag: "Consulting",
    img: "/hr/gleb.jpg",
    quote: "Стратегия развития, которая просто развивалась, — не стратегия. Поищем масштаб и доказательства.",
    focus: "Структура мышления, масштаб и уровень",
  },
  {
    id: "tamara",
    name: "Тамара Петровна",
    role: "HR-директор корпорации",
    tag: "Корпорация",
    img: "/hr/tamara.jpg",
    quote: "Руководили подразделением, но размер исчез. Вернём факты, пока кулер не записали в команду.",
    focus: "Доказательства, стабильность и корпоративный контекст",
  },
];
