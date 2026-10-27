"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";

export function TopNav() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const inCabinet = pathname === "/me" || pathname === "/vacancies" || pathname === "/settings";
  const authed = inCabinet || Boolean(session?.user?.id);
  return (
    <nav className="topnav" data-path={pathname} aria-label="Основная навигация">
      <Link href="/" className="brand">TOXIC<i>HR</i></Link>

      <div className="links desktop-links">
        <Link href="/#how">Как это работает</Link>
        <Link href="/hr">HR-состав</Link>
        <Link href="/vacancy">Разобрать вакансию</Link>
        <Link href="/pricing">Цены</Link>
      </div>

      <div className="right">
        <Link href="/vacancy" className="mobile-vacancy" aria-label="Разобрать вакансию">Вакансия</Link>
        <Link href={authed ? "/me" : "/auth"} className="login">{authed ? "Кабинет" : "Войти"}</Link>
        <details className="mobile-menu">
          <summary aria-label="Открыть меню"><span /><span /><span /></summary>
          <div className="mobile-panel">
            <Link href="/">Разобрать резюме</Link>
            <Link href="/#how">Как это работает</Link>
            <Link href="/vacancy">Разобрать вакансию</Link>
            <Link href="/hr">HR-состав</Link>
            <Link href="/pricing">Цены</Link>
          </div>
        </details>
      </div>

    </nav>
  );
}
