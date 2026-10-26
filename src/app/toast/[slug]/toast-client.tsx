"use client";

import { useEffect, type MouseEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { PublicSharePayload } from "@/lib/public-share";
import { PageContainer, PageIntro, PrimaryAction } from "@/components/ui/system";
import {
  getOrCreateVisitorId,
  rememberReferral,
} from "@/lib/referral-client";

type Props = {
  slug: string;
  payload: PublicSharePayload;
};

export function ToastClient({ slug, payload }: Props) {
  const router = useRouter();

  useEffect(() => {
    const visitorId = getOrCreateVisitorId();
    void fetch(`/api/public-shares/${slug}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventType: "viewed", sessionId: visitorId }),
    });
  }, [slug]);

  function trackCta(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    const visitorId = getOrCreateVisitorId();
    rememberReferral({ slug, campaign: "public_card" });

    void Promise.allSettled([
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

    router.push(`/?ref=${encodeURIComponent(slug)}`);
  }

  return (
    <main id="main">
      <PageContainer className="ds-toast-page">
        <PageIntro title={payload.verdictTitle} lead={`Разбор от ${payload.personaName}`} />
        <blockquote>{payload.quote}</blockquote>
        <div className="ds-toast-image">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/cards/${slug}?format=og`} alt={`Карточка разбора · ${payload.verdictTitle}`} loading="lazy" />
        </div>
        <PrimaryAction href="/" onClick={trackCta}>Проверить моё резюме</PrimaryAction>
        <div className="ds-toast-links">
          <span>Полный текст резюме не публикуется.</span>
          <Link href="/">Что такое ToxicHR</Link>
        </div>
      </PageContainer>
    </main>
  );
}
