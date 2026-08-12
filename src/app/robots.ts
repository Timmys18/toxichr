import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3100";
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/hr", "/pricing", "/vacancy", "/privacy"],
      disallow: ["/api/", "/me", "/settings", "/session", "/revenge", "/vacancies", "/ops/"],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
