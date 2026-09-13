import { execFileSync, spawnSync } from "node:child_process";

export function calibrationProvenance() {
  return {
    sourceSha: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    codeWorktreeDirty: spawnSync("git", ["diff", "--quiet", "HEAD", "--", "src", "tests/persona", "tests/vacancy", "tests/e2e"]).status !== 0,
  };
}
