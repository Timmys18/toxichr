"use client";

import { useEffect, type MouseEvent } from "react";
import Link from "next/link";
import type { PublicSharePayload } from "@/lib/public-share";
import {
  getOrCreateVisitorId,
  rememberReferral,
} from "@/lib/referral-client";

type Props = {
  slug: string;
  payload: PublicSharePayload;
};

export function ToastClient({ slug, payload }: Props) {
  useEffect(() => {
    const visitorId = getOrCreateVisitorId();
    void fetch(`/api/public-shares/${slug}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventType: "viewed", sessionId: visitorId }),
    });
  }, [slug]);

  async function trackCta(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    const visitorId = getOrCreateVisitorId();
    rememberReferral({ slug, campaign: "public_card" });

    await Promise.allSettled([
      fetch(`/api/public-shares/${slug}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType: "cta_clicked",
          sessionId: visitorId,
        }),
        keepalive: true,
      }),
      fetch("/api/referrals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          visitorId,
          campaign: "public_card",
        }),
        keepalive: true,
      }),
    ]);

    window.location.href = `/?ref=${encodeURIComponent(slug)}`;
  }

  const sub = [payload.roleLabel, payload.levelLabel]
    .filter(Boolean)
    .join(" · ");

  return (
    <main id="main" className="toast">
      <div className="wrap">
        <div className="over thr-mono">
          Публичная карточка · {payload.personaName}
        </div>
        <h1>«{payload.verdictTitle}»</h1>
        <div className="score thr-mono">
          Оценка {payload.personaName}: <b>{payload.scoreTotal}/100</b>
        </div>
        <blockquote>{payload.quote}</blockquote>
        {sub ? <div className="sub thr-mono">{sub}</div> : null}

        <div className="card">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/cards/${slug}?format=og`}
            alt={`Карточка разбора · ${payload.verdictTitle}`}
            loading="lazy"
          />
        </div>

        <Link href="/" className="thr-btn thr-btn-tox cta" onClick={trackCta}>
          А моё резюме? Проверить →
        </Link>
        <p className="note">
          Полный текст резюме не публикуется — только вердикт и метрики.
        </p>
        <Link href="/" className="what">
          Что такое ToxicHR
        </Link>
      </div>

      <style jsx>{`
        .toast {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 40px 20px 70px;
        }
        .wrap {
          width: 100%;
          max-width: 560px;
          animation: thr-fade 0.6s var(--ease);
        }
        .over {
          font-size: 11px;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          color: var(--faint);
        }
        h1 {
          font-weight: 800;
          font-size: clamp(28px, 5vw, 40px);
          line-height: 1.08;
          letter-spacing: -0.035em;
          margin-top: 16px;
        }
        .score {
          margin-top: 12px;
          font-size: 12.5px;
          letter-spacing: 0.06em;
          color: var(--dim);
        }
        .score b {
          color: var(--tox);
        }
        blockquote {
          margin: 20px 0 0;
          border-left: 2px solid var(--tox);
          padding-left: 16px;
          font-size: 16px;
          line-height: 1.6;
          color: var(--dim);
          font-style: italic;
        }
        .sub {
          margin-top: 14px;
          font-size: 11px;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: var(--faint);
        }
        .card {
          margin-top: 26px;
          border: 1px solid var(--hair2);
          border-radius: 16px;
          overflow: hidden;
          background: var(--metal-1);
        }
        .card :global(img) {
          display: block;
          width: 100%;
          height: auto;
        }
        .cta {
          margin-top: 26px;
          width: 100%;
          height: 56px;
          justify-content: center;
          text-decoration: none;
          font-size: 15.5px;
        }
        .note {
          margin-top: 14px;
          text-align: center;
          font-family: var(--font-mono);
          font-size: 11px;
          color: var(--faint);
        }
        .what {
          display: block;
          margin-top: 12px;
          text-align: center;
          font-size: 13.5px;
          color: var(--dim);
          text-decoration: underline;
          text-underline-offset: 3px;
        }
      `}</style>
    </main>
  );
}
