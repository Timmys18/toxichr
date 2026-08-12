import { notFound } from "next/navigation";
import { TopNav } from "@/components/shared/top-nav";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function allowedEmails() {
  return (process.env.OPS_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

export default async function FunnelPage() {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email || !allowedEmails().includes(email)) notFound();

  const [events, referralsStarted, referralsCompleted] = await Promise.all([
    prisma.productEvent.groupBy({
      by: ["eventName"],
      _count: { _all: true },
    }),
    prisma.referralSession.count(),
    prisma.referralSession.count({
      where: { completedAt: { not: null } },
    }),
  ]);

  const count = (eventName: string) =>
    events.find((event) => event.eventName === eventName)?._count._all ?? 0;
  const rows = [
    ["Открыли главную", count("landing_viewed")],
    ["Начали загрузку", count("resume_upload_started")],
    ["Загрузили резюме", count("resume_uploaded")],
    ["Получили разбор", count("analysis_completed")],
    ["Увидели результат", count("verdict_viewed")],
    ["Создали публичную карточку", count("public_share_created")],
    ["Открыли карточку", count("public_share_viewed")],
    ["Перешли с карточки", count("public_cta_clicked")],
    ["Начали путь из карточки", referralsStarted],
    ["Дошли из карточки до результата", referralsCompleted],
    ["Нажали «Исправить»", count("resume_fix_opened")],
    ["Открыли разбор вакансии", count("vacancy_review_opened")],
  ] as const;

  return (
    <>
      <TopNav />
      <main className="ops">
        <p className="over thr-mono">Закрытая аналитика · за всё время</p>
        <h1>Воронка ToxicHR</h1>
        <div className="grid">
          {rows.map(([label, value]) => (
            <article key={label}>
              <strong>{value}</strong>
              <span>{label}</span>
            </article>
          ))}
        </div>
      </main>
      <style>{`
        .ops { width: min(1100px, calc(100% - 36px)); margin: 0 auto; padding: 48px 0 80px; }
        .ops .over { color: var(--tox); font-size: 11px; letter-spacing: .18em; text-transform: uppercase; }
        .ops h1 { margin-top: 12px; font-size: clamp(32px, 5vw, 56px); letter-spacing: -.04em; }
        .ops .grid { display: grid; grid-template-columns: repeat(auto-fit,minmax(220px,1fr)); gap: 14px; margin-top: 34px; }
        .ops article { min-height: 150px; padding: 24px; border: 1px solid var(--hair); border-radius: 18px; background: var(--metal-0); display: flex; flex-direction: column; justify-content: space-between; }
        .ops strong { font-size: 42px; color: var(--tox); letter-spacing: -.04em; }
        .ops span { color: var(--dim); font-size: 14px; line-height: 1.4; }
      `}</style>
    </>
  );
}
