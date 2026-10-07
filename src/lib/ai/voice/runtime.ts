import { createHash } from "node:crypto";
import corpusAsset from "./corpus.json";
import policyAsset from "./policy.json";
import type { PersonaId } from "@/lib/personas";
import type { VoiceContext } from "./context";
import { voiceContext } from "./context";
import type { ProfessionalAssessment } from "../professional-assessment";

export type VoiceExample = {
  id: string; persona: string; scenario: string; polarity: string; requires: string[];
  rhetoricalMove: string; intensity: number; sourceFragment: string;
  disallowedInference: string; outputExample: string;
};
export const VOICE_CORPUS_VERSION = `voice-corpus@${corpusAsset.version}`;
export const VOICE_POLICY_VERSION = `voice-policy@${policyAsset.version}`;
export const VOICE_POLICY = policyAsset;
export const VOICE_EXAMPLES: VoiceExample[] = corpusAsset.entries;
export type VoiceMetadata = { corpusVersion: string; policyVersion: string; selectedIds: string[]; contextHash: string; effectiveIntensity: number };

export function selectVoiceExamples(ctx: VoiceContext, limit = 2): { examples: VoiceExample[]; metadata: VoiceMetadata } {
  if (!policyAsset.personas[ctx.persona] || !Number.isFinite(ctx.confidence) || ctx.confidence < 0 || ctx.confidence > 1) throw new Error("Invalid voice context");
  if (!Number.isInteger(limit) || limit < 0 || limit > 3 || !Number.isInteger(ctx.intensity) || ctx.intensity < 0 || ctx.intensity > 3) throw new Error("Invalid voice controls");
  const ids = new Set(ctx.facts.map(f => f.id));
  if (ids.size !== ctx.facts.length || ctx.facts.some(f => !f.id || !f.text.trim())) throw new Error("Invalid voice facts");
  for (const [signal, refs] of Object.entries(ctx.evidence)) {
    if (!policyAsset.allowedSignals.includes(signal) || !refs.length || refs.some(ref => !ids.has(ref))) throw new Error("Invalid voice evidence");
  }
  if (ctx.scenarios.some(s => !VOICE_EXAMPLES.some(e => e.scenario === s))) throw new Error("Unknown voice situation");
  const intensity = ctx.confidence < 0.6 ? Math.min(ctx.intensity, 1) : ctx.intensity;
  // Explicit ordered payload avoids object-key ordering changing the fingerprint.
  const contextHash = createHash("sha256").update(JSON.stringify([
    corpusAsset.version, ctx.persona, ctx.confidence, intensity, ctx.assessment,
    ctx.facts.map(f => [f.id, f.text]), ctx.scenarios,
    Object.keys(ctx.evidence).sort().map(k => [k, [...ctx.evidence[k]].sort()]),
  ])).digest("hex");
  const examples = VOICE_EXAMPLES.filter(e => e.persona === ctx.persona && ctx.scenarios.includes(e.scenario) && e.requires.every(signal => ctx.evidence[signal]?.length) && e.intensity <= intensity && (ctx.confidence >= 0.6 || e.polarity === "uncertain") && (ctx.assessment.polarity === "mixed" || e.polarity === ctx.assessment.polarity))
    .sort((a, b) => ctx.scenarios.indexOf(a.scenario) - ctx.scenarios.indexOf(b.scenario) || a.id.localeCompare(b.id))
    .filter((e, index, eligible) => eligible.findIndex(other => other.rhetoricalMove === e.rhetoricalMove) === index).slice(0, limit);
  return { examples, metadata: { corpusVersion: VOICE_CORPUS_VERSION, policyVersion: VOICE_POLICY_VERSION, selectedIds: examples.map(e => e.id), contextHash, effectiveIntensity: intensity } };
}

export function voiceCalibration(assessment: ProfessionalAssessment, persona: PersonaId) {
  // Imported below: no classifier call, no network access, no candidate mutation.
  const ctx = voiceContext(assessment, persona);
  const selected = selectVoiceExamples(ctx);
  return {
    metadata: selected.metadata,
    instruction: "Создай новую реакцию. Эти примеры вымышлены: не факты кандидата, не шаблон ответа и не список обязательных образов.",
    intensity: selected.metadata.effectiveIntensity,
    lengthGuidance: "Одна ведущая мысль в verdict; свободные блоки без одинакового скелета. Не увеличивай длину ради валидатора.",
    fictionalStyleExamplesNeverCandidateEvidence: selected.examples.map(e => ({ id: e.id, fictionalInput: e.sourceFragment, boundaries: e.disallowedInference, move: e.rhetoricalMove, fictionalResponse: e.outputExample })),
  };
}

export type ProseInspection = { blockers: string[]; warnings: string[] };
const words = (s: string) => s.toLowerCase().replace(/ё/g, "е").match(/[\p{L}\p{N}]+/gu) ?? [];
const grams = (s: string, n: number) => { const w = words(s); return new Set(w.slice(0, Math.max(0, w.length - n + 1)).map((_, i) => w.slice(i, i + n).join(" "))); };
const numbers = (s: string) => new Set((s.match(/\d+(?:[.,]\d+)?/g) ?? []).map(n => n.replace(",", ".")));

/** Extra mechanical checks; NOT an evaluator of truth, voice or humour. */
export function inspectVoiceProse(text: string, { groundedText, displayedBlocks = [] }: { groundedText: string; displayedBlocks?: string[] }): ProseInspection {
  const blockers: string[] = [], warnings: string[] = [];
  const w = words(text);
  if (w.some(t => policyAsset.directInsultTokens.includes(t))) blockers.push("прямое оскорбление вместо оценки резюме");
  const allowed = numbers(groundedText);
  if ([...numbers(text)].some(n => !allowed.has(n))) blockers.push("цифровой факт отсутствует в исходном материале");
  const sourceGrams = grams(groundedText, 8), outputGrams = grams(text, 8);
  if (VOICE_EXAMPLES.some(e => [...grams(e.outputExample, 8)].some(g => outputGrams.has(g) && !sourceGrams.has(g)))) warnings.push("возможное дословное копирование стилевого примера");
  const blocks = displayedBlocks.map(b => words(b).join(" "));
  if (blocks.some((b, i) => b.length >= 50 && blocks.indexOf(b) !== i)) blockers.push("одинаковый текст в разных видимых блоках");
  return { blockers, warnings };
}
