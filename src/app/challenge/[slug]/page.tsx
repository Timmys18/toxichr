import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/landing/site-header";
import { SiteFooter } from "@/components/landing/site-footer";
import { prisma } from "@/lib/prisma";
import type { PublicSharePayload } from "@/lib/public-share";
import { appBaseUrl } from "@/lib/public-share";
import { ChallengeClient } from "./challenge-client";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const share = await prisma.publicShare.findUnique({ where: { slug } });
  if (!share || !share.active || share.revokedAt) {
    return { title: "Challenge" };
  }
  const payload = share.publicPayload as PublicSharePayload;
  return {
    title: `Challenge · ${payload.scoreTotal}/100`,
    description: `${payload.personaName}: «${payload.quote}». Проверим твоё?`,
    openGraph: {
      title: `Вызов ToxicHR · ${payload.scoreTotal}/100`,
      description: payload.quote,
      url: `${appBaseUrl()}/challenge/${slug}`,
      images: [
        {
          url: `${appBaseUrl()}/api/cards/${slug}?format=og`,
          width: 1200,
          height: 630,
        },
      ],
    },
  };
}

export default async function ChallengePage({ params }: Props) {
  const { slug } = await params;
  const share = await prisma.publicShare.findUnique({ where: { slug } });

  if (!share || !share.active || share.revokedAt) {
    notFound();
  }

  const payload = share.publicPayload as PublicSharePayload;

  return (
    <>
      <SiteHeader />
      <ChallengeClient slug={slug} payload={payload} />
      <SiteFooter />
    </>
  );
}
