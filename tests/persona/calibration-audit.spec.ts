import { expect, test } from "@playwright/test";
import { recordCalibrationAiCall, withCalibrationAiCalls } from "../../src/lib/ai/calibration-audit";

test("калибровочный аудит хранит только метаданные своего запуска", async () => {
  const first = await withCalibrationAiCalls(async () => {
    recordCalibrationAiCall({ stage: "extract", provider: "openai", model: "test-model", status: "success" });
    return 42;
  });
  const second = await withCalibrationAiCalls(async () => "next");
  expect(first).toEqual({ value: 42, calls: [{ stage: "extract", provider: "openai", model: "test-model", status: "success" }] });
  expect(second).toEqual({ value: "next", calls: [] });
});
