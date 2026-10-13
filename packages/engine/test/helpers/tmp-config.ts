/**
 * Stand-in for `src/config.ts` in tests.
 *
 * The real module resolves ROOT to the repo checkout and loads `.env`, so any
 * test that touched the store would write into the real `data/jobs`. Each test
 * file that needs the filesystem mocks `../src/config` with this module via
 * `vi.mock("../src/config", () => import("./helpers/tmp-config"))`; every
 * worker gets its own module registry, so every test file gets its own
 * disposable root.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "filmwright-test-"));
export const PROJECTS_DIR = path.join(ROOT, "projects");
export const DATA_DIR = path.join(ROOT, "data");
export const JOBS_DIR = path.join(DATA_DIR, "jobs");
fs.mkdirSync(PROJECTS_DIR, { recursive: true });
fs.mkdirSync(JOBS_DIR, { recursive: true });

export const config = {
  model: "test-model",
  effort: "high",
  workerModel: "test-worker-model",
  workerEffort: "medium",
  workerConcurrency: 2,
  workerMaxTurns: 10,
  skillsDir: path.join(ROOT, "skills"),
  checkStrict: false,
  judge: true,
  judgeModel: "test-judge-model",
  judgeEffort: "medium",
  judgeRounds: 2,
  judgeBudgetUsd: 1,
  maxBudgetUsd: 25,
  timeoutMs: 90 * 60_000,
  hyperframesVersion: "0.0.0-test",
  renderer: "local",
  pollMs: 25,
  durationTolerance: 0.2,
  answerGraceMs: 500,
  answerGraceWatchedMs: 5_000,
  viewerFreshMs: 1_000,
  interactiveByDefault: true,
  autoContinue: 0,
} as const;

export const hyperframes = `hyperframes@${config.hyperframesVersion}`;
