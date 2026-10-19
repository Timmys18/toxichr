"use client";

import { useState } from "react";
import Image from "next/image";
import type { PersonaId } from "@/lib/personas";
import { ROSTER } from "@/components/home/hr-roster";
import styles from "./hr-carousel.module.css";

export function HrCarousel({ selected, onSelect }: { selected: PersonaId; onSelect: (id: PersonaId) => void }) {
  const current = ROSTER.findIndex((person) => person.id === selected);
  const active = current < 0 ? 0 : current;

  return (
    <div className={styles.stage} role="group" aria-label="Выбери HR" onKeyDown={(event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const direction = event.key === "ArrowLeft" ? -1 : 1;
      onSelect(ROSTER[(active + direction + ROSTER.length) % ROSTER.length].id);
    }}>
      {ROSTER.map((person, index) => {
        const offset = (index - active + ROSTER.length) % ROSTER.length;
        const position = offset === 0 ? "current" : offset === 1 ? "next" : offset === ROSTER.length - 1 ? "prev" : "hidden";
        return <button
          key={person.id}
          type="button"
          className={`${styles.card} ${styles[position]}`}
          onClick={() => onSelect(person.id)}
          aria-label={`${person.name}, ${person.role}. ${position === "current" ? "Выбран" : "Выбрать"}`}
          aria-pressed={position === "current"}
          tabIndex={position === "hidden" ? -1 : 0}
        >
          <Image src={person.img} alt="" fill sizes="(max-width: 620px) 70vw, (max-width: 960px) 55vw, 34vw" priority={position === "current"} />
          <span className={styles.copy}><b>{person.name}</b><small>{person.role}</small><strong>{person.quote}</strong></span>
        </button>;
      })}
    </div>
  );
}

export function HrCarouselPreview() {
  const [selected, setSelected] = useState<PersonaId>("vadik");
  return <HrCarousel selected={selected} onSelect={setSelected} />;
}
