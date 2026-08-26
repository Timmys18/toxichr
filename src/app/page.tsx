import { TopNav } from "@/components/shared/top-nav";
import { HomeClient } from "@/components/home/home-client";

export default function HomePage() {
  return (
    <>
      <TopNav />
      <main id="main" className="flex flex-1 flex-col">
        <HomeClient />
        <section className="home-proof" aria-label="Как работает ToxicHR">
          <article>
            <span className="thr-mono">01 · бесплатно</span>
            <b>Полный разбор, а не тизер</b>
            <p>Вердикт, конкретные цитаты, слабые места и мнение HR открыты целиком.</p>
          </article>
          <article>
            <span className="thr-mono">02 · без фантазий</span>
            <b>Не придумываем достижения</b>
            <p>Если для сильной формулировки не хватает факта, ToxicHR спросит его у тебя.</p>
          </article>
          <article className="paid">
            <span className="thr-mono">03 · 690 ₽ в бете</span>
            <b>Платишь только за готовую работу</b>
            <p>Новая версия резюме, до/после, редактор, DOCX и PDF. Один платёж, без подписки.</p>
          </article>
        </section>
      </main>
      <style>{`
        .home-proof{width:min(1080px,calc(100% - 36px));margin:-18px auto 72px;display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.home-proof article{padding:20px 22px;border:1px solid var(--hair);border-radius:17px;background:var(--metal-0)}.home-proof article.paid{border-color:rgba(44,224,139,.22);background:linear-gradient(145deg,rgba(44,224,139,.05),var(--metal-0))}.home-proof span{color:var(--tox);font-size:9px;letter-spacing:.12em;text-transform:uppercase}.home-proof b{display:block;margin-top:10px;font-size:15px}.home-proof p{margin-top:7px;color:var(--faint);font-size:12.5px;line-height:1.55}@media(max-width:760px){.home-proof{grid-template-columns:1fr;margin-top:-24px}.home-proof article{padding:18px 19px}}
      `}</style>
    </>
  );
}
