import { Providers } from "@/components/shared/providers";
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "ToxicHR — самый токсичный HR для твоего резюме",
    template: "%s · ToxicHR",
  },
  description:
    "Самый честный и саркастично объективный комментарий вашего резюме. Каждое слово — на основании фактов.",
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
