import { ImageResponse } from "next/og";
import { prisma } from "@/lib/prisma";
import type { PublicSharePayload } from "@/lib/public-share";
import { OG_SIZE, renderShareCard } from "@/lib/render-share-card";

export const alt = "ToxicHR — честный разбор резюме";
export const size = OG_SIZE;
export const contentType = "image/png";
export const runtime = "nodejs";

type Props = {
  params: Promise<{ slug: string }>;
};

export default async function Image({ params }: Props) {
  const { slug } = await params;
  const share = await prisma.publicShare.findUnique({ where: { slug } });

  if (!share || !share.active || share.revokedAt) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#121212",
            color: "#c8f135",
            fontSize: 48,
          }}
        >
          ToxicHR
        </div>
      ),
      { ...size },
    );
  }

  return renderShareCard(share.publicPayload as PublicSharePayload, size);
}
