import Link from "next/link";
import { auth } from "@/lib/auth";

export async function SiteHeader() {
  const session = await auth();

  return (
    <header className="relative z-20 border-b border-ink/5">
      <a
        href="#main"
        className="sr-only"
      >
        К содержимому
      </a>
      <div className="flex items-center justify-between gap-3 px-4 py-4 sm:px-8 lg:px-12 sm:py-5">
        <Link href="/" className="group flex min-w-0 items-baseline gap-2">
          <span className="font-display text-[1.45rem] tracking-tight text-ink sm:text-[1.85rem]">
            ToxicHR
          </span>
          <span className="hidden font-mono text-[10px] uppercase tracking-[0.2em] text-muted sm:inline">
            dossier
          </span>
        </Link>
        <nav
          aria-label="Основная"
          className="flex items-center gap-0.5 text-sm text-muted sm:gap-1"
        >
          <Link
            href="/pricing"
            className="min-h-10 px-2.5 py-2 transition-colors hover:text-ink sm:px-3"
          >
            Тарифы
          </Link>
          {session?.user ? (
            <>
              <Link
                href="/history"
                className="min-h-10 px-2.5 py-2 transition-colors hover:text-ink sm:px-3"
              >
                Мои
              </Link>
              <Link
                href="/settings"
                className="hidden min-h-10 px-3 py-2 transition-colors hover:text-ink sm:inline"
              >
                Настройки
              </Link>
            </>
          ) : (
            <Link
              href="/auth"
              className="min-h-10 px-2.5 py-2 transition-colors hover:text-ink sm:px-3"
            >
              Войти
            </Link>
          )}
          <Link
            href="/start"
            className="ml-1 inline-flex min-h-10 items-center bg-ink px-3 py-2 text-paper transition-colors hover:bg-graphite sm:ml-2 sm:px-3.5"
          >
            Начать
          </Link>
        </nav>
      </div>
    </header>
  );
}
