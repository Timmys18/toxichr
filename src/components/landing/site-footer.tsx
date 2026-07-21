import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-ink/10 bg-paper-deep/30 px-5 py-10 sm:px-8 lg:px-12">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-display text-2xl tracking-tight text-ink">
            ToxicHR
          </p>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">
            Прожарка резюме без лишней деликатности. Сначала поржёшь — потом
            поймёшь, что чинить в тексте.
          </p>
        </div>
        <div className="flex flex-col gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-muted sm:items-end">
          <p>бьём по тексту · не по личности</p>
          <div className="flex gap-4">
            <Link href="/pricing" className="hover:text-ink">
              Тарифы
            </Link>
            <Link href="/start" className="hover:text-ink">
              Начать
            </Link>
            <Link href="/auth" className="hover:text-ink">
              Войти
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
