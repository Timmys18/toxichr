import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const RATES: Record<string, [number, number, number]> = {
  "gpt-6.1-sol": [2, 0.1, 10], "gpt-6.1-terra": [1, 0.05, 5],
  "gpt-5.4-mini": [0.75, 0.075, 4.5], "gpt-5-mini": [0.25, 0.025, 2], "gpt-5-nano": [0.05, 0.005, 0.4],
};

export function knownManifestCost(manifest: { calls: number; usage: Array<{ model: string; usage: null | { prompt_tokens: number; completion_tokens: number; prompt_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number } } }> }): number {
  if (!Array.isArray(manifest.usage) || manifest.calls !== manifest.usage.length) throw new Error("Невозможно подтвердить стоимость предыдущего запуска");
  return manifest.usage.reduce((total, entry) => {
    const rate = RATES[entry.model], usage = entry.usage;
    if (!rate || !usage || !Number.isFinite(usage.prompt_tokens) || !Number.isFinite(usage.completion_tokens)) throw new Error("Предыдущий запрос без известной стоимости: запуск остановлен");
    const [inputRate, cachedRate, outputRate] = rate;
    const cached = usage.prompt_tokens_details?.cached_tokens ?? 0;
    const written = usage.prompt_tokens_details?.cache_write_tokens ?? 0;
    if (cached < 0 || written < 0 || cached + written > usage.prompt_tokens) throw new Error("Неизвестная структура токенов в журнале");
    const premium = entry.model.startsWith("gpt-6") ? written * inputRate * 0.25 : 0;
    return total + ((usage.prompt_tokens - cached) * inputRate + cached * cachedRate + premium + usage.completion_tokens * outputRate) / 1_000_000;
  }, 0);
}

export async function priorVoiceCost(root = "artifacts/voice-release", interruptedReserve: Record<string, number> = {}): Promise<number> {
  let entries;
  try { entries = await readdir(root, { withFileTypes: true }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return 0; throw error; }
  let sum = 0;
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const file = path.join(root, entry.name, "manifest.json");
    try { sum += knownManifestCost(JSON.parse(await readFile(file, "utf8"))); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        const reserve = interruptedReserve[entry.name];
        if (Number.isFinite(reserve) && reserve > 0) { sum += reserve; continue; }
        throw new Error(`У предыдущего запуска нет отчёта о расходах: ${entry.name}`);
      }
      throw error;
    }
  }
  return sum;
}
