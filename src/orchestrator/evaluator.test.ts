import test from "node:test";
import assert from "node:assert/strict";
import { scoreCandidate } from "./evaluator.js";

test("scoreCandidate marks fully healthy candidate as valid", () => {
  const result = scoreCandidate({
    codexExitCode: 0,
    manifestExists: true,
    entrypointExists: true,
    compileExitCode: 0,
    smokeExitCode: 0,
    elapsedMs: 2_000
  });

  assert.equal(result.isValid, true);
  assert.ok(result.score > 0);
});

test("scoreCandidate marks failed compile as invalid", () => {
  const result = scoreCandidate({
    codexExitCode: 0,
    manifestExists: true,
    entrypointExists: true,
    compileExitCode: 1,
    smokeExitCode: 0,
    elapsedMs: 2_000
  });

  assert.equal(result.isValid, false);
  assert.ok(result.score < 90);
});

