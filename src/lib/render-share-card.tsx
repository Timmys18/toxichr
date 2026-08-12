import { ImageResponse } from "next/og";
import type { PublicSharePayload } from "@/lib/public-share";
import { loadGoogleFont } from "@/lib/og-font";

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const SQUARE_SIZE = { width: 1080, height: 1080 } as const;
export const STORY_SIZE = { width: 1080, height: 1920 } as const;

type Size = { width: number; height: number };

function truncate(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

export async function renderShareCard(
  payload: PublicSharePayload,
  size: Size = OG_SIZE,
): Promise<ImageResponse> {
  const title = truncate(payload.verdictTitle, size.height > 1000 ? 90 : 70);
  const quote = truncate(payload.quote, size.height > 1000 ? 160 : 120);
  const metaLine = [payload.roleLabel, payload.levelLabel]
    .filter(Boolean)
    .join(" · ");

  const fontText = [
    "ToxicHR",
    payload.personaName,
    payload.personaTitle,
    title,
    quote,
    "убедительность",
    "а моё резюме выживет?",
    metaLine,
    ...payload.metrics.map((m) => `${m.label}${m.value}`),
  ].join("");

  let fonts: { name: string; data: ArrayBuffer; weight: number }[] = [];
  try {
    const [display, mono] = await Promise.all([
      loadGoogleFont("Literata", fontText, 600),
      loadGoogleFont("IBM Plex Mono", fontText, 500),
    ]);
    fonts = [
      { name: "Literata", data: display, weight: 600 },
      { name: "IBM Plex Mono", data: mono, weight: 500 },
    ];
  } catch {
    // ImageResponse will fall back to default font
    fonts = [];
  }

  const isStory = size.height / size.width > 1.4;
  const metrics = payload.metrics.filter((m) => m.key !== "total").slice(0, 4);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#121212",
          color: "#f3efe6",
          padding: isStory ? 64 : 48,
          fontFamily: fonts.length ? "Literata" : "serif",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            width: "100%",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div
              style={{
                fontFamily: fonts.length ? "IBM Plex Mono" : "monospace",
                fontSize: 18,
                letterSpacing: 4,
                color: "#c8f135",
                textTransform: "uppercase",
              }}
            >
              ToxicHR · разбор
            </div>
            <div
              style={{
                marginTop: 12,
                fontSize: isStory ? 42 : 36,
                lineHeight: 1.1,
              }}
            >
              {payload.personaName}
            </div>
            <div
              style={{
                marginTop: 6,
                fontFamily: fonts.length ? "IBM Plex Mono" : "monospace",
                fontSize: 18,
                color: "rgba(243,239,230,0.55)",
              }}
            >
              {payload.personaTitle}
            </div>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              border: "1px solid rgba(200,241,53,0.4)",
              background: "rgba(200,241,53,0.1)",
              padding: "12px 18px",
            }}
          >
            <div
              style={{
                fontFamily: fonts.length ? "IBM Plex Mono" : "monospace",
                fontSize: 14,
                letterSpacing: 2,
                color: "#c8f135",
                textTransform: "uppercase",
              }}
            >
              убедительность
            </div>
            <div
              style={{
                fontFamily: fonts.length ? "IBM Plex Mono" : "monospace",
                fontSize: 48,
                color: "#c8f135",
                lineHeight: 1,
              }}
            >
              {payload.scoreTotal}
              <span style={{ fontSize: 22, color: "rgba(243,239,230,0.4)" }}>
                /100
              </span>
            </div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: isStory ? 48 : 24,
            marginBottom: isStory ? 48 : 24,
          }}
        >
          {metaLine ? (
            <div
              style={{
                fontFamily: fonts.length ? "IBM Plex Mono" : "monospace",
                fontSize: 16,
                letterSpacing: 2,
                color: "rgba(243,239,230,0.45)",
                textTransform: "uppercase",
                marginBottom: 16,
              }}
            >
              {metaLine}
            </div>
          ) : null}
          <div
            style={{
              fontSize: isStory ? 52 : 40,
              lineHeight: 1.15,
              maxWidth: 980,
            }}
          >
            «{title}»
          </div>
          <div
            style={{
              marginTop: 20,
              borderLeft: "3px solid rgba(200,241,53,0.7)",
              paddingLeft: 16,
              fontSize: isStory ? 28 : 22,
              color: "rgba(243,239,230,0.75)",
              maxWidth: 920,
              lineHeight: 1.35,
            }}
          >
            {quote}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
          {metrics.length > 0 ? (
            <div
              style={{
                display: "flex",
                gap: 28,
                borderTop: "1px solid rgba(243,239,230,0.12)",
                paddingTop: 20,
                width: "100%",
              }}
            >
              {metrics.map((m) => (
                <div
                  key={m.key}
                  style={{ display: "flex", flexDirection: "column" }}
                >
                  <div
                    style={{
                      fontFamily: fonts.length ? "IBM Plex Mono" : "monospace",
                      fontSize: 14,
                      letterSpacing: 2,
                      color: "rgba(243,239,230,0.4)",
                      textTransform: "uppercase",
                    }}
                  >
                    {m.label}
                  </div>
                  <div
                    style={{
                      fontFamily: fonts.length ? "IBM Plex Mono" : "monospace",
                      fontSize: 32,
                      marginTop: 4,
                    }}
                  >
                    {m.value}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
          <div
            style={{
              marginTop: 24,
              fontFamily: fonts.length ? "IBM Plex Mono" : "monospace",
              fontSize: 16,
              letterSpacing: 3,
              color: "rgba(243,239,230,0.35)",
              textTransform: "uppercase",
            }}
          >
            toxichr · а моё резюме выживет?
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: fonts.map((f) => ({
        name: f.name,
        data: f.data,
        style: "normal" as const,
        weight: f.weight as 500 | 600,
      })),
    },
  );
}
