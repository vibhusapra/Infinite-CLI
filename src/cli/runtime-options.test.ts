import test from "node:test";
import assert from "node:assert/strict";
import { resolveRuntimeGenerationConfig } from "./runtime-options.js";

test("resolveRuntimeGenerationConfig fast mode defaults to one agent", () => {
  const runtime = resolveRuntimeGenerationConfig(
    {
      candidateCount: 4,
      codexTimeoutMs: 240_000,
      keepWorktrees: false
    },
    { fast: true }
  );

  assert.equal(runtime.candidateCount, 1);
  assert.equal(runtime.codexTimeoutMs, 120_000);
});

test("resolveRuntimeGenerationConfig debug forces keepWorktrees", () => {
  const runtime = resolveRuntimeGenerationConfig(
    {
      candidateCount: 2,
      codexTimeoutMs: 240_000,
      keepWorktrees: false
    },
    { debug: true }
  );

  assert.equal(runtime.keepWorktrees, true);
});

