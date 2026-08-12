import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Нативные и Node-тяжёлые пакеты не бандлим — грузим require() в рантайме.
  // Без этого Turbopack/webpack роняет сборку route-handler'ов, использующих
  // better-sqlite3 (нативный), mammoth и pdf-parse — и роут не регистрируется
  // (POST отдаёт «Server action not found»).
  serverExternalPackages: [
    "better-sqlite3",
    "@prisma/adapter-better-sqlite3",
    "@prisma/client",
    "prisma",
    "mammoth",
    "pdf-parse",
  ],
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
