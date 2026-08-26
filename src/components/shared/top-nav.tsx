import Link from "next/link";
import { auth } from "@/lib/auth";

export async function TopNav() {
  const session = await auth();
  const authed = Boolean(session?.user?.id);

  return (
    <nav className="topnav">
      <Link href="/" className="brand">TOXIC<i>HR</i></Link>

      <div className="links desktop-links">
        <Link href="/hr">HR-состав</Link>
        <Link href="/vacancy">Разобрать вакансию</Link>
        {authed ? <Link href="/vacancies">Мои вакансии</Link> : null}
        <Link href="/pricing">Цены</Link>
      </div>

      <div className="right">
        <Link href={authed ? "/me" : "/auth"} className="login">
          {authed ? "Кабинет" : "Войти"}
        </Link>
        <details className="mobile-menu">
          <summary aria-label="Открыть меню"><span /><span /><span /></summary>
          <div className="mobile-panel">
            <Link href="/">Разобрать резюме</Link>
            <Link href="/vacancy">Разобрать вакансию</Link>
            <Link href="/hr">HR-состав</Link>
            <Link href="/pricing">Цена</Link>
            {authed ? <Link href="/vacancies">Мои вакансии</Link> : null}
          </div>
        </details>
      </div>

      <style>{`
        .topnav{height:68px;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;z-index:40;background:rgba(8,9,10,.78);backdrop-filter:blur(20px);padding:0 40px;border-bottom:1px solid var(--hair)}
        .brand{font-weight:700;font-size:15px;letter-spacing:.02em;color:var(--fg);text-decoration:none}.brand i{font-style:normal;color:var(--tox)}
        .links{display:flex;gap:30px}.links a{font-size:13.5px;font-weight:500;color:var(--dim);text-decoration:none;transition:.2s}.links a:hover{color:var(--fg)}
        .right{display:flex;align-items:center;gap:10px}.login{font-size:13.5px;font-weight:600;color:var(--fg);text-decoration:none;border:1px solid var(--hair2);padding:10px 18px;border-radius:13px;transition:.2s}.login:hover{background:rgba(255,255,255,.06)}
        .mobile-menu{display:none;position:relative}.mobile-menu summary{width:42px;height:42px;display:grid;place-content:center;gap:4px;border:1px solid var(--hair2);border-radius:12px;cursor:pointer;list-style:none}.mobile-menu summary::-webkit-details-marker{display:none}.mobile-menu summary span{display:block;width:16px;height:1px;background:var(--fg)}
        .mobile-panel{position:absolute;right:0;top:50px;width:min(260px,calc(100vw - 36px));padding:10px;border:1px solid var(--hair2);border-radius:16px;background:rgba(14,16,18,.98);box-shadow:0 24px 70px rgba(0,0,0,.45)}.mobile-panel a{display:block;padding:12px 13px;border-radius:10px;color:var(--dim);font-size:13.5px;text-decoration:none}.mobile-panel a:hover{color:var(--fg);background:rgba(255,255,255,.05)}
        @media(max-width:720px){.topnav{height:62px;padding:0 18px;gap:12px}.desktop-links{display:none}.mobile-menu{display:block}.login{padding:9px 13px;font-size:12px}}
      `}</style>
    </nav>
  );
}
