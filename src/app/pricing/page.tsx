import type { Metadata } from "next";
import Link from "next/link";
import { PAID_ACTION_PRICE_RUB } from "@/lib/payments";
import { ServicePage } from "@/components/ui/page-templates";

export const metadata: Metadata = { title: "Цены" };

const FREE = [
  "Полное заключение HR без урезаний",
  "Факты и цитаты из резюме",
  "Первый HR-разбор и ещё один взгляд",
  "Публичная карточка и шаринг",
  "Самостоятельный разбор вакансии",
];

const MATCH = [
  "Сопоставление одного резюме с одной вакансией",
  "Точные цитаты только из сохранённого опыта",
  "Решение по отклику и конкретные разрывы",
];

const REVENGE = [
  "Переписывание слабых формулировок на твоих фактах",
  "Честное сравнение до / после",
  "Ручной редактор финальной версии",
  "Готовый DOCX и версия для PDF / печати",
  "Новая версия сразу используется при проверке вакансии",
];

export default function PricingPage() {
  return (
    <ServicePage>
      <main id="main" className="flex flex-1 flex-col">
        <section className="pricing">
          <div className="ph">
            <div className="over thr-mono">Цены без сюрпризов</div>
            <h1>Понять проблему — <span>бесплатно.</span><br />Платить только за конкретную работу.</h1>
            <p>Никакой подписки и общего премиум-доступа. У каждого платного действия понятная цена заранее.</p>
          </div>

          <div className="grid">
            <div className="card">
              <div className="c-top">
                <div className="c-k thr-mono">Разбор + вакансии</div>
                <div className="price">0 ₽ <span>/ без урезаний</span></div>
              </div>
              <ul>{FREE.map((item) => <li key={item}><i aria-hidden>✓</i>{item}</li>)}</ul>
              <Link href="/" className="thr-btn thr-btn-line cta">Проверить резюме</Link>
            </div>

            <div className="card pro">
              <div className="c-top">
                <div className="c-k thr-mono">Новая версия <span className="beta">цена беты</span></div>
                <div className="price toxic">{PAID_ACTION_PRICE_RUB} ₽ <span>/ одно действие</span></div>
              </div>
              <p className="promise">Не покупаешь ещё один отчёт. Покупаешь собранную новую версию резюме.</p>
              <ul>{REVENGE.map((item) => <li key={item}><i aria-hidden>+</i>{item}</li>)}</ul>
              <Link href="/" className="thr-btn thr-btn-tox cta">Сначала получить бесплатный разбор</Link>
            </div>

            <div className="card pro">
              <div className="c-top">
                <div className="c-k thr-mono">Сопоставление <span className="beta">цена беты</span></div>
                <div className="price toxic">{PAID_ACTION_PRICE_RUB} ₽ <span>/ одна вакансия</span></div>
              </div>
              <p className="promise">Не абстрактный балл, а честный ответ: стоит ли откликаться и что реально доказывает резюме.</p>
              <ul>{MATCH.map((item) => <li key={item}><i aria-hidden>+</i>{item}</li>)}</ul>
              <Link href="/vacancy" className="thr-btn thr-btn-line cta">Разобрать вакансию бесплатно</Link>
            </div>
          </div>

          <div className="why">
            <b>Почему оплата только здесь?</b>
            <p>Бесплатно ты видишь основной разбор, один второй взгляд, share и самостоятельный разбор вакансии. 199 ₽ — это либо готовая новая версия, либо match с конкретной вакансией. Это независимые действия.</p>
          </div>
        </section>
      </main>

      <style>{`
        .pricing{width:100%;max-width:1000px;box-sizing:border-box;margin:0 auto;padding:48px 40px 90px}.pricing .ph{text-align:center;max-width:720px;margin:0 auto}.pricing .over{font-size:11px;letter-spacing:.2em;text-transform:uppercase;color:var(--faint)}.pricing h1{font-weight:800;font-size:clamp(32px,4.4vw,54px);line-height:1.04;letter-spacing:-.04em;margin-top:16px}.pricing h1 span{color:var(--tox)}.pricing .ph p{max-width:58ch;margin:18px auto 0;font-size:16px;line-height:1.6;color:var(--dim)}
        .pricing .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:18px;margin-top:44px}.pricing .card{border:1px solid var(--hair);border-radius:22px;background:var(--metal-0);padding:30px;display:flex;flex-direction:column}.pricing .card.pro{border-color:rgba(44,224,139,.32);background:linear-gradient(145deg,rgba(44,224,139,.08),var(--metal-0))}.pricing .c-k{font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:var(--dim);display:flex;align-items:center;gap:8px}.pricing .beta{font-size:10px;color:var(--tox);border:1px solid rgba(44,224,139,.24);padding:3px 8px;border-radius:999px}.pricing .price{font-weight:800;font-size:30px;letter-spacing:-.03em;margin-top:12px}.pricing .price.toxic{color:var(--tox)}.pricing .price span{font-weight:400;font-size:14px;color:var(--faint);letter-spacing:0}.pricing .promise{margin-top:15px;color:var(--dim);font-size:16px;line-height:1.5}.pricing ul{list-style:none;margin:24px 0 0;padding:0;display:flex;flex-direction:column;gap:12px;flex:1}.pricing li{display:flex;gap:12px;font-size:16px;line-height:1.45}.pricing li i{color:var(--tox);font-style:normal;font-weight:700;flex-shrink:0}.pricing .cta{margin-top:28px;min-height:52px;padding:0 22px;justify-content:center;text-align:center;text-decoration:none}.pricing .why{max-width:720px;margin:34px auto 0;padding:20px 22px;border-top:1px solid var(--hair);text-align:center}.pricing .why b{font-size:16px}.pricing .why p{margin-top:7px;color:var(--faint);font-size:16px;line-height:1.6}
        @media(max-width:760px){.pricing{padding:32px 18px 70px}.pricing .grid{grid-template-columns:1fr}.pricing .card{padding:24px 20px}}
      `}</style>
    </ServicePage>
  );
}
