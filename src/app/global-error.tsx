"use client";

export default function GlobalError({
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="ru">
      <body style={{ margin: 0, background: "#08090a", color: "#f2f4f5", fontFamily: "system-ui, sans-serif" }}>
        <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24 }}>
          <div style={{ maxWidth: 560, textAlign: "center" }}>
            <p style={{ color: "#2ce08b", fontSize: 12, letterSpacing: ".16em", textTransform: "uppercase" }}>
              ToxicHR · критический сбой
            </p>
            <h1 style={{ margin: "14px 0 0", fontSize: "clamp(34px,6vw,58px)" }}>
              Интерфейс не загрузился
            </h1>
            <p style={{ margin: "18px 0 0", color: "rgba(242,244,245,.6)", lineHeight: 1.6 }}>
              Данные не исчезли. Перезапусти экран — чаще всего этого достаточно.
            </p>
            <button
              type="button"
              onClick={() => unstable_retry()}
              style={{ marginTop: 26, minHeight: 50, padding: "0 24px", border: 0, borderRadius: 999, background: "#2ce08b", color: "#06130c", fontWeight: 700, cursor: "pointer" }}
            >
              Перезапустить экран
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
