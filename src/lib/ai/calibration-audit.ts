import { AsyncLocalStorage } from "node:async_hooks";

export type CalibrationAiCall = {
  stage: string;
  provider: string;
  model: string;
  status: "success" | "error";
};

const calls = new AsyncLocalStorage<CalibrationAiCall[]>();

/** Test-only scoped metadata collector. Never stores prompts, output or credentials. */
export function withCalibrationAiCalls<T>(run: () => Promise<T>): Promise<{ value: T; calls: CalibrationAiCall[] }> {
  const recorded: CalibrationAiCall[] = [];
  return calls.run(recorded, async () => ({ value: await run(), calls: recorded }));
}

export function recordCalibrationAiCall(call: CalibrationAiCall): void {
  calls.getStore()?.push(call);
}
