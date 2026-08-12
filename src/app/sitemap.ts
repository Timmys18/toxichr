import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3100";
  return [
    { url: base, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/hr`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/vacancy`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/pricing`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/privacy`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
