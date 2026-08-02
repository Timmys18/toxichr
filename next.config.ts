import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
};

export default nextConfig;
