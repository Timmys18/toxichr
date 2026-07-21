"use client";

import { useEffect } from "react";
import Link from "next/link";

type Props = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function Error({ error, reset }: Props) {
  useEffect(() => {
    console.error("[app error]", error);
  }, [error]);

  return (
    <main className="relative flex min-h-[70vh] flex-1 flex-col items-center justify-center overflow-hidden px-5 py-20">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 dossier-grid opacity-40"
      />
      <div className="relative z-10 max-w-lg text-center">
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-roast">
          сбой · улики потеряны
        </p>
        <h1 className="mt-4 font-display text-4xl tracking-tight text-ink sm:text-5xl">
          Что-то пошло не так
        </h1>
        <p className="mt-4 text-muted leading-relaxed">
          Сервис споткнулся. Можно попробовать снова или начать прожарку
          заново.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-11 items-center justify-center bg-toxic px-5 text-sm font-medium text-ink hover:bg-toxic-hot"
          >
            Попробовать снова
          </button>
          <Link
            href="/start"
            className="inline-flex h-11 items-center justify-center border border-ink/20 bg-surface px-5 text-sm font-medium text-ink hover:border-ink/40"
          >
            Новая прожарка
          </Link>
        </div>
      </div>
    </main>
  );
}
