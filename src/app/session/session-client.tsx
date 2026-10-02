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
import { ANALYSIS_RETRY_MESSAGE, requestErrorMessage } from "@/lib/user-facing-errors";
import { CollapsibleSection, EditorialSection, EmptyState, EvidenceItem, PageContainer, PrimaryAction, SecondaryAction, SectionLabel, SurfacePanel, VerdictBlock } from "@/components/ui/system";

type StreamEvent =
  | { type: "stage"; stage: string; status: "start" | "done" }
  | { type: "finding"; stage: string; message: string }
  | { type: "roast"; delta: string }
  | { type: "completed"; analysisId: string }
  | { type: "error"; message: string; purchaseAnalysisId?: string };

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
  const [resultMode, setResultMode] = useState<"live" | "test">("live");
  const [analysisId, setAnalysisId] = useState<string | null>(viewId ?? null);
  const [activeResumeId, setActiveResumeId] = useState<string | null>(resumeId ?? null);
  const [purchaseAnalysisId, setPurchaseAnalysisId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let settled = false;
    const watch = window.setTimeout(() => {
      if (!cancelled && !settled) {
        settled = true;
        setError(ANALYSIS_RETRY_MESSAGE);
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
            setResultMode(data.resultMode === "test" ? "test" : "live");
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
        setPurchaseAnalysisId(event.purchaseAnalysisId ?? null);
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
          setError(requestErrorMessage(reason, ANALYSIS_RETRY_MESSAGE));
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
    <PageContainer className="session">
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
        <SectionLabel className="feed-head">Сеанс · живой разбор</SectionLabel>

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
          <EmptyState className="errbox" action={<div>{purchaseAnalysisId ? <PrimaryAction href={`/revenge?analysisId=${encodeURIComponent(purchaseAnalysisId)}`}>Открыть пакет ToxicHR · 199 ₽</PrimaryAction> : null}<PrimaryAction type="button" onClick={() => window.location.reload()}>Попробовать снова</PrimaryAction><SecondaryAction href="/">На главную</SecondaryAction></div>}>{error}</EmptyState>
        ) : null}

        {phase === "verdict" && report ? (
          <Verdict
            report={report}
            hrName={hr.name}
            analysisId={analysisId}
            resumeId={activeResumeId}
            personaCode={personaCode}
            resultMode={resultMode}
          />
        ) : null}
      </div>
    </PageContainer>
  );
}

