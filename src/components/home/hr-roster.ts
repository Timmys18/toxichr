import type { PersonaId } from "@/lib/personas";

export type RosterEntry = {
  id: PersonaId;
  name: string;
  role: string;
  tag: string;
  img: string;
  focus: string;
};

/** Порядок и подача карточек на главной. Вадик первый — его рекомендуем. */
export const ROSTER: RosterEntry[] = [
  {
    id: "vadik",
    name: "Вадик",
    role: "Фаундер стартапа",
    tag: "Стартап",
    img: "/hr/vadik.jpg",
    focus: "Скорость, самостоятельность и влияние на продукт",
  },
  {
    id: "lera",
    name: "Лера",
    role: "Lead recruiter · tech",
    tag: "Хайтек",
    img: "/hr/lera.jpg",
    focus: "Ясность опыта и соответствие роли",
  },
  {
    id: "gleb",
    name: "Глеб Аркадьевич",
    role: "Партнёр консалтинга",
    tag: "Консалтинг",
    img: "/hr/gleb.jpg",
    focus: "Структура мышления, масштаб и уровень",
  },
  {
    id: "tamara",
    name: "Тамара Петровна",
    role: "HR-директор корпорации",
    tag: "Корпорация",
    img: "/hr/tamara.jpg",
    focus: "Доказательства, стабильность и корпоративный контекст",
  },
];
