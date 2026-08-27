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
    role: "Фаундер",
    tag: "Стартап",
    img: "/hr/vadik.jpg",
    quote: "Ищет автора, не свидетеля",
    focus: "Скорость, самостоятельность и влияние на продукт",
  },
  {
    id: "lera",
    name: "Лера",
    role: "Бигтех",
    tag: "Хайтек",
    img: "/hr/lera.jpg",
    quote: "Свайпает карьеру влево",
    focus: "Ясность опыта и соответствие роли",
  },
  {
    id: "gleb",
    name: "Глеб Аркадьевич",
    role: "Партнёр консалтинга",
    tag: "Консалтинг",
    img: "/hr/gleb.jpg",
    quote: "Профессионально игнорирует координаторов и фасилитаторов",
    focus: "Структура мышления, масштаб и уровень",
  },
  {
    id: "tamara",
    name: "Тамара Петровна",
    role: "HR-директор из нефтегаза",
    tag: "Нефтегаз",
    img: "/hr/tamara.jpg",
    quote: "The kadrovik",
    focus: "Доказательства, стабильность и корпоративный контекст",
  },
];
