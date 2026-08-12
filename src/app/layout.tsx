import { Providers } from "@/components/shared/providers";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "ToxicHR — честный разбор резюме без корпоративной политкорректности",
    template: "%s · ToxicHR",
  },
  description:
    "Четыре HR-персонажа разбирают резюме по фактам, помогают исправить слабые строки и сопоставить новую версию с вакансией.",
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  ),
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className="h-full antialiased">
      <body className="flex min-h-full flex-col font-sans text-fg">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
