import test from "node:test";
import assert from "node:assert/strict";
import { isEarlyStopCandidate } from "./generator.js";
import type { CandidateEvaluation } from "./types.js";

function makeCandidate(partial: Partial<CandidateEvaluation>): CandidateEvaluation {
  return {
    candidateId: "candidate-1",
    outputDir: "/tmp/out",
    manifest: null,
    entrypointPath: null,
    smokeTestPath: null,
    codexExitCode: 0,
    compileExitCode: 0,
    smokeExitCode: 0,
    score: 90,
    isValid: true,
    summary: "ok",
    elapsedMs: 1000,
    attempts: 1,
    failureKind: "none",
    logs: {
      codexLastMessagePath: "",
      codexStdoutPath: "",
      codexStderrPath: "",
      compileStdoutPath: "",
      compileStderrPath: "",
      smokeStdoutPath: "",
      smokeStderrPath: ""
    },
    ...partial
  };
}

test("isEarlyStopCandidate requires valid + score cutoff", () => {
  assert.equal(isEarlyStopCandidate(makeCandidate({ isValid: true, score: 90 }), 90), true);
  assert.equal(isEarlyStopCandidate(makeCandidate({ isValid: true, score: 89 }), 90), false);
  assert.equal(isEarlyStopCandidate(makeCandidate({ isValid: false, score: 120 }), 90), false);
});
