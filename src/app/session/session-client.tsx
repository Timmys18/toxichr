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
  const [personaCode, setPersonaCode] = useState<PersonaId | null>(personaId ?? null);
  const hr = ROSTER.find((item) => item.id === personaCode) ?? ROSTER[0];
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
    const watch = window.setTimeout(() => {
      if (!cancelled && !settled) {
        settled = true;
        setError("Разбор идёт дольше обычного — похоже, ИИ сейчас недоступен. Проверь VPN и попробуй ещё раз.");
        setPhase("error");
      }
    }, 75_000);

    async function loadReport(id: string) {
      for (let i = 0; i < 10; i += 1) {
        const response = await fetch(`/api/analyses/${id}`);
        const data = await response.json();
        if (data.report) {
          settled = true;
          window.clearTimeout(watch);
          if (!cancelled) {
            setReport(data.report as AnalysisReport);
            if (data.personaId) setPersonaCode(data.personaId as PersonaId);
            if (data.resumeId) setActiveResumeId(data.resumeId as string);
            setAnalysisId(id);
            setPhase("verdict");
            track("verdict_viewed", { analysisId: id });
            if (resumeId) {
              await updateReferral("completed", { resumeId, analysisId: id }).catch(() => undefined);
            }
          }
          return;
        }
        if (!response.ok && response.status !== 200) {
          throw new Error(data.error ?? "Разбор не найден");
        }
        await new Promise((resolve) => window.setTimeout(resolve, 600));
      }
      if (!cancelled) setError("Разбор не загрузился. Попробуй ещё раз.");
    }

    function onEvent(event: StreamEvent) {
      if (cancelled) return;
      if (event.type === "stage" && event.status === "start") setStage(event.stage);
      else if (event.type === "finding") {
        const id = `f${(FINDING_SEQ += 1)}`;
        setFindings((previous) => [...previous, { id, msg: event.message }]);
      } else if (event.type === "roast") {
        setStage("persona");
        setLiveRoast((previous) => previous + event.delta);
      } else if (event.type === "completed") void loadReport(event.analysisId);
      else if (event.type === "error") {
        settled = true;
        window.clearTimeout(watch);
        setError(event.message);
        setPhase("error");
      }
    }

    async function runStream(): Promise<{ saw: boolean; terminal: boolean }> {
      const response = await fetch("/api/analyses/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeId, personaId }),
      });
      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => null);
        if (data?.error) throw new Error(data.error);
        return { saw: false, terminal: false };
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let saw = false;
      let terminal = false;

      function consume(final = false) {
        const chunks = buffer.replace(/\r\n/g, "\n").split("\n\n");
        buffer = final ? "" : (chunks.pop() ?? "");
        for (const chunk of chunks) {
          const raw = chunk
            .split("\n")
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trimStart())
            .join("\n");
          if (!raw) continue;
          try {
            const event = JSON.parse(raw) as StreamEvent;
            onEvent(event);
            saw = true;
            if (event.type === "completed" || event.type === "error") terminal = true;
          } catch {
            // Повреждённое промежуточное событие не должно ломать весь поток.
          }
        }
      }

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        consume();
      }
      buffer += decoder.decode();
      consume(true);
      return { saw, terminal };
    }

    async function runFallback() {
      const response = await fetch("/api/analyses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeId, personaId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Анализ не удался");
      await loadReport(data.analysisId);
    }

    void (async () => {
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
      } catch (reason) {
        settled = true;
        window.clearTimeout(watch);
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : "Ошибка анализа");
          setPhase("error");
        }
      }
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(watch);
    };
  }, [resumeId, personaId, viewId]);

  const speaking = phase === "analyzing";

  return (
    <div className="session">
      <aside className="presence">
        <div className={`hrcard ${speaking ? "speaking" : ""}`}>
          <span className="ph thr-photo" style={{ backgroundImage: `url('${hr.img}')` }} />
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
      </aside>

      <div className="feed">
        <div className="feed-head thr-mono">Сеанс · живой разбор</div>

        {phase === "analyzing" ? (
          <div className="live">
            {findings.map((finding) => <p key={finding.id} className="finding">{finding.msg}</p>)}
            {liveRoast ? (
              <div className="roast-live">
                {liveRoast.split(/\n{2,}/).map((paragraph, index) =>
                  paragraph.trim() ? <p key={`live-${index}`}>{paragraph.trim()}</p> : null,
                )}
              </div>
            ) : <div className="typing" aria-label="HR думает"><i /><i /><i /></div>}
          </div>
        ) : null}

        {phase === "error" ? (
          <div className="errbox">
            <p>{error}</p>
            <div>
              <button type="button" className="thr-btn thr-btn-tox" onClick={() => window.location.reload()}>Попробовать снова</button>
              <Link href="/" className="thr-btn thr-btn-line">На главную</Link>
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

      <style jsx global>{`
        .session{width:100%;max-width:1320px;margin:0 auto;padding:36px 40px 90px;display:grid;grid-template-columns:300px minmax(0,1fr);gap:52px;align-items:start;box-sizing:border-box;animation:thr-fade .6s var(--ease)}
        .presence{position:sticky;top:96px}.hrcard{position:relative;aspect-ratio:3/3.4;border:1px solid var(--hair2);border-radius:22px;overflow:hidden;background:var(--metal-1)}
        .hrcard.speaking{box-shadow:0 0 0 1px rgba(44,224,139,.5),0 0 60px rgba(44,224,139,.18);animation:thr-breath 2.6s ease-in-out infinite}.ph{position:absolute;inset:0;background-position:center 12%}.shade{position:absolute;inset:0;background:linear-gradient(180deg,transparent 45%,rgba(8,9,10,.92))}
        .info{position:absolute;left:0;right:0;bottom:0;padding:20px}.nm{display:block;font-weight:700;font-size:21px}.rl{display:block;margin-top:2px;color:var(--dim);font-size:12.5px}.st{display:inline-flex;align-items:center;gap:8px;margin-top:12px;color:var(--tox);font-size:10px;letter-spacing:.14em;text-transform:uppercase}.st i{width:6px;height:6px;border-radius:50%;background:var(--tox);animation:thr-pulse 1.4s infinite}
        .meta{margin-top:16px;padding:14px 18px}.meta div{display:flex;justify-content:space-between;gap:12px;padding:6px 0;color:var(--dim);font-size:12.5px}.meta b{color:var(--fg);font-weight:600}.sticky-fix{width:100%;height:50px;margin-top:14px;text-decoration:none;font-size:13.5px}.new-analysis{display:block;margin-top:12px;text-align:center;color:var(--faint);font-size:12.5px;text-decoration:none}.new-analysis:hover{color:var(--fg)}
        .feed{min-height:70vh}.feed-head{padding-bottom:16px;border-bottom:1px solid var(--hair);color:var(--faint);font-size:10.5px;letter-spacing:.18em;text-transform:uppercase}.finding{padding:13px 0;border-bottom:1px solid var(--hair);font-size:15px;line-height:1.55}.roast-live{padding:14px 0}.roast-live p{margin:0 0 15px;font-size:16px;line-height:1.7}.typing{display:inline-flex;gap:5px;padding:18px 0}.typing i{width:6px;height:6px;border-radius:50%;background:var(--dim);animation:thr-tblink 1.1s infinite}.errbox{padding-top:28px}.errbox>p{color:var(--crit);margin-bottom:16px}.errbox>div{display:flex;gap:10px;flex-wrap:wrap}.errbox :global(.thr-btn){min-height:46px;padding:0 22px;text-decoration:none}
        @media(max-width:900px){.session{grid-template-columns:1fr;padding:24px 18px 76px}.presence{position:relative;top:0;display:grid;grid-template-columns:minmax(150px,220px) 1fr;gap:12px}.hrcard{min-height:210px;aspect-ratio:auto}.meta{margin-top:0;display:flex;flex-direction:column;justify-content:center}.sticky-fix,.new-analysis{grid-column:1/-1}}
        .feed{min-width:0}
        @media(max-width:900px){.session{grid-template-columns:1fr;padding:24px 18px 76px;gap:28px}.presence{position:relative;top:0;display:block;max-width:260px}.hrcard{min-height:210px;aspect-ratio:auto}}
        @media(max-width:520px){.session{width:auto;max-width:100%;overflow-x:clip}.presence{width:100%;max-width:none}.feed,.verdict,.conversion-band,.opinion,.secondary-actions{width:100%;max-width:100%;box-sizing:border-box}.hrcard{min-height:190px;aspect-ratio:16/8;border-radius:17px}.ph{background-position:center 22%}.info{padding:14px}.nm{font-size:17px}.rl{display:block;font-size:11.5px}.st{margin-top:8px;font-size:9px;letter-spacing:.06em}}
      `}</style>
    </div>
  );
}

function Verdict({ report, hrName, analysisId, resumeId, personaCode }: {
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
    const timer = window.setTimeout(() => setHasPendingVacancy(Boolean(readPendingVacancy())), 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function doShare() {
    if (!analysisId || sharing) return;
    setSharing(true);
    setShareErr(null);
    try {
      const quoteId = report.shareQuotes[0]?.id ?? "q-0";
      const response = await fetch("/api/public-shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysisId,
          mode: "loud",
          format: "og",
          quoteId,
          metrics: [],
          anonymization: { showName: false, showPhoto: false, showCompanies: false, showRole: true, showLevel: true },
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Не удалось создать ссылку");
      const url = data.url ?? (data.slug ? `${window.location.origin}/toast/${data.slug}` : null);
      setShareUrl(url);
      track("share_created", { analysisId });
    } catch (reason) {
      setShareErr(reason instanceof Error ? reason.message : "Ошибка шаринга");
    } finally {
      setSharing(false);
    }
  }

  async function copyLink() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Ссылка остаётся выделяемой вручную.
    }
  }

  async function nativeShare() {
    if (!shareUrl || !navigator.share) return;
    await navigator.share({ title: "Мой разбор ToxicHR", url: shareUrl }).catch(() => undefined);
  }

  const r = report;
  const problemCount = Math.max(1, r.topProblems.length);

  return (
    <div className="verdict">
      <div className="diag">
        <div className="lab thr-mono">Заключение</div>
        <h2>{r.verdict.title}</h2>
        <p>{r.verdict.comment}</p>
      </div>

      {analysisId ? (
        <Link
          href={`/revenge?analysisId=${analysisId}`}
          className="conversion-band"
          onClick={() => track("result_fix_cta_clicked", { analysisId, source: "mid_report" })}
        >
          <span className="eyebrow thr-mono">Главный следующий шаг</span>
          <b>Исправить резюме · 690 ₽</b>
          <span>{problemCount === 1 ? "Разберём одно слабое место" : `Разберём слабые места: ${problemCount}`}, зададим вопросы по фактам и соберём новую версию.</span>
          <strong>Начать исправление →</strong>
        </Link>
      ) : null}

      {r.hrReview?.deepDive ? (
        <><div className="sec-h"><h3>Разбор от {hrName}</h3></div><div className="review">{paras(r.hrReview.deepDive).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div></>
      ) : null}

      {r.topProblems.length ? (
        <><div className="sec-h"><h3>Где резюме проседает</h3></div><div className="probs">{r.topProblems.map((problem) => (
          <div key={problem.id} className="prob"><div className="pq">«{problem.quote}»</div><div className="pr">{problem.roast}</div>{problem.recommendation ? <div className="pf">{problem.recommendation}</div> : null}</div>
        ))}</div></>
      ) : null}

      {r.hrReview?.hiringTake ? <div className="hiring thr-card"><div className="lab thr-mono">Возьмут или нет</div>{paras(r.hrReview.hiringTake).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div> : null}

      <div className="sec-h next-h"><h3>Ещё можно</h3></div>
      <div className="next-actions">
        <Link
          href={`/vacancy?analysisId=${analysisId ?? ""}`}
          className={`next-card ${hasPendingVacancy ? "pending" : ""}`}
          onClick={() => analysisId && track("result_vacancy_cta_clicked", { analysisId, source: "result" })}
        >
          <span className="nk thr-mono">Под конкретный отклик</span>
          <b>{hasPendingVacancy ? "Сопоставить с вакансией" : "Разобрать вакансию"}</b>
          <span>{hasPendingVacancy ? "Текст на месте — повторно вставлять ничего не нужно." : "Понять, что уже доказано, а где опыта не видно."}</span>
        </Link>
      </div>

      {resumeId ? (
        <div className="opinion">
          <div className="hook-t">Одно резюме. Четыре разных фильтра.</div>
          <div className="hook-s">Проверь, за что зацепится другой HR — файл загружать повторно не нужно.</div>
          <div className="others">
            {ROSTER.filter((person) => person.id !== personaCode).map((person) => (
              <Link
                key={person.id}
                href={`/session?resumeId=${resumeId}&personaId=${person.id}`}
                className="other"
                onClick={() => analysisId && track("second_opinion_opened", { analysisId, persona: person.id })}
              >
                <span className="oph thr-photo" style={{ backgroundImage: `url('${person.img}')` }} />
                <span><b>{person.name}</b><small>{person.role}</small></span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      <div className="secondary-actions">
        <button type="button" className="thr-btn thr-btn-line" onClick={doShare} disabled={sharing || !analysisId}>{sharing ? "Создаём ссылку…" : shareUrl ? "Ссылка готова" : "Поделиться"}</button>
        {status === "authenticated" ? <Link href="/me" className="thr-btn thr-btn-line">В кабинет</Link> : <Link href={`/auth?analysisId=${analysisId ?? ""}&next=/me`} className="thr-btn thr-btn-line">Сохранить</Link>}
        <Link href="/" className="new-analysis">Новый разбор</Link>
        {shareErr ? <p role="alert">{shareErr}</p> : null}
        {shareUrl ? <div className="sharelink"><span>{shareUrl}</span>{typeof navigator !== "undefined" && "share" in navigator ? <button type="button" onClick={() => void nativeShare()}>Поделиться…</button> : null}<button type="button" onClick={copyLink}>{copied ? "Скопировано" : "Копировать"}</button><a href={shareUrl} target="_blank" rel="noreferrer">Открыть</a></div> : null}
      </div>

      <style jsx global>{`
        .verdict{padding-top:8px;animation:thr-fade .7s var(--ease)}.diag{padding:24px 0 8px;max-width:62ch}.lab{color:var(--tox);font-size:11px;letter-spacing:.2em;text-transform:uppercase}.diag h2{margin-top:16px;font-weight:700;font-size:clamp(30px,4vw,52px);line-height:1.04;letter-spacing:-.035em}.diag>p{margin-top:22px;color:var(--dim);font-size:18px;line-height:1.62}
        .sec-h{display:flex;align-items:baseline;gap:16px;margin:56px 0 24px;padding-bottom:14px;border-bottom:1px solid var(--hair)}.num{color:var(--tox);font-size:12px}.sec-h h3{font-size:22px;letter-spacing:-.025em}.facts{display:grid;grid-template-columns:1fr 1fr;gap:1px;background:var(--hair);border:1px solid var(--hair);border-radius:18px;overflow:hidden}.fact{padding:24px 26px;background:var(--metal-0)}.fact .v{font-weight:700;font-size:34px;letter-spacing:-.04em}.fact .v.crit{color:var(--crit)}.fact .k{margin-top:10px;color:var(--dim);font-size:13px;line-height:1.4}
        .conversion-band{display:flex;flex-direction:column;gap:8px;margin-top:26px;max-width:64ch;padding:24px 26px;border:1px solid rgba(44,224,139,.42);border-radius:20px;background:linear-gradient(145deg,rgba(44,224,139,.12),var(--metal-0));color:inherit;text-decoration:none;transition:.2s var(--ease)}.conversion-band:hover{transform:translateY(-2px);box-shadow:0 22px 60px rgba(44,224,139,.1)}.conversion-band .eyebrow{color:var(--tox);font-size:10px;letter-spacing:.13em;text-transform:uppercase}.conversion-band b{margin-top:4px;font-size:23px;letter-spacing:-.025em}.conversion-band>span:nth-child(3){color:var(--dim);font-size:14px;line-height:1.55}.conversion-band strong{margin-top:8px;color:var(--tox);font-size:14px}
        .review p{max-width:64ch;margin-bottom:18px;font-size:16.5px;line-height:1.72}.probs{display:flex;flex-direction:column;gap:14px}.prob{max-width:64ch;padding:20px 24px;border:1px solid var(--hair);border-left:3px solid var(--crit);border-radius:0 14px 14px 0;background:var(--metal-0)}.pq{color:var(--dim);font-size:15px;font-style:italic;line-height:1.5}.pr{margin-top:12px;font-size:16px;line-height:1.6}.pf{margin-top:10px;color:var(--tox);font-size:14px;line-height:1.55}.hiring{max-width:64ch;margin-top:40px;padding:26px 28px}.hiring p{margin-top:10px;font-size:16px;line-height:1.65}.next-h{margin-top:64px}
        .next-actions{display:grid;grid-template-columns:1.15fr .85fr;gap:14px}.next-card{min-height:176px;padding:22px;border:1px solid var(--hair2);border-radius:18px;background:var(--metal-0);color:inherit;text-decoration:none;display:flex;flex-direction:column;transition:.2s var(--ease)}.next-card:hover{transform:translateY(-2px);border-color:var(--tox)}.next-card.primary{border-color:rgba(44,224,139,.38);background:linear-gradient(145deg,rgba(44,224,139,.11),var(--metal-0))}.next-card.pending{border-color:rgba(106,155,255,.4);background:linear-gradient(145deg,rgba(106,155,255,.1),var(--metal-0))}.next-card .nk{color:var(--tox);font-size:10px;letter-spacing:.12em;text-transform:uppercase}.next-card.pending .nk{color:var(--data)}.next-card b{margin-top:20px;font-size:20px}.next-card>span:last-child{margin-top:8px;color:var(--dim);font-size:13.5px;line-height:1.5}
        .share-hook{max-width:64ch;margin-top:16px;padding:18px 20px;border:1px solid var(--hair);border-radius:16px;background:var(--metal-0);display:flex;align-items:center;justify-content:space-between;gap:18px;flex-wrap:wrap}.share-hook>div:first-child{flex:1;min-width:220px}.share-hook b{display:block;font-size:15px}.share-hook span{display:block;margin-top:4px;color:var(--faint);font-size:12.5px;line-height:1.45}.share-hook :global(.thr-btn){min-height:44px;padding:0 20px}.share-hook>p{width:100%;color:var(--crit);font-size:12.5px}.sharelink{width:100%;display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding-top:12px;border-top:1px solid var(--hair)}.sharelink>span{flex:1;min-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font:11px var(--font-mono);color:var(--dim)}.sharelink button,.sharelink a{border:0;background:none;color:var(--tox);font:600 12px var(--font-sans);cursor:pointer;text-decoration:none}
        .opinion{max-width:64ch;margin-top:16px;padding:22px 24px;border:1px solid var(--hair);border-radius:18px;background:var(--metal-0)}.hook-t{font-weight:700;font-size:18px}.hook-s{margin-top:7px;color:var(--dim);font-size:13.5px;line-height:1.5}.others{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:16px}.other{display:flex;align-items:center;gap:10px;padding:10px;border:1px solid var(--hair);border-radius:14px;color:inherit;text-decoration:none}.other:hover{border-color:var(--tox)}.oph{width:44px;height:44px;flex-shrink:0;border-radius:11px;border:1px solid var(--hair2);background-position:center 18%}.other b{display:block;font-size:13.5px}.other small{display:block;margin-top:2px;color:var(--faint);font-size:10.5px}.acts{display:flex;gap:12px;margin-top:28px}.acts :global(.thr-btn){min-height:48px;padding:0 24px;text-decoration:none}
        .conversion-band{width:100%;max-width:720px;padding:28px 30px;box-sizing:border-box;background:linear-gradient(135deg,rgba(44,224,139,.18),rgba(44,224,139,.06))}.conversion-band b{font-size:27px}.next-actions{display:block;max-width:720px}.next-card{min-height:128px;box-sizing:border-box}.opinion{max-width:720px;box-sizing:border-box}.others{grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.other{min-width:0;border-color:var(--hair2);box-sizing:border-box}.other>span:last-child{min-width:0}.other b,.other small{overflow:hidden;text-overflow:ellipsis}.other b{white-space:nowrap}.secondary-actions{max-width:720px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:22px}.secondary-actions .thr-btn{min-height:46px;padding:0 20px;text-decoration:none}.secondary-actions .new-analysis{margin-left:auto;color:var(--dim);font-size:13px;text-decoration:none}.secondary-actions>p{width:100%;color:var(--crit);font-size:12.5px}
        @media(max-width:720px){.next-actions{grid-template-columns:1fr}.others{grid-template-columns:1fr}.conversion-band{padding:22px 20px}.conversion-band b{font-size:22px}.secondary-actions .thr-btn{flex:1}.secondary-actions .new-analysis{width:100%;margin:4px 0 0;text-align:center}.diag h2{font-size:34px}.diag>p{font-size:16px}}
      `}</style>
    </div>
  );
}
