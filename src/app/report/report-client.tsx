"use client";

import { useCallback, useEffect, useState } from "react";
import { motion } from "motion/react";
import type { AnalysisReport } from "@/lib/ai/schemas";
import { PERSONAS, SCORE_LABEL, type PersonaId } from "@/lib/personas";
import { PersonaSeal } from "@/components/personas/persona-seal";
import { Button } from "@/components/ui/button";
import { FeedbackButtons } from "@/components/report/feedback-buttons";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";

type Props = {
  analysisId: string;
  wantFull?: boolean;
  paidReturn?: boolean;
};

const HORIZON_LABEL: Record<string, string> = {
  "10m": "10 минут",
  "30m": "30 минут",
  recall: "Вспомнить",
};

function paras(text: string) {
  return text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export function ReportClient({
  analysisId,
  wantFull = false,
  paidReturn = false,
}: Props) {
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [personaId, setPersonaId] = useState<PersonaId | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [confirming, setConfirming] = useState(paidReturn);
  const [error, setError] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/analyses/${analysisId}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Не удалось загрузить разбор");
    if (!data.report) throw new Error("Разбор ещё не готов");
    setReport(data.report);
    setPersonaId(
      (data.personaId as PersonaId) ??
        (data.report.recommendedPersonaId as PersonaId) ??
        null,
    );
    setUnlocked(Boolean(data.unlocked));
    setLoadError(null);
    return Boolean(data.unlocked);
  }, [analysisId]);

  useEffect(() => {
    track("report_opened", { analysisId });
    void load().catch((e) => {
      setLoadError(e instanceof Error ? e.message : "Ошибка загрузки");
    });
  }, [analysisId, load]);

  useEffect(() => {
    if (!paidReturn) return;
    let cancelled = false;
    async function confirmAndPoll() {
      setConfirming(true);
      try {
        await fetch("/api/payments/confirm", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ analysisId }),
        });
        for (let i = 0; i < 8; i++) {
          if (cancelled) return;
          if (await load()) break;
          await new Promise((r) => setTimeout(r, 700));
        }
      } catch {
        if (!cancelled) setLoadError("Не удалось подтвердить оплату");
      } finally {
        if (!cancelled) {
          setConfirming(false);
          window.history.replaceState(
            null,
            "",
            `/report?analysisId=${analysisId}&full=1`,
          );
        }
      }
    }
    void confirmAndPoll();
    return () => {
      cancelled = true;
    };
  }, [paidReturn, analysisId, load]);

  async function unlock() {
    setCheckoutLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/payments/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysisId, productCode: "full_report" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Оплата не удалась");
      if ((data.mode === "mock" || data.mode === "open") && data.redirectUrl) {
        await load();
        window.history.replaceState(
          null,
          "",
          data.redirectUrl.replace(/^https?:\/\/[^/]+/, ""),
        );
        return;
      }
      if (data.checkoutUrl) window.location.href = data.checkoutUrl;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ошибка оплаты");
    } finally {
      setCheckoutLoading(false);
    }
  }

  if (loadError) {
    return (
      <div className="space-y-4 border border-roast/30 bg-surface p-6">
        <p className="font-display text-2xl text-ink">Разбор не загрузился</p>
        <p className="font-mono text-sm text-roast">{loadError}</p>
        <Button href="/start">Новая прожарка</Button>
      </div>
    );
  }

  if (!report) {
    return (
      <p className="font-mono text-sm text-muted animate-pulse">
        {confirming ? "Подтверждаем…" : "Пишем разбор HR…"}
      </p>
    );
  }

  const persona =
    PERSONAS.find((p) => p.id === personaId) ??
    PERSONAS.find((p) => p.id === report.recommendedPersonaId) ??
    PERSONAS[1];
  const review = report.hrReview ?? {
    firstImpression: report.verdict.comment,
    deepDive: report.topProblems.map((p) => `${p.title}. ${p.roast}`).join("\n\n"),
    hiringTake: `Оценка ${report.score.total}/100.`,
    fixPriority: "Запусти новую прожарку.",
  };
  const plan = report.improvementPlan ?? [];

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-10"
    >
      {/* Letter header */}
      <header className="border-b border-ink/10 pb-8">
        <div className="flex items-start gap-4">
          <PersonaSeal personaId={persona.id} size="lg" />
          <div className="min-w-0 flex-1">
            <p
              className={cn(
                "inline-flex px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.16em]",
                persona.accent.chip,
              )}
            >
              {persona.name} · разбор резюме
            </p>
            <p className="mt-2 text-sm text-muted">
              {persona.title} · {persona.tone}
            </p>
            <h1 className="mt-5 font-display text-3xl leading-tight tracking-tight text-ink sm:text-4xl">
              {report.verdict.title}
            </h1>
          </div>
          <div className="hidden shrink-0 border border-ink/15 bg-surface px-4 py-3 sm:block">
            <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
              {SCORE_LABEL.total.short}
            </div>
            <div className="mt-1 font-mono text-4xl tabular-nums text-ink">
              {report.score.total}
              <span className="text-sm text-muted">/100</span>
            </div>
          </div>
        </div>
        <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted sm:text-lg">
          {report.verdict.comment}
        </p>
        <div className="mt-4 flex flex-wrap gap-4 font-mono text-[11px] text-muted sm:hidden">
          <span>
            {SCORE_LABEL.total.short} {report.score.total}/100
          </span>
        </div>
      </header>

      {/* Continuous HR letter */}
      <article className="space-y-10 border border-ink/10 bg-surface px-5 py-8 sm:px-10 sm:py-12">
        <section>
          <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">
            Первое впечатление
          </h2>
          <div className="mt-4 space-y-4 text-[1.05rem] leading-[1.7] text-ink">
            {paras(review.firstImpression).map((p) => (
              <p key={p.slice(0, 24)}>{p}</p>
            ))}
          </div>
        </section>

        <section>
          <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">
            Разбор
          </h2>
          <div className="mt-4 space-y-4 text-[1.05rem] leading-[1.75] text-ink">
            {paras(review.deepDive).map((p) => (
              <p key={p.slice(0, 28)}>{p}</p>
            ))}
          </div>
          {!unlocked && wantFull ? (
            <p className="mt-4 font-mono text-xs text-signal">
              Ниже — полный текст после открытия разбора.
            </p>
          ) : null}
        </section>

        <section className="border-t border-ink/10 pt-8">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">
            Вердикт по найму
          </h2>
          <div className="mt-4 space-y-4 text-[1.05rem] leading-[1.7] text-ink">
            {paras(review.hiringTake).map((p) => (
              <p key={p.slice(0, 24)}>{p}</p>
            ))}
          </div>
        </section>

        <section className="border-t border-ink/10 pt-8">
          <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-muted">
            Что править первым
          </h2>
          <div className="mt-4 space-y-4 text-[1.05rem] leading-[1.7] text-ink">
            {paras(review.fixPriority).map((p) => (
              <p key={p.slice(0, 24)}>{p}</p>
            ))}
          </div>
        </section>
      </article>

      {/* Evidence from text — secondary */}
      <section>
        <h2 className="font-display text-2xl text-ink">
          Опоры в тексте
        </h2>
        <p className="mt-2 text-sm text-muted">
          Конкретные фрагменты, на которых держится разбор {persona.name.split(" ")[0]}.
        </p>
        <ul className="mt-6 space-y-6">
          {report.topProblems.map((p, i) => (
            <li key={p.id} className="border-l-2 border-ink/20 pl-4 sm:pl-5">
              <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                фрагмент {String(i + 1).padStart(2, "0")} · {p.severity}
              </div>
              <blockquote className="mt-2 text-sm text-muted">
                «{p.quote}»
              </blockquote>
              <p className="mt-3 text-base leading-relaxed text-ink">{p.roast}</p>
              <p className="mt-2 text-sm text-muted">{p.diagnosis}</p>
              <p className="mt-2 text-sm text-ink">
                <span className="text-muted">Сделать: </span>
                {p.recommendation}
              </p>
              {unlocked && p.suggestedRewrite ? (
                <p className="mt-3 bg-ok/5 p-3 text-sm text-ink">
                  <span className="font-medium">Каркас: </span>
                  {p.suggestedRewrite}
                </p>
              ) : null}
              <FeedbackButtons analysisId={analysisId} annotationId={p.id} />
            </li>
          ))}
        </ul>
      </section>

      {!unlocked ? (
        <section className="border border-ink bg-ink p-6 text-paper sm:p-8">
          <h3 className="font-display text-2xl">Полный разбор</h3>
          <p className="mt-3 text-paper/70">
            Полный текст HR, все опоры и план правок.
          </p>
          <Button className="mt-5" onClick={unlock} disabled={checkoutLoading}>
            {checkoutLoading ? "Открываем…" : "Открыть"}
          </Button>
          {error ? (
            <p className="mt-3 font-mono text-xs text-roast">{error}</p>
          ) : null}
        </section>
      ) : null}

      {unlocked && report.strengths.length > 0 ? (
        <section>
          <h2 className="font-display text-2xl text-ink">Что уже держится</h2>
          <ul className="mt-4 space-y-4">
            {report.strengths.map((s) => (
              <li key={s.id} className="border-l-2 border-ok/50 pl-4">
                <h3 className="font-medium text-ink">{s.title}</h3>
                {s.quote ? (
                  <blockquote className="mt-2 text-sm text-muted">
                    «{s.quote}»
                  </blockquote>
                ) : null}
                <p className="mt-2 text-sm text-muted">{s.comment}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {unlocked && plan.length > 0 ? (
        <section>
          <h2 className="font-display text-2xl text-ink">План на руки</h2>
          <ol className="mt-4 space-y-3">
            {plan.map((item) => (
              <li
                key={item.id}
                className="flex gap-4 border-b border-ink/8 py-3 last:border-0"
              >
                <span className="w-24 shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-signal">
                  {HORIZON_LABEL[item.horizon] ?? item.horizon}
                </span>
                <span className="text-sm text-ink">{item.action}</span>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <div className="flex flex-wrap gap-3 border-t border-ink/10 pt-8">
        <Button href={`/verdict?analysisId=${analysisId}`} variant="outline">
          К вердикту
        </Button>
        <Button href={`/share?analysisId=${analysisId}`}>Поделиться</Button>
        <Button
          href={`/auth?analysisId=${analysisId}&next=/history`}
          variant="secondary"
        >
          Сохранить
        </Button>
      </div>
    </motion.div>
  );
}
