import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const EXTRA_USER_FACING_FILES = [
  "src/lib/personas.ts",
  "src/lib/vacancy.ts",
  "src/lib/ai/heuristics.ts",
  "src/components/home/hr-roster.ts",
  "src/app/me/cabinet-client.tsx",
  "src/app/hr/page.tsx",
];

function sourceFiles(directory: string): string[] {
  return readdirSync(resolve(process.cwd(), directory), { withFileTypes: true }).flatMap((entry) => {
    const relative = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return sourceFiles(relative);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [relative] : [];
  });
}

test("запрещённая лексика отсутствует в статическом пользовательском тексте", () => {
  const forbidden = /доказател\w*|приговор\w*|(?:^|[^а-яё])при[её]м(?:а|у|ом|е|ы|ов|ам|ами|ах)?(?=$|[^а-яё])/giu;
  const files = [...new Set([...sourceFiles("src/app"), ...sourceFiles("src/components"), ...EXTRA_USER_FACING_FILES])];
  const violations = files.flatMap((file) => {
    const source = readFileSync(resolve(process.cwd(), file), "utf8");
    return [...source.matchAll(forbidden)].map((match) => `${file}: ${match[0].trim()}`);
  });
  expect(violations).toEqual([]);
});
