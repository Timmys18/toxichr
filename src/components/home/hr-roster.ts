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
    tag: "Стартап",
    img: "/hr/vadik.jpg",
    quote: "Проверю, где резюме обещает больше, чем доказывает.",
    focus: "Скорость, самостоятельность и влияние на продукт",
  },
  {
    id: "lera",
    name: "Лера",
    role: "Lead recruiter · tech",
    tag: "Хайтек",
    img: "/hr/lera.jpg",
    quote: "Найду, где опыт есть, а формулировка звучит как вакансия из 2017-го.",
    focus: "Ясность опыта и соответствие роли",
  },
  {
    id: "gleb",
    name: "Глеб Аркадьевич",
    role: "Партнёр консалтинга",
    tag: "Консалтинг",
    img: "/hr/gleb.jpg",
    quote: "Разложу текст так, чтобы масштаб перестал прятаться за красивыми словами.",
    focus: "Структура мышления, масштаб и уровень",
  },
  {
    id: "tamara",
    name: "Тамара Петровна",
    role: "HR-директор корпорации",
    tag: "Корпорация",
    img: "/hr/tamara.jpg",
    quote: "Вернём факты, пока ответственность не растворилась в общих фразах.",
    focus: "Доказательства, стабильность и корпоративный контекст",
  },
];
