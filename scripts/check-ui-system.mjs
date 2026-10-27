import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const sourceRoot = join(process.cwd(), "src");
const tokens = readFileSync(join(sourceRoot, "app", "globals.css"), "utf8");
const required = ["background", "surface", "surface-elevated", "text-primary", "text-secondary", "text-muted", "border-subtle", "accent", "success", "warning", "danger", "focus", "text-body", "text-card", "text-section", "text-page"];
const errors = required.filter((name) => !tokens.includes(`--${name}:`)).map((name) => `Missing design token: --${name}`);

function visit(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) { visit(path); continue; }
    if (!entry.name.endsWith(".css") || entry.name === "global-error.module.css") continue;
    const content = readFileSync(path, "utf8");
    const name = relative(process.cwd(), path);
    if (/font-size\s*:\s*\d+(?:\.\d+)?px\b/.test(content)) errors.push(`${name}: use a typography token for font-size`);
    if (/font\s*:\s*(?:\d+\s+)?\d+(?:\.\d+)?px\b/.test(content)) errors.push(`${name}: use a typography token in font shorthand`);
    const faces = [...content.matchAll(/font-family\s*:\s*["']([^"']+)["']/g)].map((match) => match[1]);
    for (const face of faces) if (!new Set(["Onest", "JBMono"]).has(face)) errors.push(`${name}: unapproved font ${face}`);
  }
}

visit(sourceRoot);
if (errors.length) { console.error(errors.join("\n")); process.exitCode = 1; }
else console.log("UI tokens and typography: OK");
