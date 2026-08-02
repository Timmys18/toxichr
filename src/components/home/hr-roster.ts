import type { PersonaId } from "@/lib/personas";

export type RosterEntry = {
  id: PersonaId;
  name: string;
  role: string;
  tag: string;
  img: string;
  quote: string;
};

/** Порядок и подача карточек на главной. Вадик первый — его рекомендуем. */
export const ROSTER: RosterEntry[] = [
  {
    id: "vadik",
    name: "Вадик",
    role: "Фаундер стартапа",
    tag: "Startup",
    img: "/hr/vadik.jpg",
    quote: "Убери всё, что ты не сделал руками. От резюме останется имя и фото.",
  },
  {
    id: "lera",
    name: "Лера",
    role: "Lead recruiter · tech",
    tag: "Tech",
    img: "/hr/lera.jpg",
    quote: "Data-driven и customer-centric. Осталось добавить что-то, что есть только у вас.",
  },
  {
    id: "gleb",
    name: "Глеб Аркадьевич",
    role: "Партнёр консалтинга",
    tag: "Consulting",
    img: "/hr/gleb.jpg",
    quote: "Вы разработали стратегию развития. Судя по описанию, стратегия заключалась в развитии.",
  },
  {
    id: "tamara",
    name: "Тамара Петровна",
    role: "HR-директор корпорации",
    tag: "Корпорация",
    img: "/hr/tamara.jpg",
    quote: "Руководили подразделением. Размер не указан. Видимо, оно состояло из вас и кулера.",
  },
];
