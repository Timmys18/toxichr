import type { Metadata } from "next";
import Link from "next/link";
import { TopNav } from "@/components/shared/top-nav";
import { ROSTER } from "@/components/home/hr-roster";

export const metadata: Metadata = { title: "HR-состав" };

const LENSES: Record<string, string[]> = {
  vadik: ["ownership", "скорость", "влияние на выручку"],
  lera: ["позиционирование", "метрики", "читаемость за 10 сек"],
  gleb: ["логика", "доказательность", "структура"],
  tamara: ["масштаб", "полномочия", "стабильность"],
};

const PICK: Record<string, string> = {
  vadik: "Выбери, если в резюме много руководства и мало личных результатов.",
  lera: "Выбери, если резюме звучит как все — и теряется в потоке.",
  gleb: "Выбери, если хочешь, чтобы разобрали логику и доказательства.",
  tamara: "Выбери, если управленческий опыт, но неясен масштаб.",
};

export default function HrPage() {
  return (
    <>
      <TopNav />
      <main id="main" className="flex flex-1 flex-col">
        <section className="cast">
          <div className="ph">
            <div className="over thr-mono">HR-состав</div>
            <h1>
              Четыре разных взгляда. <span>Один — беспощадный к воде.</span>
            </h1>
            <p>
              У всех единое аналитическое ядро — меняется оптика, лексика и тип
              сарказма. Факты не выдумываются.
            </p>
          </div>

          <div className="list">
            {ROSTER.map((p) => (
              <div key={p.id} className="hr">
                <span
                  className="photo thr-photo"
                  style={{ backgroundImage: `url('${p.img}')` }}
                >
                  <span className="tag thr-mono">{p.tag}</span>
                </span>
                <div className="body">
                  <div className="nm">{p.name}</div>
                  <div className="rl">{p.role}</div>
                  <p className="qt">«{p.quote}»</p>
                  <div className="lenses">
                    {(LENSES[p.id] ?? []).map((l) => (
                      <span key={l}>{l}</span>
                    ))}
                  </div>
                  <div className="pick">{PICK[p.id]}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="cta-wrap">
            <Link href="/" className="thr-btn thr-btn-tox">
              Выбрать и кинуть резюме
            </Link>
          </div>
        </section>
      </main>

      <style>{`
        .cast { width: 100%; max-width: 1100px; box-sizing: border-box; margin: 0 auto; padding: 48px 40px 90px; }
        @media (max-width: 720px){ .cast { padding: 32px 18px 70px; } }
        .cast .ph { text-align: center; max-width: 680px; margin: 0 auto; }
        .cast .over { font-size: 11px; letter-spacing: .22em; text-transform: uppercase; color: var(--faint); }
        .cast h1 { font-weight: 800; font-size: clamp(30px,4.2vw,52px); line-height: 1.05; letter-spacing: -.04em; margin-top: 16px; }
        .cast h1 span { color: var(--tox); }
        .cast .ph p { margin-top: 18px; font-size: 16px; color: var(--dim); line-height: 1.6; }
        .cast .list { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-top: 44px; }
        @media (max-width: 820px){ .cast .list { grid-template-columns: 1fr; } }
        .cast .hr { display: flex; flex-direction: column; border: 1px solid var(--hair); border-radius: 20px; overflow: hidden; background: var(--metal-0); }
        .cast .photo { position: relative; aspect-ratio: 16 / 9; flex-shrink: 0; background-position: center 22%; }
        .cast .tag { position: absolute; top: 12px; left: 12px; font-size: 9px; letter-spacing: .14em; text-transform: uppercase; color: var(--fg); background: rgba(0,0,0,.4); backdrop-filter: blur(6px); padding: 5px 9px; border-radius: 6px; border: 1px solid var(--hair2); }
        .cast .body { padding: 22px 22px 24px; }
        .cast .nm { font-weight: 700; font-size: 20px; letter-spacing: -.02em; }
        .cast .rl { font-size: 12.5px; color: var(--dim); margin-top: 3px; }
        .cast .qt { margin-top: 14px; font-size: 14px; line-height: 1.5; color: rgba(242,244,245,.85); }
        .cast .lenses { margin-top: 14px; display: flex; gap: 6px; flex-wrap: wrap; }
        .cast .lenses span { font-family: var(--font-mono); font-size: 9.5px; letter-spacing: .08em; text-transform: uppercase; color: var(--dim); border: 1px solid var(--hair); padding: 5px 9px; border-radius: 6px; }
        .cast .pick { margin-top: 14px; font-size: 12.5px; color: var(--faint); line-height: 1.5; }
        .cast .cta-wrap { text-align: center; margin-top: 44px; }
        .cast .cta-wrap :global(.thr-btn){ height: 54px; padding: 0 30px; text-decoration: none; }
      `}</style>
    </>
  );
}
