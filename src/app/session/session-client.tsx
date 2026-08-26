"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import type { PersonaId } from "@/lib/personas";
import type { AnalysisReport } from "@/lib/ai/schemas";
import { track } from "@/lib/analytics";
import { ROSTER } from "@/components/home/hr-roster";
import { updateReferral } from "@/lib/referral-client";
import { readPendingVacancy } from "@/lib/pending-vacancy";

type StreamEvent =
  | { type: "stage"; stage: string; status: "start" | "done" }
  | { type: "finding"; stage: string; message: string }
  | { type: "roast"; delta: string }
  | { type: "completed"; analysisId: string }
  | { type: "error"; message: string };

type Phase = "analyzing" | "verdict" | "error";

type Props = { resumeId?: string; personaId?: PersonaId; viewId?: string };

// Глобальный счётчик id находок — гарантирует уникальные React-ключи даже
// при повторном монтировании эффекта (Strict Mode / ремоунт).
let FINDING_SEQ = 0;

const STAGE_STATUS: Record<string, string> = {
  extract: "читает документ",
  score: "сверяет факты",
  persona: "формулирует заключение",
};

function paras(text: string): string[] {
  return text.split(/\n+/).map((p) => p.trim()).filter(Boolean);
}

export function SessionClient({ resumeId, personaId, viewId }: Props) {
  const [personaCode, setPersonaCode] = useState<PersonaId | null>(
    personaId ?? null,
  );
  const hr = ROSTER.find((r) => r.id === personaCode) ?? ROSTER[0];
  const [phase, setPhase] = useState<Phase>("analyzing");
  const [findings, setFindings] = useState<{ id: string; msg: string }[]>([]);
  const [liveRoast, setLiveRoast] = useState("");
  const [stage, setStage] = useState<string>(viewId ? "persona" : "extract");
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [analysisId, setAnalysisId] = useState<string | null>(viewId ?? null);
  const [activeResumeId, setActiveResumeId] = useState<string | null>(resumeId ?? null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    let settled = false;
    // Сторож: если за 75с ничего не завершилось — не крутим спиннер вечно,
    // показываем понятную ошибку с ретраем.
    const watch = setTimeout(() => {
      if (!cancelled && !settled) {
        settled = true;
        setError(
          "Разбор идёт дольше обычного — похоже, ИИ сейчас недоступен. Проверь VPN и попробуй ещё раз.",
        );
        setPhase("error");
      }
    }, 75000);

    async function loadReport(id: string) {
      for (let i = 0; i < 10; i++) {
        const res = await fetch(`/api/analyses/${id}`);
        const data = await res.json();
        if (data.report) {
          settled = true;
          clearTimeout(watch);
          if (!cancelled) {
            setReport(data.report as AnalysisReport);
            if (data.personaId) setPersonaCode(data.personaId as PersonaId);
            if (data.resumeId) setActiveResumeId(data.resumeId as string);
            setAnalysisId(id);
            setPhase("verdict");
            track("verdict_viewed", { analysisId: id });
            if (resumeId) {
              await updateReferral("completed", {
                resumeId,
                analysisId: id,
              }).catch(() => undefined);
            }
          }
          return;
        }
        if (!res.ok && res.status !== 200) {
          throw new Error(data.error ?? "Разбор не найден");
        }
        await new Promise((r) => setTimeout(r, 600));
      }
      if (!cancelled) setError("Разбор не загрузился. Попробуй ещё раз.");
    }

    function onEvent(e: StreamEvent) {
      if (cancelled) return;
      if (e.type === "stage" && e.status === "start") setStage(e.stage);
      else if (e.type === "finding") {
        const fid = `f${(FINDING_SEQ += 1)}`;
        setFindings((prev) => [...prev, { id: fid, msg: e.message }]);
      } else if (e.type === "roast") {
        setStage("persona");
        setLiveRoast((prev) => prev + e.delta);
      } else if (e.type === "completed") void loadReport(e.analysisId);
      else if (e.type === "error") {
        settled = true;
        clearTimeout(watch);
        setError(e.message);
        setPhase("error");
      }
    }

    async function runStream(): Promise<{ saw: boolean; terminal: boolean }> {
      const res = await fetch("/api/analyses/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeId, personaId }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        if (data?.error) throw new Error(data.error);
        return { saw: false, terminal: false };
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let saw = false;
      let terminal = false;

      function consume(final = false) {
        const normalized = buf.replace(/\r\n/g, "\n");
        const chunks = normalized.split("\n\n");
        buf = final ? "" : (chunks.pop() ?? "");
        if (final) {
          const tail = chunks.pop();
          if (tail?.trim()) chunks.push(tail);
        }
        for (const chunk of chunks) {
          const data = chunk
            .split("\n")
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trimStart())
            .join("\n");
          if (!data) continue;
          try {
            const event = JSON.parse(data) as StreamEvent;
            onEvent(event);
            saw = true;
            if (event.type === "completed" || event.type === "error") {
              terminal = true;
            }
          } catch {
            /* повреждённое промежуточное событие не ломает весь поток */
          }
        }
      }

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        consume();
      }
      buf += dec.decode();
      consume(true);
      return { saw, terminal };
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
        if (viewId) {
          await loadReport(viewId);
          return;
        }
        const first = await runStream();
        if (!first.terminal && !cancelled) {
          const retry = await runStream();
          if (!retry.terminal && !cancelled) {
            if (!first.saw && !retry.saw) await runFallback();
            else throw new Error("Связь прервалась на финише. Обнови страницу — готовый разбор уже сохранён.");
          }
        }
      } catch (e) {
        settled = true;
        clearTimeout(watch);
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Ошибка анализа");
          setPhase("error");
        }
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(watch);
    };
  }, [resumeId, personaId, viewId]);

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
            <b>жёстко и по делу</b>
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
        </div>

        {phase === "analyzing" ? (
          <div className="live">
            {findings.map((f) => (
              <p key={f.id} className="finding">
                {f.msg}
              </p>
            ))}
            {liveRoast ? (
              <div className="roast-live">
                {liveRoast.split(/\n{2,}/).map((para, i) =>
                  para.trim() ? (
                    <p key={`rl${i}`}>
                      {para.trim()}
                      {i === liveRoast.split(/\n{2,}/).length - 1 ? (
                        <span className="caret" />
                      ) : null}
                    </p>
                  ) : null,
                )}
              </div>
            ) : (
              <div className="typing" aria-label="HR думает">
                <i />
                <i />
                <i />
              </div>
            )}
          </div>
        ) : null}

        {phase === "error" ? (
          <div className="errbox">
            <p>{error}</p>
            <div className="errbtns">
              <button
                type="button"
                className="thr-btn thr-btn-tox"
                onClick={() => window.location.reload()}
              >
                Попробовать снова
              </button>
              <Link href="/" className="thr-btn thr-btn-line">
                На главную
              </Link>
            </div>
          </div>
        ) : null}

        {phase === "verdict" && report ? (
          <Verdict
            report={report}
            hrName={hr.name}
            analysisId={analysisId}
            resumeId={activeResumeId}
            personaCode={personaCode}
          />
        ) : null}
      </div>

      <style jsx>{`
        .session {
          width: 100%;
          display: grid;
          grid-template-columns: 330px 1fr;
          gap: 40px;
          max-width: 1160px;
          box-sizing: border-box;
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
            display: grid;
            grid-template-columns: minmax(150px, 220px) 1fr;
            gap: 12px;
            align-items: stretch;
          }
          .presence .hrcard { aspect-ratio: auto; min-height: 210px; }
          .presence .meta { margin-top: 0; display: flex; flex-direction: column; justify-content: center; }
          .presence .back { grid-column: 1 / -1; margin-top: 0; }
        }
        @media (max-width: 520px) {
          .presence { grid-template-columns: 116px 1fr; }
          .presence .hrcard { min-height: 160px; border-radius: 17px; }
          .presence .info { padding: 12px; }
          .presence .nm { font-size: 16px; }
          .presence .rl { display: none; }
          .presence .st { margin-top: 8px; font-size: 8px; letter-spacing: .08em; }
          .presence .meta { padding: 12px 14px; }
          .presence .row { align-items: flex-start; flex-direction: column; gap: 3px; font-size: 11.5px; }
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
        .roast-live {
          padding: 14px 0 8px;
          animation: thr-fade 0.4s var(--ease);
        }
        .roast-live p {
          font-size: 16px;
          line-height: 1.7;
          color: var(--fg);
          margin: 0 0 15px;
        }
        .caret {
          display: inline-block;
          width: 8px;
          height: 1.05em;
          margin-left: 2px;
          vertical-align: text-bottom;
          background: var(--tox);
          animation: thr-tblink 1s steps(2) infinite;
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
        .errbtns {
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
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

function Verdict({
  report,
  hrName,
  analysisId,
  resumeId,
  personaCode,
}: {
  report: AnalysisReport;
  hrName: string;
  analysisId: string | null;
  resumeId: string | null;
  personaCode: PersonaId | null;
}) {
  const { status } = useSession();
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shareErr, setShareErr] = useState<string | null>(null);
  const [hasPendingVacancy, setHasPendingVacancy] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(
      () => setHasPendingVacancy(Boolean(readPendingVacancy())),
      0,
    );
    return () => window.clearTimeout(timer);
  }, []);

  async function doShare() {
    if (!analysisId || sharing) return;
    setSharing(true);
    setShareErr(null);
    try {
      const quoteId = report.shareQuotes[0]?.id ?? "q-0";
      const res = await fetch("/api/public-shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysisId,
          mode: "loud",
          format: "og",
          quoteId,
          metrics: ["total", "evidence", "corporateWater"],
          anonymization: {
            showName: false,
            showPhoto: false,
            showCompanies: false,
            showRole: true,
            showLevel: true,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Не удалось создать ссылку");
      const url =
        data.url ??
        (data.slug ? `${window.location.origin}/toast/${data.slug}` : null);
      setShareUrl(url);
      track("share_created", { analysisId });
    } catch (e) {
      setShareErr(e instanceof Error ? e.message : "Ошибка шаринга");
    } finally {
      setSharing(false);
    }
  }

  async function copyLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* ignore */
    }
  }

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

      <div className="sec-h next-h">
        <span className="num thr-mono">04</span>
        <h3>Что дальше</h3>
      </div>

      {/* Крючок 1 — поделиться на эмоциональном пике */}
      <div className="hook share-hook">
        <div className="hook-t">Разбор слишком точный, чтобы держать в себе.</div>
        <div className="hook-s">
          Публичная карточка — без имени и компаний, только вердикт и метрики.
        </div>
        <button
          type="button"
          className="thr-btn thr-btn-tox hook-btn"
          onClick={doShare}
          disabled={sharing || !analysisId}
        >
          {sharing
            ? "Создаём ссылку…"
            : shareUrl
              ? "Ссылка готова ↓"
              : "Поделиться результатом"}
        </button>
        {shareErr ? (
          <p className="shareerr" role="alert">
            {shareErr}
          </p>
        ) : null}
        {shareUrl ? (
          <div className="sharelink">
            <span className="su">{shareUrl}</span>
            <button type="button" onClick={copyLink}>
              {copied ? "Скопировано" : "Копировать"}
            </button>
            <a href={shareUrl} target="_blank" rel="noreferrer">
              Открыть
            </a>
          </div>
        ) : null}
      </div>

      <div className="next-actions">
        <Link
          href={`/revenge?analysisId=${analysisId ?? ""}`}
          className="next-card primary"
          onClick={() =>
            analysisId && track("resume_fix_opened", { analysisId, source: "result" })
          }
        >
          <span className="nk thr-mono">Главное продолжение</span>
          <b>Исправить это резюме</b>
          <span>Ответить по слабым строкам и получить новую версию.</span>
        </Link>
        <Link
          href={`/vacancy?analysisId=${analysisId ?? ""}`}
          className={`next-card ${hasPendingVacancy ? "pending" : ""}`}
          onClick={() =>
            analysisId &&
            track("vacancy_review_opened", { analysisId, source: "result" })
          }
        >
          <span className="nk thr-mono">
            {hasPendingVacancy ? "Вакансия уже сохранена" : "Под конкретный отклик"}
          </span>
          <b>{hasPendingVacancy ? "Сопоставить сейчас" : "Разобрать вакансию"}</b>
          <span>{hasPendingVacancy ? "Текст на месте — повторно вставлять ничего не нужно." : "Понять, что уже доказано, а где опыта не видно."}</span>
        </Link>
      </div>

      {resumeId ? (
        <div className="opinion">
          <div className="hook-t">Одно резюме. Четыре разных фильтра.</div>
          <div className="hook-s">
            Проверь, за что зацепится другой HR — файл загружать повторно не нужно.
          </div>
          <div className="others">
            {ROSTER.filter((person) => person.id !== personaCode).map((person) => (
              <Link
                key={person.id}
                href={`/session?resumeId=${resumeId}&personaId=${person.id}`}
                className="other"
              >
                <span
                  className="oph thr-photo"
                  style={{ backgroundImage: `url('${person.img}')` }}
                />
                <span className="oinfo">
                  <span className="on">{person.name}</span>
                  <span className="or">{person.role}</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      <div className="acts">
        {status === "authenticated" ? (
          <Link href="/me" className="thr-btn thr-btn-line">
            В кабинет
          </Link>
        ) : (
          <Link
            href={`/auth?analysisId=${analysisId ?? ""}&next=/me`}
            className="thr-btn thr-btn-line"
          >
            Сохранить разбор
          </Link>
        )}
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
        .next-h {
          margin-top: 64px;
        }
        .hook {
          margin-top: 16px;
          border: 1px solid var(--hair2);
          border-radius: 18px;
          background: var(--metal-0);
          padding: 24px 26px;
          max-width: 64ch;
        }
        .share-hook {
          border-color: rgba(44, 224, 139, 0.35);
          background: linear-gradient(180deg, rgba(44, 224, 139, 0.05), var(--metal-0));
        }
        .hook-t {
          font-weight: 700;
          font-size: 18px;
          letter-spacing: -0.02em;
        }
        .hook-s {
          margin-top: 8px;
          font-size: 14px;
          color: var(--dim);
          line-height: 1.5;
        }
        .hook-btn {
          margin-top: 18px;
          height: 52px;
          padding: 0 28px;
          font-size: 15px;
        }
        .others {
          margin-top: 16px;
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
        }
        @media (max-width: 620px) {
          .others {
            grid-template-columns: 1fr;
          }
        }
        .other {
          display: flex;
          align-items: center;
          gap: 12px;
          border: 1px solid var(--hair);
          border-radius: 14px;
          padding: 10px;
          text-decoration: none;
          color: inherit;
          transition: 0.2s;
        }
        .other:hover {
          border-color: var(--tox);
          background: var(--tox-dim);
        }
        .oph {
          width: 44px;
          height: 44px;
          border-radius: 11px;
          flex-shrink: 0;
          border: 1px solid var(--hair2);
          background-position: center 18%;
        }
        .oinfo {
          min-width: 0;
        }
        .on {
          display: block;
          font-weight: 600;
          font-size: 14px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .or {
          display: block;
          font-size: 11.5px;
          color: var(--faint);
          margin-top: 1px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .next-actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
          margin-top: 24px;
        }
        @media (max-width: 720px) {
          .next-actions {
            grid-template-columns: 1fr;
          }
        }
        .next-card {
          min-height: 172px;
          padding: 22px;
          border: 1px solid var(--hair2);
          border-radius: 18px;
          background: var(--metal-0);
          color: inherit;
          text-decoration: none;
          display: flex;
          flex-direction: column;
          transition: 0.2s var(--ease);
        }
        .next-card:hover {
          border-color: var(--tox);
          transform: translateY(-2px);
        }
        .next-card.primary {
          background: linear-gradient(145deg, var(--tox-dim), var(--metal-0));
        }
        .next-card.pending {
          border-color: rgba(106,155,255,.4);
          background: linear-gradient(145deg, rgba(106,155,255,.1), var(--metal-0));
        }
        .next-card.pending .nk { color: var(--data); }
        .next-card .nk {
          color: var(--tox);
          font-size: 9.5px;
          letter-spacing: 0.16em;
          text-transform: uppercase;
        }
        .next-card b {
          margin-top: 20px;
          font-size: 20px;
          letter-spacing: -0.02em;
        }
        .next-card > span:last-child {
          margin-top: 8px;
          color: var(--dim);
          font-size: 13.5px;
          line-height: 1.5;
        }
        .opinion {
          margin-top: 16px;
          padding: 22px 24px;
          border: 1px solid var(--hair);
          border-radius: 18px;
          background: var(--metal-0);
          max-width: 64ch;
        }
        .acts {
          margin-top: 28px;
          display: flex;
          gap: 12px;
          flex-wrap: wrap;
        }
        .acts :global(.thr-btn) {
          height: 50px;
          padding: 0 26px;
          font-size: 14px;
          text-decoration: none;
        }
        .shareerr {
          margin-top: 14px;
          color: var(--crit);
          font-size: 13.5px;
        }
        .sharelink {
          margin-top: 16px;
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
          border: 1px solid var(--hair2);
          border-radius: 14px;
          background: var(--metal-0);
          padding: 12px 14px;
          max-width: 64ch;
        }
        .sharelink .su {
          font-family: var(--font-mono);
          font-size: 12.5px;
          color: var(--dim);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          flex: 1;
          min-width: 140px;
        }
        .sharelink button,
        .sharelink a {
          font-size: 12.5px;
          font-weight: 600;
          color: var(--tox);
          background: none;
          border: none;
          cursor: pointer;
          text-decoration: none;
          font-family: inherit;
          flex-shrink: 0;
        }
      `}</style>
    </div>
  );
}
