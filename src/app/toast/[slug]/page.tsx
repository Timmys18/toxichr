import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import type { PublicSharePayload } from "@/lib/public-share";
import { appBaseUrl } from "@/lib/public-share";
import { ToastClient } from "./toast-client";

type Props = {
  params: Promise<{ slug: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const share = await prisma.publicShare.findUnique({ where: { slug } });

  if (!share || !share.active || share.revokedAt) {
    return { title: "Карточка не найдена" };
  }

  const payload = share.publicPayload as PublicSharePayload;
  const title =
    share.title ?? `«${payload.verdictTitle}» · ${payload.scoreTotal}/100`;
  const description =
    share.description ??
    payload.quote.slice(0, 160) ??
    "ToxicHR разобрал резюме. А твоё?";

  const ogImage = `${appBaseUrl()}/api/cards/${slug}?format=og`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${appBaseUrl()}/toast/${slug}`,
      type: "website",
      locale: "ru_RU",
      images: [{ url: ogImage, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage],
    },
  };
}

export default async function ToastPage({ params }: Props) {
  const { slug } = await params;

  const share = await prisma.publicShare.findUnique({ where: { slug } });

  if (!share || !share.active || share.revokedAt) {
    notFound();
  }

  if (share.expiresAt && share.expiresAt < new Date()) {
    notFound();
  }

  const payload = share.publicPayload as PublicSharePayload;

  return (
    <>
      <ToastClient slug={slug} payload={payload} />
    </>
  );
}