function Verdict({ report, hrName, analysisId, resumeId, personaCode, resultMode }: {
  report: AnalysisReport;
  hrName: string;
  analysisId: string | null;
  resumeId: string | null;
  personaCode: PersonaId | null;
  resultMode: "live" | "test";
}) {
  const { status } = useSession();
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shareErr, setShareErr] = useState<string | null>(null);
  const [hasPackage, setHasPackage] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    if (analysisId) void fetch(`/api/payments/access?analysisId=${encodeURIComponent(analysisId)}`).then((r) => r.ok ? r.json() : null).then((data) => { if (!cancelled && data) setHasPackage(Boolean(data.hasPackage)); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [analysisId]);
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
          metrics: ["total", "evidence"],
          anonymization: { showName: false, showPhoto: false, showCompanies: false, showRole: true, showLevel: true },
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Не удалось создать ссылку");
      const url = data.url ?? (data.slug ? `${window.location.origin}/toast/${data.slug}` : null);
      setShareUrl(url);
      track("share_created", { analysisId });
    } catch (reason) {
      setShareErr(requestErrorMessage(reason, "Не удалось создать ссылку. Попробуй ещё раз — разбор сохранён."));
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
  const featuredProblems = r.topProblems.filter((problem, index) => index < 3 || problem.severity === "critical");
  const additionalProblems = r.topProblems.filter((problem) => !featuredProblems.includes(problem));

  return (
    <div className="verdict">
      {resultMode === "test" ? <div className="ds-result-mode" role="status"><b>Тестовый ответ</b><span>AI отключён. Это демонстрация интерфейса, а не полноценная профессиональная оценка резюме.</span></div> : null}
      <VerdictBlock className="diag" label="Заключение" title={r.verdict.title} summary={r.verdict.comment} />

      {analysisId ? (
        <Link
          href={`/revenge?analysisId=${analysisId}`}
          className="conversion-band"
          onClick={() => track("result_fix_cta_clicked", { analysisId, source: "mid_report" })}
        >
          <span className="eyebrow thr-mono">Главный следующий шаг</span>
          <b>{hasPackage === true ? "Продолжить работу с резюме · пакет открыт" : hasPackage === false ? "Исправить резюме · пакет ToxicHR 199 ₽" : "Исправить резюме"}</b>
          <span>{problemCount === 1 ? "Разберём одно слабое место" : `Разберём слабые места: ${problemCount}`}, зададим вопросы по фактам и соберём новую версию.</span>
          <strong>Начать исправление →</strong>
        </Link>
      ) : null}

      {featuredProblems.length ? (
        <EditorialSection title={featuredProblems.length === 1 ? "Главное замечание" : "Главные замечания"}><div className="probs">{featuredProblems.map((problem) => (
          <EvidenceItem key={problem.id} title={problem.roast} description={problem.recommendation ?? "Нужен подтверждённый факт вместо общего заявления."} quote={`«${problem.quote}»`} />
        ))}</div></EditorialSection>
      ) : null}

      {additionalProblems.length ? (
        <CollapsibleSection title={`Остальные замечания · ${additionalProblems.length}`}>
          <div className="probs">{additionalProblems.map((problem) => (
            <EvidenceItem key={problem.id} title={problem.roast} description={problem.recommendation ?? "Нужен подтверждённый факт вместо общего заявления."} quote={`«${problem.quote}»`} />
          ))}</div>
        </CollapsibleSection>
      ) : null}

      {r.hrReview?.deepDive ? (
        <CollapsibleSection title={`Полный разбор от ${hrName}`}>{paras(r.hrReview.deepDive).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</CollapsibleSection>
      ) : null}

      {r.hrReview?.hiringTake ? <SurfacePanel className="hiring" label="Решение HR">{paras(r.hrReview.hiringTake).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</SurfacePanel> : null}

      <div className="sec-h next-h"><h3>Ещё можно</h3></div>
      <div className="next-actions">
        <Link
          href={`/vacancy?analysisId=${analysisId ?? ""}`}
          className={`next-card ${hasPendingVacancy ? "pending" : ""}`}
          onClick={() => analysisId && track("result_vacancy_cta_clicked", { analysisId, source: "result" })}
        >
          <span className="nk thr-mono">Под конкретный отклик</span>
          <b>{hasPendingVacancy ? "Сопоставить с вакансией" : "Разобрать вакансию"}</b>
          <span>{hasPendingVacancy ? "Текст на месте — повторно вставлять ничего не нужно." : "Узнать, каким требованиям соответствует резюме и чего в нём не хватает."}</span>
        </Link>
      </div>

      {resumeId ? (
        <div className="opinion">
          <div className="hook-t">Одно резюме. Четыре разных фильтра.</div>
          <div className="hook-s">Один дополнительный взгляд бесплатный. Остальные голоса входят в пакет ToxicHR — файл загружать повторно не нужно.</div>
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
        <SecondaryAction type="button" onClick={doShare} disabled={sharing || !analysisId}>{sharing ? "Создаём ссылку…" : shareUrl ? "Ссылка готова" : "Поделиться"}</SecondaryAction>
        {status === "authenticated" ? <SecondaryAction href="/me">В кабинет</SecondaryAction> : <SecondaryAction href={`/auth?analysisId=${analysisId ?? ""}&next=/me`}>Сохранить</SecondaryAction>}
        <Link href="/" className="new-analysis">Новый разбор</Link>
        {shareErr ? <p role="alert">{shareErr}</p> : null}
        {shareUrl ? <div className="sharelink"><span>{shareUrl}</span>{typeof navigator !== "undefined" && "share" in navigator ? <button type="button" onClick={() => void nativeShare()}>Поделиться…</button> : null}<button type="button" onClick={copyLink}>{copied ? "Скопировано" : "Копировать"}</button><a href={shareUrl} target="_blank" rel="noreferrer">Открыть</a></div> : null}
      </div>
    </div>
  );
}
