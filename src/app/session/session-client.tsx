"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { PersonaId } from "@/lib/personas";
import type { AnalysisReport } from "@/lib/ai/schemas";
import { track } from "@/lib/analytics";
import { ROSTER } from "@/components/home/hr-roster";

type StreamEvent =
  | { type: "stage"; stage: string; status: "start" | "done" }
  | { type: "finding"; stage: string; message: string }
  | { type: "completed"; analysisId: string }
  | { type: "error"; message: string };

type Phase = "analyzing" | "verdict" | "error";

type Props = { resumeId: string; personaId: PersonaId };

const STAGE_STATUS: Record<string, string> = {
  extract: "читает документ",
  score: "сверяет факты",
  persona: "формулирует заключение",
};

function paras(text: string): string[] {
  return text.split(/\n+/).map((p) => p.trim()).filter(Boolean);
}

export function SessionClient({ resumeId, personaId }: Props) {
  const hr = ROSTER.find((r) => r.id === personaId) ?? ROSTER[0];
  const [phase, setPhase] = useState<Phase>("analyzing");
  const [findings, setFindings] = useState<{ id: string; msg: string }[]>([]);
  const [stage, setStage] = useState<string>("extract");
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let cancelled = false;
    let n = 0;

    async function loadReport(analysisId: string) {
      for (let i = 0; i < 10; i++) {
        const res = await fetch(`/api/analyses/${analysisId}`);
        const data = await res.json();
        if (data.report) {
          if (!cancelled) {
            setReport(data.report as AnalysisReport);
            setPhase("verdict");
            track("verdict_viewed", { analysisId });
          }
          return;
        }
        await new Promise((r) => setTimeout(r, 600));
      }
      if (!cancelled) setError("Разбор не загрузился. Попробуй ещё раз.");
    }

    function onEvent(e: StreamEvent) {
      if (cancelled) return;
      if (e.type === "stage" && e.status === "start") setStage(e.stage);
      else if (e.type === "finding") {
        n += 1;
        setFindings((prev) => [...prev, { id: `f${n}`, msg: e.message }]);
      } else if (e.type === "completed") void loadReport(e.analysisId);
      else if (e.type === "error") {
        setError(e.message);
        setPhase("error");
      }
    }

    async function runStream(): Promise<boolean> {
      const res = await fetch("/api/analyses/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeId, personaId }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        if (data?.error) throw new Error(data.error);
        return false;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let saw = false;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const chunks = buf.split("\n\n");
        buf = chunks.pop() ?? "";
        for (const c of chunks) {
          const line = c.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          try {
            onEvent(JSON.parse(line.slice(6)) as StreamEvent);
            saw = true;
          } catch {
            /* ignore */
          }
        }
      }
      return saw;
    }

    async function runFallback() {
      const res = await fetch("/api/analyses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeId, personaId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Анализ не удался");
      await loadReport(data.analysisId);
    }

    (async () => {
      try {
        const ok = await runStream();
        if (!ok && !cancelled) await runFallback();
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Ошибка анализа");
          setPhase("error");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [resumeId, personaId]);

  const speaking = phase === "analyzing";

  return (
    <div className="session">
      <aside className="presence">
        <div className={`hrcard ${speaking ? "speaking" : ""}`}>
          <span
            className="ph thr-photo"
            style={{ backgroundImage: `url('${hr.img}')` }}
          />
          <span className="shade" />
          <span className="info">
            <span className="nm">{hr.name}</span>
            <span className="rl">{hr.role}</span>
            <span className="st thr-mono">
              <i />
              {phase === "analyzing"
                ? (STAGE_STATUS[stage] ?? "работает")
                : phase === "verdict"
                  ? "заключение готово"
                  : "сеанс прерван"}
            </span>
          </span>
        </div>
        <div className="meta thr-card">
          <div className="row">
            <span>Документ</span>
            <b>резюме принято</b>
          </div>
          <div className="row">
            <span>Формат</span>
            <b>разбор без анестезии</b>
          </div>
        </div>
        {phase === "verdict" ? (
          <Link href="/" className="thr-btn thr-btn-line back">
            Новый разбор
          </Link>
        ) : null}
      </aside>

      <div className="feed">
        <div className="feed-head thr-mono">
          <span>Сеанс · живой разбор</span>
          <span>{hr.name}</span>
        </div>

        {phase === "analyzing" ? (
          <div className="live">
            {findings.map((f) => (
              <p key={f.id} className="finding">
                {f.msg}
              </p>
            ))}
            <div className="typing" aria-label="HR думает">
              <i />
              <i />
              <i />
            </div>
          </div>
        ) : null}

        {phase === "error" ? (
          <div className="errbox">
            <p>{error}</p>
            <Link href="/" className="thr-btn thr-btn-line">
              На главную
            </Link>
          </div>
        ) : null}

        {phase === "verdict" && report ? (
          <Verdict report={report} hrName={hr.name} />
        ) : null}
      </div>

      <style jsx>{`
        .session {
          display: grid;
          grid-template-columns: 330px 1fr;
          gap: 40px;
          max-width: 1160px;
          margin: 0 auto;
          padding: 36px 40px 90px;
          align-items: start;
          animation: thr-fade 0.6s var(--ease);
        }
        @media (max-width: 900px) {
          .session {
            grid-template-columns: 1fr;
            padding: 24px 18px 70px;
          }
        }
        .presence {
          position: sticky;
          top: 96px;
        }
        @media (max-width: 900px) {
          .presence {
            position: relative;
            top: 0;
          }
        }
        .hrcard {
          position: relative;
          border-radius: 22px;
          overflow: hidden;
          border: 1px solid var(--hair2);
          aspect-ratio: 3 / 3.4;
          background: var(--metal-1);
          transition: box-shadow 0.6s;
        }
        .hrcard.speaking {
          box-shadow: 0 0 0 1px rgba(44, 224, 139, 0.5), 0 0 60px rgba(44, 224, 139, 0.18);
          animation: thr-breath 2.6s ease-in-out infinite;
        }
        .ph {
          position: absolute;
          inset: 0;
          background-position: center 12%;
        }
        .shade {
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, transparent 45%, rgba(8, 9, 10, 0.9) 100%);
        }
        .info {
          position: absolute;
          left: 0;
          right: 0;
          bottom: 0;
          padding: 20px;
          display: block;
        }
        .nm {
          display: block;
          font-weight: 700;
          font-size: 21px;
        }
        .rl {
          display: block;
          font-size: 12.5px;
          color: var(--dim);
          margin-top: 2px;
        }
        .st {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          margin-top: 12px;
          font-size: 10px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--tox);
        }
        .st i {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--tox);
          animation: thr-pulse 1.4s infinite;
        }
        .meta {
          margin-top: 16px;
          padding: 16px 18px;
        }
        .row {
          display: flex;
          justify-content: space-between;
          font-size: 12.5px;
          padding: 6px 0;
          color: var(--dim);
        }
        .row b {
          color: var(--fg);
          font-weight: 600;
        }
        .back {
          margin-top: 14px;
          width: 100%;
          height: 46px;
          font-size: 13.5px;
        }
        .feed {
          min-height: 70vh;
        }
        .feed-head {
          font-size: 10.5px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: var(--faint);
          padding-bottom: 16px;
          border-bottom: 1px solid var(--hair);
          display: flex;
          justify-content: space-between;
        }
        .live {
          padding-top: 8px;
        }
        .finding {
          font-size: 15px;
          line-height: 1.55;
          color: var(--fg);
          padding: 13px 0;
          border-bottom: 1px solid var(--hair);
          animation: thr-fade 0.5s var(--ease);
        }
        .typing {
          display: inline-flex;
          gap: 5px;
          padding: 16px 0;
        }
        .typing i {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--dim);
          animation: thr-tblink 1.1s infinite;
        }
        .typing i:nth-child(2) {
          animation-delay: 0.18s;
        }
        .typing i:nth-child(3) {
          animation-delay: 0.36s;
        }
        .errbox {
          padding-top: 26px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          align-items: flex-start;
        }
        .errbox p {
          color: var(--crit);
          font-size: 15px;
        }
        .errbox :global(.thr-btn) {
          height: 46px;
          padding: 0 22px;
          font-size: 14px;
        }
      `}</style>
    </div>
  );
}

function Verdict({ report, hrName }: { report: AnalysisReport; hrName: string }) {
  const r = report;
  const vm = r.viralMetrics;
  const facts = [
    {
      v: `${vm.responsibilitiesCount}→${vm.achievementsCount}`,
      k: "обязанностей против результатов",
      crit: vm.achievementsCount < vm.responsibilitiesCount,
    },
    {
      v: `${r.candidateProfile.claimedLevel}`,
      k: `заявлен · доказан ${r.candidateProfile.inferredLevel}`,
      crit: r.candidateProfile.claimedLevel !== r.candidateProfile.inferredLevel,
    },
    {
      v: `${vm.unprovenClaimsCount}`,
      k: "заявлений без доказательств",
      crit: vm.unprovenClaimsCount > 2,
    },
    {
      v: `${vm.corporateWater}%`,
      k: "корпоративной воды",
      crit: vm.corporateWater > 55,
    },
  ];

  return (
    <div className="verdict">
      <div className="diag">
        <div className="lab thr-mono">Заключение</div>
        <h2>{r.verdict.title}</h2>
        <p className="sum">{r.verdict.comment}</p>
      </div>

      <div className="sec-h">
        <span className="num thr-mono">01</span>
        <h3>Что видно с первого взгляда</h3>
      </div>
      <div className="facts">
        {facts.map((f) => (
          <div key={f.k} className="fact">
            <div className={`v ${f.crit ? "crit" : ""}`}>{f.v}</div>
            <div className="k">{f.k}</div>
          </div>
        ))}
      </div>

      {r.hrReview?.deepDive ? (
        <>
          <div className="sec-h">
            <span className="num thr-mono">02</span>
            <h3>Разбор от {hrName}</h3>
          </div>
          <div className="review">
            {paras(r.hrReview.deepDive).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </>
      ) : null}

      {r.topProblems.length ? (
        <>
          <div className="sec-h">
            <span className="num thr-mono">03</span>
            <h3>По пунктам</h3>
          </div>
          <div className="probs">
            {r.topProblems.map((p) => (
              <div key={p.id} className="prob">
                <div className="pq">«{p.quote}»</div>
                <div className="pr">{p.roast}</div>
                {p.recommendation ? <div className="pf">{p.recommendation}</div> : null}
              </div>
            ))}
          </div>
        </>
      ) : null}

      {r.hrReview?.hiringTake ? (
        <div className="hiring thr-card">
          <div className="lab thr-mono">Возьмут или нет</div>
          {paras(r.hrReview.hiringTake).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      ) : null}

      <div className="acts">
        <button type="button" className="thr-btn thr-btn-tox">
          Исправить и переспросить
        </button>
        <button type="button" className="thr-btn thr-btn-line">
          Поделиться
        </button>
      </div>

      <style jsx>{`
        .verdict {
          padding-top: 8px;
          animation: thr-fade 0.7s var(--ease);
        }
        .diag {
          padding: 24px 0 8px;
          max-width: 62ch;
        }
        .lab {
          font-size: 11px;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: var(--tox);
        }
        .diag h2 {
          font-weight: 700;
          font-size: clamp(30px, 4vw, 52px);
          line-height: 1.04;
          letter-spacing: -0.035em;
          margin-top: 16px;
        }
        .sum {
          margin-top: 22px;
          font-size: 18px;
          line-height: 1.62;
          color: var(--dim);
        }
        .sec-h {
          display: flex;
          align-items: baseline;
          gap: 16px;
          margin: 56px 0 24px;
          padding-bottom: 14px;
          border-bottom: 1px solid var(--hair);
        }
        .num {
          font-size: 12px;
          color: var(--tox);
          letter-spacing: 0.1em;
        }
        .sec-h h3 {
          font-weight: 700;
          font-size: 22px;
          letter-spacing: -0.025em;
        }
        .facts {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1px;
          background: var(--hair);
          border: 1px solid var(--hair);
          border-radius: 18px;
          overflow: hidden;
        }
        @media (max-width: 640px) {
          .facts {
            grid-template-columns: 1fr;
          }
        }
        .fact {
          background: var(--metal-0);
          padding: 24px 26px;
        }
        .fact .v {
          font-weight: 700;
          font-size: 34px;
          letter-spacing: -0.04em;
          line-height: 1;
          font-variant-numeric: tabular-nums;
        }
        .fact .v.crit {
          color: var(--crit);
        }
        .fact .k {
          font-size: 13px;
          color: var(--dim);
          margin-top: 10px;
          line-height: 1.4;
        }
        .review p {
          font-size: 16.5px;
          line-height: 1.72;
          color: var(--fg);
          max-width: 64ch;
          margin-bottom: 18px;
        }
        .probs {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .prob {
          border: 1px solid var(--hair);
          border-left: 3px solid var(--crit);
          border-radius: 0 14px 14px 0;
          background: var(--metal-0);
          padding: 20px 24px;
          max-width: 64ch;
        }
        .pq {
          font-size: 15px;
          font-style: italic;
          color: var(--dim);
          line-height: 1.5;
        }
        .pr {
          margin-top: 12px;
          font-size: 16px;
          line-height: 1.6;
          color: var(--fg);
        }
        .pf {
          margin-top: 10px;
          font-size: 14px;
          line-height: 1.55;
          color: var(--tox);
        }
        .hiring {
          margin-top: 40px;
          padding: 26px 28px;
          max-width: 64ch;
        }
        .hiring .lab {
          margin-bottom: 12px;
        }
        .hiring p {
          font-size: 16px;
          line-height: 1.65;
          color: var(--fg);
          margin-bottom: 10px;
        }
        .acts {
          margin-top: 44px;
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
          padding-top: 28px;
          border-top: 1px solid var(--hair);
        }
        .acts :global(.thr-btn) {
          height: 52px;
          padding: 0 28px;
          font-size: 14.5px;
        }
      `}</style>
    </div>
  );
}
