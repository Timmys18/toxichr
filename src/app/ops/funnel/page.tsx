import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { REVENGE_PRICE_RUB } from "@/lib/payments";

function allowedEmails() {
  return (process.env.OPS_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function pct(value: number, previous: number) {
  if (!previous) return "—";
  return `${Math.round((value / previous) * 1000) / 10}%`;
}

export default async function FunnelPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email || !allowedEmails().includes(email)) notFound();

  const params = await searchParams;
  const days = params.days === "30" ? 30 : params.days === "all" ? null : 7;
  const since = days ? new Date(Date.now() - days * 24 * 60 * 60 * 1000) : null;
  const timeWhere = since ? { createdAt: { gte: since } } : {};

  async function unique(eventName: string) {
    const rows = await prisma.productEvent.findMany({
      where: {
        eventName,
        visitorId: { not: null },
        ...timeWhere,
      },
      distinct: ["visitorId"],
      select: { visitorId: true },
    });
    return rows.length;
  }

  const [
    landing,
    uploaded,
    verdict,
    fixClick,
    fixStarted,
    paywall,
    vacancyOpened,
    vacancyCompleted,
    checkoutPayments,
    paidPayments,
    shares,
    shareViews,
    referralsStarted,
    referralsCompleted,
  ] = await Promise.all([
    unique("landing_viewed"),
    unique("resume_uploaded"),
    unique("verdict_viewed"),
    unique("result_fix_cta_clicked"),
    unique("fix_started"),
    unique("paywall_viewed"),
    unique("vacancy_review_opened"),
    unique("vacancy_review_completed"),
    prisma.payment.findMany({
      where: timeWhere,
      select: { analysisId: true },
    }),
    prisma.payment.findMany({
      where: { status: "PAID", ...timeWhere },
      select: { analysisId: true, amount: true },
    }),
    prisma.publicShare.count({ where: timeWhere }),
    prisma.shareEvent.findMany({
      where: { eventType: "viewed", sessionId: { not: null }, ...timeWhere },
      distinct: ["sessionId"],
      select: { sessionId: true },
    }),
    prisma.referralSession.count({ where: timeWhere }),
    prisma.referralSession.count({
      where: { completedAt: { not: null }, ...timeWhere },
    }),
  ]);

  const checkout = new Set(checkoutPayments.map((payment) => payment.analysisId).filter(Boolean)).size;
  const paid = new Set(paidPayments.map((payment) => payment.analysisId).filter(Boolean)).size;
  const revenueRub = Math.round(paidPayments.reduce((sum, payment) => sum + payment.amount, 0) / 100);

  const funnel = [
    ["Открыли главную", landing],
    ["Загрузили резюме", uploaded],
    ["Увидели вердикт", verdict],
    ["Нажали «Исправить»", fixClick],
    ["Открыли Реванш", fixStarted],
    ["Увидели paywall", paywall],
    ["Начали оплату", checkout],
    ["Оплатили", paid],
  ] as const;

  const vacancyFunnel = [
    ["Открыли вакансию", vacancyOpened],
    ["Получили результат", vacancyCompleted],
  ] as const;

  return (
    <>
      <main className="ops">
        <div className="head">
          <div>
            <p className="over thr-mono">Закрытая аналитика · уникальные посетители</p>
            <h1>Воронка ToxicHR</h1>
          </div>
          <nav className="periods" aria-label="Период">
            <Link href="/ops/funnel?days=7" className={days === 7 ? "active" : ""}>7 дней</Link>
            <Link href="/ops/funnel?days=30" className={days === 30 ? "active" : ""}>30 дней</Link>
            <Link href="/ops/funnel?days=all" className={days === null ? "active" : ""}>Всё время</Link>
          </nav>
        </div>

        <section className="commercial">
          <div className="section-title"><h2>Деньги</h2><span>{paid} оплат · {revenueRub.toLocaleString("ru-RU")} ₽ выручки · цена {REVENGE_PRICE_RUB} ₽</span></div>
          <div className="funnel">
            {funnel.map(([label, value], index) => {
              const previous = index === 0 ? value : funnel[index - 1][1];
              return (
                <article key={label} className={label === "Оплатили" ? "money" : ""}>
                  <strong>{value}</strong>
                  <span>{label}</span>
                  <small>{index === 0 ? "база" : `${pct(value, previous)} от прошлого шага`}</small>
                </article>
              );
            })}
          </div>
        </section>

        <div className="secondary-grid">
          <section>
            <div className="section-title"><h2>Вакансии</h2><span>retention loop</span></div>
            <div className="mini">
              {vacancyFunnel.map(([label, value], index) => <article key={label}><strong>{value}</strong><span>{label}</span><small>{index ? `${pct(value, vacancyFunnel[index - 1][1])} завершили` : "уникальные"}</small></article>)}
            </div>
          </section>

          <section>
            <div className="section-title"><h2>Вирусность</h2><span>public share loop</span></div>
            <div className="mini">
              <article><strong>{shares}</strong><span>Создали карточку</span><small>все карточки</small></article>
              <article><strong>{shareViews.length}</strong><span>Уникально открыли</span><small>{pct(shareViews.length, shares)} view/share</small></article>
              <article><strong>{referralsStarted}</strong><span>Начали свой путь</span><small>{pct(referralsStarted, shareViews.length)} от просмотров</small></article>
              <article><strong>{referralsCompleted}</strong><span>Дошли до вердикта</span><small>{pct(referralsCompleted, referralsStarted)} от стартов</small></article>
            </div>
          </section>
        </div>

        <p className="note">Основные продуктовые шаги считаются по уникальному visitorId, а checkout и оплаты — по уникальному analysisId. Повторные открытия и повторные клики больше не раздувают конверсию.</p>
      </main>
      <style>{`
        .ops{width:min(1180px,calc(100% - 36px));margin:0 auto;padding:48px 0 80px}.head{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;flex-wrap:wrap}.ops .over{color:var(--tox);font-size:11px;letter-spacing:.18em;text-transform:uppercase}.ops h1{margin-top:12px;font-size:clamp(32px,5vw,56px);letter-spacing:-.04em}.periods{display:flex;gap:5px;padding:4px;border:1px solid var(--hair);border-radius:12px;background:var(--metal-0)}.periods a{padding:8px 11px;border-radius:9px;color:var(--faint);font-size:11.5px;text-decoration:none}.periods a.active{background:var(--metal-2);color:var(--fg)}
        .commercial{margin-top:38px}.section-title{display:flex;align-items:baseline;justify-content:space-between;gap:16px;margin-bottom:14px}.section-title h2{font-size:18px}.section-title span{color:var(--faint);font-size:11.5px}.funnel{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.funnel article,.mini article{min-height:142px;padding:20px;border:1px solid var(--hair);border-radius:16px;background:var(--metal-0);display:flex;flex-direction:column}.funnel article.money{border-color:rgba(44,224,139,.38);background:linear-gradient(145deg,rgba(44,224,139,.08),var(--metal-0))}.funnel strong,.mini strong{font-size:36px;color:var(--tox);letter-spacing:-.04em}.funnel span,.mini span{margin-top:auto;color:var(--dim);font-size:13px}.funnel small,.mini small{margin-top:5px;color:var(--faint);font-size:10.5px}.secondary-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:36px}.mini{display:grid;grid-template-columns:1fr 1fr;gap:10px}.note{max-width:74ch;margin-top:28px;color:var(--faint);font-size:11.5px;line-height:1.6}
        @media(max-width:900px){.funnel{grid-template-columns:repeat(2,1fr)}.secondary-grid{grid-template-columns:1fr}}
        @media(max-width:520px){.ops{padding-top:32px}.funnel,.mini{grid-template-columns:1fr 1fr}.funnel article,.mini article{min-height:124px;padding:16px}.funnel strong,.mini strong{font-size:30px}.section-title{align-items:flex-start;flex-direction:column;gap:4px}}
      `}</style>
    </>
  );
}
