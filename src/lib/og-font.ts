/** Load a Google font subset for next/og (Cyrillic-safe). */
export async function loadGoogleFont(
  family: string,
  text: string,
  weight = 600,
): Promise<ArrayBuffer> {
  const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}&text=${encodeURIComponent(text)}`;

  const css = await fetch(cssUrl, {
    headers: {
      // Request TTF/OTF, not woff2 (satori needs ttf/otf)
      "User-Agent": "Mozilla/5.0 (compatible; ToxicHR/1.0)",
    },
  }).then((r) => r.text());

  const match = css.match(
    /src: url\(([^)]+)\) format\('(opentype|truetype)'\)/,
  );
  if (!match?.[1]) {
    // Fallback: try any url in the css
    const anyUrl = css.match(/src: url\(([^)]+)\)/);
    if (!anyUrl?.[1]) {
      throw new Error(`Font URL not found for ${family}`);
    }
    return fetch(anyUrl[1]).then((r) => r.arrayBuffer());
  }

  return fetch(match[1]).then((r) => r.arrayBuffer());
}
