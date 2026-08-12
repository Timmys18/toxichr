import type { Metadata } from "next";
import Link from "next/link";
import { TopNav } from "@/components/shared/top-nav";

export const metadata: Metadata = { title: "Цены" };

const FREE = [
  "Полное заключение HR без урезаний",
  "Разбор голосом персонажа под твой текст",
  "Факты и цитаты из резюме",
  "Все четыре HR-эксперта",
  "Публичная карточка и шаринг",
];

const PRO = [
  "Переписывание слабых формулировок",
  "Сравнение резюме с вакансией",
  "Динамика до / после правок",
  "История версий резюме",
  "Подготовка к вопросам интервью",
];

export default function PricingPage() {
  return (
    <>
      <TopNav />
      <main id="main" className="flex flex-1 flex-col">
        <section className="pricing">
          <div className="ph">
            <div className="over thr-mono">Цены</div>
            <h1>
              Честный разбор — <span>бесплатно.</span>
              <br />
              Глубже — когда захочешь.
            </h1>
            <p>
              Сейчас идёт закрытый тест: полный разбор открыт без оплаты.
            </p>
          </div>

          <div className="grid">
            <div className="card">
              <div className="c-top">
                <div className="c-k thr-mono">Разбор</div>
                <div className="price">
                  0 ₽ <span>/ во время теста</span>
                </div>
              </div>
              <ul>
                {FREE.map((f) => (
                  <li key={f}>
                    <i className="ok" aria-hidden>
                      ✓
                    </i>
                    {f}
                  </li>
                ))}
              </ul>
              <Link href="/" className="thr-btn thr-btn-tox cta">
                Кинуть резюме на разбор
              </Link>
            </div>

            <div className="card pro">
              <div className="c-top">
                <div className="c-k thr-mono">
                  Реванш <span className="soon">пилот</span>
                </div>
                <div className="price muted">
                  690 ₽ <span>· первые 20 участников</span>
                </div>
              </div>
              <ul>
                {PRO.map((f) => (
                  <li key={f}>
                    <i aria-hidden>+</i>
                    {f}
                  </li>
                ))}
              </ul>
              <Link href="/" className="thr-btn thr-btn-line cta">
                Сначала разобрать резюме
              </Link>
            </div>
          </div>

          <p className="note">
            Платить нужно будет за готовую исправленную версию, а не за
            дополнительные объяснения того же диагноза.
          </p>
        </section>
      </main>

      <style>{`
        .pricing { max-width: 1000px; margin: 0 auto; padding: 48px 40px 90px; }
        @media (max-width: 720px) { .pricing { padding: 32px 18px 70px; } }
        .pricing .ph { text-align: center; max-width: 640px; margin: 0 auto; }
        .pricing .over { font-size: 11px; letter-spacing: .22em; text-transform: uppercase; color: var(--faint); }
        .pricing h1 { font-weight: 800; font-size: clamp(32px,4.4vw,54px); line-height: 1.04; letter-spacing: -.04em; margin-top: 16px; }
        .pricing h1 span { color: var(--tox); }
        .pricing .ph p { margin-top: 18px; font-size: 16px; color: var(--dim); }
        .pricing .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-top: 44px; }
        @media (max-width: 760px) { .pricing .grid { grid-template-columns: 1fr; } }
        .pricing .card { border: 1px solid var(--hair); border-radius: 22px; background: var(--metal-0); padding: 30px; display: flex; flex-direction: column; }
        .pricing .card.pro { background: linear-gradient(180deg,var(--metal-1),var(--metal-0)); }
        .pricing .c-k { font-size: 11px; letter-spacing: .16em; text-transform: uppercase; color: var(--dim); display: flex; align-items: center; gap: 8px; }
        .pricing .soon { font-size: 9px; letter-spacing: .12em; color: var(--faint); border: 1px solid var(--hair); padding: 3px 8px; border-radius: 999px; }
        .pricing .price { font-weight: 800; font-size: 30px; letter-spacing: -.03em; margin-top: 12px; }
        .pricing .price.muted { color: var(--dim); font-size: 22px; }
        .pricing .price span { font-weight: 400; font-size: 13px; color: var(--faint); letter-spacing: 0; }
        .pricing ul { list-style: none; margin: 24px 0 0; padding: 0; display: flex; flex-direction: column; gap: 12px; flex: 1; }
        .pricing li { display: flex; gap: 12px; font-size: 14.5px; color: var(--fg); line-height: 1.4; }
        .pricing li i { color: var(--tox); font-style: normal; font-weight: 700; flex-shrink: 0; }
        .pricing .card.pro li i { color: var(--faint); }
        .pricing .cta { margin-top: 28px; height: 52px; justify-content: center; text-decoration: none; }
        .pricing .cta.disabled { opacity: .5; cursor: default; }
        .pricing .note { margin-top: 34px; text-align: center; font-size: 13px; color: var(--faint); line-height: 1.6; max-width: 60ch; margin-left: auto; margin-right: auto; }
      `}</style>
    </>
  );
}
