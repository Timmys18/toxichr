"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  VerdictCardPreview,
  isPersonaId,
} from "@/components/share/verdict-card-preview";
import type { AnalysisReport } from "@/lib/ai/schemas";
import { PERSONAS } from "@/lib/personas";
import { track } from "@/lib/analytics";
import {
  facebookShareUrl,
  linkedInShareUrl,
  telegramShareUrl,
  xShareUrl,
} from "@/lib/public-share";
import {
  DEFAULT_ANONYMIZATION,
  METRIC_OPTIONS,
  SHARE_FORMATS,
  SHARE_MODES,
  buildShareCaption,
  type ShareFormat,
  type ShareMetricKey,
  type ShareMode,
} from "@/lib/share-studio";
import { cn } from "@/lib/utils";

type Props = {
  analysisId: string;
};

type AnalysisPayload = {
  report: AnalysisReport;
  personaId: string | null;
};

type PublishedShare = {
  slug: string;
  url: string;
  path: string;
};

export function ShareStudio({ analysisId }: Props) {
  const [data, setData] = useState<AnalysisPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ShareMode>("loud");
  const [format, setFormat] = useState<ShareFormat>("square");
  const [quoteId, setQuoteId] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<ShareMetricKey[]>([
    "total",
    "evidence",
    "corporateWater",
    "seniorityConsistency",
  ]);
  const [anon, setAnon] = useState(DEFAULT_ANONYMIZATION);
  const [copied, setCopied] = useState<"text" | "link" | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [published, setPublished] = useState<PublishedShare | null>(null);
  const [canNativeShare, setCanNativeShare] = useState(false);

  useEffect(() => {
    setCanNativeShare(
      typeof navigator !== "undefined" && typeof navigator.share === "function",
    );
  }, []);

  useEffect(() => {
    track("share_studio_opened", { analysisId });
    fetch(`/api/analyses/${analysisId}`)
      .then((r) => r.json())
      .then((payload) => {
        if (payload.error || !payload.report) {
          throw new Error(payload.error ?? "Отчёт не найден");
        }
        setData({ report: payload.report, personaId: payload.personaId });
        const firstQuote = payload.report.shareQuotes?.[0]?.id ?? null;
        setQuoteId(firstQuote);
      })
      .catch((e: Error) => setError(e.message));
  }, [analysisId]);

  const selectedQuote = useMemo(() => {
    if (!data) return null;
    return (
      data.report.shareQuotes.find((q) => q.id === quoteId) ??
      data.report.shareQuotes[0] ??
      null
    );
  }, [data, quoteId]);

  const metricValues = useMemo(() => {
    if (!data) return [];
    const { score, viralMetrics } = data.report;
    const map: Record<ShareMetricKey, number> = {
      total: score.total,
      evidence: score.evidence,
      positioning: score.positioning,
      corporateWater: viralMetrics.corporateWater,
      seniorityConsistency: score.seniorityConsistency,
    };
    return METRIC_OPTIONS.filter((o) => metrics.includes(o.key)).map((o) => ({
      key: o.key,
      label: o.label,
      value: map[o.key],
    }));
  }, [data, metrics]);

  if (error) {
    return (
      <div className="space-y-4">
        <p className="text-roast">{error}</p>
        <Button href="/start" variant="outline">
          Начать заново
        </Button>
      </div>
    );
  }

  if (!data || !selectedQuote) {
    return (
      <p className="font-mono text-sm text-muted animate-pulse">
        Собираем Share Studio…
      </p>
    );
  }

  const personaId =
    data.personaId && isPersonaId(data.personaId)
      ? data.personaId
      : data.report.recommendedPersonaId;
  const persona = PERSONAS.find((p) => p.id === personaId) ?? PERSONAS[1];
  const roleLabel = anon.showRole
    ? data.report.candidateProfile.primaryRole
    : null;
  const levelLabel = anon.showLevel
    ? data.report.candidateProfile.inferredLevel
    : null;

  const caption = buildShareCaption({
    mode,
    personaName: persona.name,
    score: data.report.score.total,
    quote: selectedQuote.text,
    role: roleLabel ?? undefined,
  });

  function toggleMetric(key: ShareMetricKey) {
    setMetrics((prev) => {
      if (prev.includes(key)) {
        if (prev.length <= 1) return prev;
        return prev.filter((k) => k !== key);
      }
      if (prev.length >= 4) return prev;
      return [...prev, key];
    });
    setPublished(null);
  }

  async function copyText(value: string, kind: "text" | "link") {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      track("share_text_copied", { analysisId, mode, format, kind });
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(null);
    }
  }

  async function publish() {
    setPublishing(true);
    setPublishError(null);
    try {
      const res = await fetch("/api/public-shares", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          analysisId,
          mode,
          format,
          quoteId: selectedQuote!.id,
          metrics,
          anonymization: {
            ...anon,
            showName: false,
            showCompanies: false,
            showPhoto: false,
          },
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error ?? "Не удалось опубликовать");
      }
      setPublished({ slug: json.slug, url: json.url, path: json.path });
      track("public_share_created", { analysisId, slug: json.slug, mode });
    } catch (e) {
      setPublishError(e instanceof Error ? e.message : "Ошибка публикации");
    } finally {
      setPublishing(false);
    }
  }

  function openPlatform(platform: string, href: string) {
    track("share_platform_opened", { analysisId, platform, mode });
    if (published) {
      void fetch(`/api/public-shares/${published.slug}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType: "platform_opened",
          platform,
        }),
      });
    }
    window.open(href, "_blank", "noopener,noreferrer");
  }

  async function nativeShare() {
    if (!published || !data || !navigator.share) return;
    try {
      await navigator.share({
        title: `ToxicHR · ${data.report.score.total}/100`,
        text: caption,
        url: published.url,
      });
      track("share_platform_opened", {
        analysisId,
        platform: "native",
        mode,
      });
    } catch {
      // user cancelled
    }
  }

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(280px,380px)] lg:gap-12">
      <div className="space-y-10">
        <header>
          <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted">
            Share Studio · артефакт
          </p>
          <h1 className="mt-4 font-display text-4xl leading-[1.02] tracking-tight text-ink sm:text-5xl">
            Как будем позориться?
          </h1>
          <p className="mt-4 max-w-xl text-muted leading-relaxed">
            Собери персональную карточку. По умолчанию без имени, фото и
            компаний — только удар и метрики.
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
            Подача
          </h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {SHARE_MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  setMode(m.id);
                  setPublished(null);
                  track("share_variant_selected", {
                    analysisId,
                    mode: m.id,
                  });
                }}
                className={cn(
                  "border px-4 py-3 text-left transition-colors",
                  mode === m.id
                    ? "border-ink bg-ink text-paper"
                    : "border-ink/12 bg-surface text-ink hover:border-ink/30",
                )}
              >
                <div className="font-medium">{m.title}</div>
                <div
                  className={cn(
                    "mt-1 text-sm leading-snug",
                    mode === m.id ? "text-paper/65" : "text-muted",
                  )}
                >
                  {m.subtitle}
                </div>
                <div
                  className={cn(
                    "mt-2 font-mono text-[10px] uppercase tracking-[0.14em]",
                    mode === m.id ? "text-toxic" : "text-muted",
                  )}
                >
                  {m.platforms}
                </div>
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
            Цитата
          </h2>
          <div className="space-y-2">
            {data.report.shareQuotes.map((q) => (
              <button
                key={q.id}
                type="button"
                onClick={() => {
                  setQuoteId(q.id);
                  setPublished(null);
                }}
                className={cn(
                  "w-full border px-4 py-3 text-left transition-colors",
                  quoteId === q.id
                    ? "border-toxic bg-toxic/10"
                    : "border-ink/12 bg-surface hover:border-ink/25",
                )}
              >
                <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                  {q.kind === "precise"
                    ? "точный"
                    : q.kind === "funny"
                      ? "смешной"
                      : "безопасный"}
                </span>
                <p className="mt-1 text-sm text-ink leading-relaxed">
                  «{q.text}»
                </p>
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
            Метрики на карточке · до 4
          </h2>
          <div className="flex flex-wrap gap-2">
            {METRIC_OPTIONS.map((o) => {
              const on = metrics.includes(o.key);
              return (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => toggleMetric(o.key)}
                  className={cn(
                    "border px-3 py-1.5 font-mono text-xs transition-colors",
                    on
                      ? "border-ink bg-ink text-paper"
                      : "border-ink/15 text-muted hover:border-ink/30 hover:text-ink",
                  )}
                >
                  {o.label}
                </button>
              );
            })}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
            Анонимизация
          </h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                ["showRole", "Должность / роль"],
                ["showLevel", "Уровень"],
                ["showName", "Имя"],
                ["showCompanies", "Компании"],
              ] as const
            ).map(([key, label]) => (
              <label
                key={key}
                className="flex cursor-pointer items-center gap-3 border border-ink/10 bg-surface px-3 py-2.5"
              >
                <input
                  type="checkbox"
                  checked={anon[key]}
                  disabled={key === "showName" || key === "showCompanies"}
                  onChange={(e) => {
                    setAnon((prev) => ({ ...prev, [key]: e.target.checked }));
                    setPublished(null);
                  }}
                  className="size-4 accent-[var(--toxic)]"
                />
                <span className="text-sm text-ink">
                  {label}
                  {(key === "showName" || key === "showCompanies") && (
                    <span className="ml-2 font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
                      выкл · v1
                    </span>
                  )}
                </span>
              </label>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
            Текст публикации
          </h2>
          <pre className="whitespace-pre-wrap border border-ink/10 bg-surface p-4 font-sans text-sm leading-relaxed text-ink">
            {caption}
          </pre>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => copyText(caption, "text")} variant="outline">
              {copied === "text" ? "Скопировано" : "Скопировать текст"}
            </Button>
            <Button onClick={publish} disabled={publishing}>
              {publishing
                ? "Публикуем…"
                : published
                  ? "Обновить ссылку"
                  : "Создать публичную ссылку"}
            </Button>
          </div>
          {publishError ? (
            <p className="font-mono text-xs text-roast">{publishError}</p>
          ) : null}
        </section>

        {published ? (
          <section className="space-y-5 border-2 border-ink bg-ink p-6 text-paper sm:p-7">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-toxic">
                Ссылка готова
              </p>
              <h2 className="mt-2 font-display text-2xl text-paper">
                Артефакт опубликован
              </h2>
            </div>
            <p className="break-all font-mono text-sm text-toxic/90">
              {published.url}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => copyText(published.url, "link")}
                variant="secondary"
                size="sm"
              >
                {copied === "link" ? "Ссылка скопирована" : "Копировать ссылку"}
              </Button>
              <Button href={published.path} variant="outline" size="sm">
                Открыть страницу
              </Button>
              <Button
                href={`/challenge/${published.slug}`}
                variant="outline"
                size="sm"
              >
                Challenge-ссылка
              </Button>
              <Button
                href={`/api/cards/${published.slug}?format=${format}`}
                variant="outline"
                size="sm"
              >
                Скачать PNG
              </Button>
              {canNativeShare ? (
                <Button onClick={nativeShare} variant="outline" size="sm">
                  Native Share
                </Button>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  openPlatform(
                    "telegram",
                    telegramShareUrl(published.url, caption),
                  )
                }
              >
                Telegram
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  openPlatform("x", xShareUrl(published.url, caption))
                }
              >
                X
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  openPlatform("linkedin", linkedInShareUrl(published.url))
                }
              >
                LinkedIn
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  openPlatform("facebook", facebookShareUrl(published.url))
                }
              >
                Facebook
              </Button>
            </div>
          </section>
        ) : null}

        <Button href={`/verdict?analysisId=${analysisId}`} variant="ghost">
          ← К приговору
        </Button>
      </div>

      <aside className="lg:sticky lg:top-8 lg:self-start">
        <div className="mb-4 flex flex-wrap gap-2">
          {SHARE_FORMATS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => {
                setFormat(f.id);
                setPublished(null);
              }}
              className={cn(
                "border px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors",
                format === f.id
                  ? "border-ink bg-ink text-paper"
                  : "border-ink/15 text-muted hover:border-ink/30",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <VerdictCardPreview
          format={format}
          personaId={personaId}
          verdictTitle={data.report.verdict.title}
          quote={selectedQuote.text}
          scoreTotal={data.report.score.total}
          metrics={metricValues.filter((m) => m.key !== "total")}
          roleLabel={roleLabel}
          levelLabel={levelLabel}
        />
        <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
          Preview · {SHARE_FORMATS.find((f) => f.id === format)?.size}
        </p>
      </aside>
    </div>
  );
}
