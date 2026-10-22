"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { signOut } from "next-auth/react";

type Section = "resumes" | "vacancies" | "documents" | "settings";

export function CabinetNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active: Section = pathname === "/vacancies" ? "vacancies" : pathname === "/settings" ? "settings" : searchParams.get("tab") === "documents" ? "documents" : "resumes";
  const links: { href: string; label: string; section: Section }[] = [
    { href: "/me", label: "Мои резюме", section: "resumes" },
    { href: "/vacancies", label: "Вакансии", section: "vacancies" },
    { href: "/me?tab=documents", label: "Документы", section: "documents" },
    { href: "/settings", label: "Настройки", section: "settings" },
  ];

  return <aside className="cabinet-side"><nav aria-label="Личный кабинет">
    {links.map(({ href, label, section }) => <Link key={section} href={href} className={active === section ? "active" : ""} aria-current={active === section ? "page" : undefined}>{label}</Link>)}
  </nav><button type="button" className="cabinet-signout" onClick={() => signOut({ callbackUrl: "/" })}>Выйти</button></aside>;
}
