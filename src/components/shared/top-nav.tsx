import Link from "next/link";
import { auth } from "@/lib/auth";

export async function TopNav() {
  const session = await auth();
  const authed = Boolean(session?.user?.id);
  return (
    <nav className="topnav">
      <Link href="/" className="brand">
        TOXIC<i>HR</i>
      </Link>
      <div className="links">
        <Link href="/hr">HR-состав</Link>
        <Link href="/vacancy">Разобрать вакансию</Link>
        <Link href="/pricing">Цены</Link>
      </div>
      <Link href={authed ? "/me" : "/auth"} className="login">
        {authed ? "Кабинет" : "Войти"}
      </Link>
      <style>{`
        .topnav{height:68px;display:flex;align-items:center;justify-content:space-between;
          position:sticky;top:0;z-index:40;background:rgba(8,9,10,.75);backdrop-filter:blur(20px);
          padding:0 40px;border-bottom:1px solid var(--hair)}
        @media(max-width:720px){.topnav{padding:0 18px}}
        .brand{font-weight:700;font-size:15px;letter-spacing:.02em;color:var(--fg);text-decoration:none}
        .brand i{font-style:normal;color:var(--tox)}
        .links{display:flex;gap:30px}
        @media(max-width:720px){.links{display:none}}
        .links a{font-size:13.5px;font-weight:500;color:var(--dim);text-decoration:none;transition:.2s}
        .links a:hover{color:var(--fg)}
        .login{font-size:13.5px;font-weight:600;color:var(--fg);text-decoration:none;
          border:1px solid var(--hair2);padding:10px 18px;border-radius:13px;transition:.2s}
        .login:hover{background:rgba(255,255,255,.06)}
      `}</style>
    </nav>
  );
}
