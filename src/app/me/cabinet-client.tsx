"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";

export type CabItem = {
  id: string;
  personaName: string;
  img: string;
  verdictTitle: string;
  score: number;
  createdAt: string;
  responsibilities: number;
  achievements: number;
  unproven: number;
  filename: string;
  afterScore: number | null;
  hasImprovement: boolean;
};

function timeAgo(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function CabinetClient({
  name,
  items,
  vacancyCount,
}: {
  name: string;
  items: CabItem[];
  vacancyCount: number;
}) {
  const last = items[0];
  const improved = items.filter((item) => item.hasImprovement);
  const status =
    !last
      ? "ждёт разбора"
      : last.score >= 75
        ? "почти готово"
        : last.score >= 55
          ? "сыровато"
          : "тонет в воде";

  return (
    <div className="cab">
      <div className="cab-head">
        <div className="cab-head-l">
          <div className="hi thr-mono">Центр карьеры</div>
          <h1>
            {name}, резюме <span>{status}</span>
          </h1>
        </div>
        {last ? (
          <Link href="/" className="thr-btn thr-btn-tox newbtn">
            Новый разбор
          </Link>
        ) : null}
      </div>

      {last ? (
        <div className="cab-grid">
          <div className="panel">
            <div className="p-t thr-mono">
              <span>Последний разбор</span>
              <Link href={`/session?view=${last.id}`}>открыть →</Link>
            </div>
            <div className="last">
              <span
                className="ava thr-photo"
                style={{ backgroundImage: `url('${last.img}')` }}
              />
              <div>
                <h3>«{last.verdictTitle}»</h3>
                <div className="meta">
                  {last.personaName} · {timeAgo(last.createdAt)} ·{" "}
                  {last.filename}
                </div>
              </div>
            </div>
            <div className="delta">
              <div className="c">
                <div className="v crit">
                  {last.achievements}/{last.responsibilities}
                </div>
                <div className="k">результаты / процесс</div>
              </div>
              <div className="c">
                <div className="v crit">{last.unproven}</div>
                <div className="k">заявлений без фактов</div>
              </div>
              <div className="c">
                <div className="v tox">{last.score}</div>
                <div className="k">оценка убедительности</div>
              </div>
            </div>
            <Link href={`/revenge?analysisId=${last.id}`} className="thr-btn thr-btn-line rebtn">
              {last.hasImprovement ? "Открыть новую версию и сравнение" : "Исправить и сравнить до / после"}
            </Link>
          </div>

          <div>
            <div className="panel">
              <div className="p-t thr-mono" aria-label={`Мои разборы: ${items.length}`}>
                <span>Мои разборы</span>
                <span>{items.length}</span>
              </div>
              <div className="rlist">
                {items.map((it) => (
                  <Link key={it.id} href={`/session?view=${it.id}`} className="r">
                    <span
                      className="a thr-photo"
                      style={{ backgroundImage: `url('${it.img}')` }}
                    />
                    <span className="rt">
                      <span className="t1">«{it.verdictTitle}»</span>
                      <span className="t2">
                        {it.personaName} · {timeAgo(it.createdAt)}
                      </span>
                    </span>
                    <span className="go">→</span>
                  </Link>
                ))}
              </div>
            </div>

            <div className="panel" style={{ marginTop: 18 }}>
              <div className="p-t thr-mono">
                <span>Версии до / после</span>
                <span>{improved.length}</span>
              </div>
              {improved.length ? (
                <div className="versions">
                  {improved.slice(0, 5).map((item) => (
                    <Link key={item.id} href={`/revenge?analysisId=${item.id}`} className="version">
                      <span><b>{item.score}</b> было</span>
                      <i>→</i>
                      <span className="up"><b>{item.afterScore ?? item.score}</b> стало</span>
                      <em>Открыть</em>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="empty">
                  После первого улучшения здесь появится честное сравнение двух версий.
                  <br />
                  <Link href={`/revenge?analysisId=${last.id}`}>Собрать новую версию →</Link>
                </div>
              )}
            </div>

            <Link href="/vacancies" className="vacancy-panel">
              <span>
                <b>Мои вакансии</b>
                <small>Разборы, сопоставления и тексты для отклика</small>
              </span>
              <strong>{vacancyCount}</strong>
              <i>→</i>
            </Link>
          </div>
        </div>
      ) : (
        <div className="empty-big">
          <h2>С чего начнём?</h2>
          <p>
            Можно проверить резюме или сначала разобрать вакансию. Если начать с вакансии, её текст сохранится до сопоставления.
          </p>
          <div className="empty-actions">
            <Link href="/" className="thr-btn thr-btn-tox">
              Проверить резюме
            </Link>
            <Link href="/vacancy" className="thr-btn thr-btn-line">
              Разобрать вакансию{vacancyCount > 0 ? ` · ${vacancyCount}` : ""}
            </Link>
          </div>
        </div>
      )}

      <div className="footer">
        <button onClick={() => signOut({ callbackUrl: "/" })}>Выйти</button>
        <Link href="/settings">Приватность и удаление данных</Link>
      </div>

      <style jsx>{`
        .cab {
          width: 100%;
          max-width: 1160px;
          box-sizing: border-box;
          margin: 0 auto;
          padding: 40px 40px 80px;
          animation: thr-fade 0.6s var(--ease);
        }
        @media (max-width: 720px) {
          .cab {
            padding: 28px 18px 60px;
          }
        }
        .cab-head {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 16px 24px;
        }
        .cab-head-l {
          flex: 1 1 auto;
          min-width: 260px;
        }
        .hi {
          font-size: 11px;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: var(--faint);
        }
        .cab-head h1 {
          font-weight: 700;
          font-size: clamp(26px, 3.2vw, 38px);
          letter-spacing: -0.035em;
          margin-top: 10px;
          max-width: 22ch;
        }
        .cab-head h1 span {
          color: var(--crit);
        }
        .newbtn {
          height: 48px;
          padding: 0 24px;
          font-size: 14.5px;
          flex-shrink: 0;
          text-decoration: none;
        }
        .cab-grid {
          display: grid;
          grid-template-columns: 1.4fr 1fr;
          gap: 18px;
          margin-top: 34px;
        }
        @media (max-width: 900px) {
          .cab-grid {
            grid-template-columns: 1fr;
          }
        }
        .panel {
          border: 1px solid var(--hair);
          border-radius: 20px;
          background: var(--metal-0);
          padding: 26px;
        }
        .p-t {
          font-size: 10.5px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: var(--faint);
          margin-bottom: 18px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .p-t :global(a) {
          color: var(--dim);
          font-family: var(--font-sans);
          font-size: 12.5px;
          text-decoration: none;
          letter-spacing: 0;
          text-transform: none;
        }
        .last {
          display: flex;
          gap: 20px;
          align-items: center;
        }
        .last .ava {
          width: 72px;
          height: 72px;
          border-radius: 18px;
          border: 1px solid var(--hair2);
          flex-shrink: 0;
          background-position: center 20%;
        }
        .last h3 {
          font-weight: 700;
          font-size: 19px;
          letter-spacing: -0.02em;
          line-height: 1.2;
        }
        .last .meta {
          font-size: 12.5px;
          color: var(--faint);
          margin-top: 6px;
        }
        .delta {
          display: flex;
          gap: 1px;
          background: var(--hair);
          border: 1px solid var(--hair);
          border-radius: 14px;
          overflow: hidden;
          margin-top: 22px;
        }
        .delta .c {
          flex: 1;
          background: var(--metal-1);
          padding: 16px 18px;
          text-align: center;
        }
        .delta .v {
          font-weight: 700;
          font-size: 24px;
          letter-spacing: -0.03em;
          font-variant-numeric: tabular-nums;
        }
        .delta .v.crit {
          color: var(--crit);
        }
        .delta .v.tox {
          color: var(--tox);
        }
        .delta .k {
          font-size: 11px;
          color: var(--faint);
          margin-top: 4px;
          line-height: 1.3;
        }
        .rebtn {
          width: 100%;
          margin-top: 18px;
          height: 44px;
          font-size: 13.5px;
          justify-content: center;
        }
        .rlist {
          display: flex;
          flex-direction: column;
        }
        .rlist .r {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 14px 0;
          border-bottom: 1px solid var(--hair);
          text-decoration: none;
          color: inherit;
        }
        .rlist .r:last-child {
          border-bottom: none;
        }
        .rlist .a {
          width: 40px;
          height: 40px;
          border-radius: 11px;
          border: 1px solid var(--hair);
          flex-shrink: 0;
          background-position: center 20%;
        }
        .rlist .rt {
          min-width: 0;
        }
        .rlist .t1 {
          display: block;
          font-size: 14px;
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          max-width: 30ch;
        }
        .rlist .t2 {
          display: block;
          font-size: 11.5px;
          color: var(--faint);
          margin-top: 2px;
        }
        .rlist .go {
          margin-left: auto;
          color: var(--faint);
        }
        .empty {
          border: 1.5px dashed var(--hair2);
          border-radius: 14px;
          padding: 22px;
          text-align: center;
          color: var(--dim);
          font-size: 13.5px;
          line-height: 1.6;
        }
        .empty b {
          color: var(--fg);
        }
        .empty :global(a) { display: inline-block; margin-top: 8px; color: var(--tox); text-decoration: none; }
        .versions { display: grid; gap: 8px; }
        .version { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border: 1px solid var(--hair); border-radius: 13px; background: var(--metal-1); color: var(--faint); text-decoration: none; font-size: 10.5px; }
        .version span { display: flex; align-items: baseline; gap: 4px; }
        .version b { color: var(--crit); font-size: 19px; }
        .version .up b { color: var(--tox); }
        .version i { color: var(--hair2); font-style: normal; }
        .version em { margin-left: auto; color: var(--dim); font-style: normal; }
        .vacancy-panel { display: flex; align-items: center; gap: 16px; margin-top: 18px; padding: 20px 22px; border: 1px solid rgba(106,155,255,.24); border-radius: 18px; background: rgba(106,155,255,.06); color: inherit; text-decoration: none; transition: .2s var(--ease); }
        .vacancy-panel:hover { transform: translateY(-2px); border-color: rgba(106,155,255,.42); }
        .vacancy-panel > span { min-width: 0; flex: 1; }
        .vacancy-panel b { display: block; font-size: 16px; }
        .vacancy-panel small { display: block; margin-top: 4px; color: var(--faint); font-size: 11.5px; line-height: 1.4; }
        .vacancy-panel strong { color: var(--data); font-size: 26px; }
        .vacancy-panel i { color: var(--data); font-style: normal; }
        .empty-big {
          margin-top: 60px;
          border: 1px solid var(--hair);
          border-radius: 20px;
          background: var(--metal-0);
          padding: 60px 30px;
          text-align: center;
        }
        .empty-big p {
          font-size: 17px;
          color: var(--dim);
          margin: 12px auto 22px;
          max-width: 52ch;
          line-height: 1.55;
        }
        .empty-big h2 { font-size: clamp(26px,4vw,38px); letter-spacing: -.035em; }
        .empty-actions { display: flex; justify-content: center; flex-wrap: wrap; gap: 10px; }
        .empty-big :global(.thr-btn) {
          height: 52px;
          padding: 0 28px;
          text-decoration: none;
        }
        .footer {
          margin-top: 40px;
          padding-top: 24px;
          border-top: 1px solid var(--hair);
          display: flex;
          gap: 24px;
          align-items: center;
        }
        .footer button {
          background: none;
          border: none;
          color: var(--dim);
          font-family: inherit;
          font-size: 13.5px;
          cursor: pointer;
        }
        .footer button:hover {
          color: var(--fg);
        }
        .footer :global(a) {
          color: var(--faint);
          font-size: 13.5px;
          text-decoration: none;
        }
        .footer :global(a):hover {
          color: var(--dim);
        }
        @media (max-width: 520px) {
          .last { align-items: flex-start; }
          .delta .c { padding: 14px 8px; }
          .delta .v { font-size: 20px; }
          .delta .k { font-size: 9.5px; }
          .version { flex-wrap: wrap; }
          .empty-big { margin-top: 34px; padding: 38px 18px; }
          .empty-actions { flex-direction: column; }
          .empty-actions :global(.thr-btn) { width: 100%; justify-content: center; }
        }
      `}</style>
    </div>
  );
}
