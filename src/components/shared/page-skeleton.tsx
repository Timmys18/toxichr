"use client";

import "./page-skeleton.css";

export function PageSkeleton({ variant = "page" }: { variant?: "page" | "session" | "vacancy" | "history" | "editor" }) {
  const rows = variant === "history" ? 5 : variant === "session" ? 4 : 3;

  return (
    <section className={`page-skeleton ${variant}`} aria-busy="true" aria-label="Загрузка страницы">
      <div className="skeleton-head"><i /><b /><span /></div>
      <div className="skeleton-body">{Array.from({ length: rows }, (_, index) => <span key={index} />)}</div>
    </section>
  );
}
