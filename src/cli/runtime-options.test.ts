import test from "node:test";
import assert from "node:assert/strict";
import { parseStrategyOption, resolveRuntimeGenerationConfig } from "./runtime-options.js";

test("resolveRuntimeGenerationConfig fast mode defaults to one agent", () => {
  const runtime = resolveRuntimeGenerationConfig(
    {
      candidateCount: 4,
      codexTimeoutMs: 240_000,
      keepWorktrees: false,
      strategy: "adaptive",
      scoreCutoff: 90,
      retryBudget: 2,
      fanoutDelayMs: 0
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
      keepWorktrees: false,
      strategy: "adaptive",
      scoreCutoff: 90,
      retryBudget: 2,
      fanoutDelayMs: 0
    },
    { debug: true }
  );

  assert.equal(runtime.keepWorktrees, true);
});

test("resolveRuntimeGenerationConfig applies strategy and bounded retry config", () => {
  const runtime = resolveRuntimeGenerationConfig(
    {
      candidateCount: 2,
      codexTimeoutMs: 240_000,
      keepWorktrees: false,
      strategy: "adaptive",
      scoreCutoff: 90,
      retryBudget: 2,
      fanoutDelayMs: 0
    },
    { strategy: "parallel", retryBudget: 99, scoreCutoff: 20, fanoutDelayMs: -1 }
  );

  assert.equal(runtime.strategy, "parallel");
  assert.equal(runtime.retryBudget, 2);
  assert.equal(runtime.scoreCutoff, 50);
  assert.equal(runtime.fanoutDelayMs, 0);
});

test("parseStrategyOption accepts adaptive and parallel", () => {
  assert.equal(parseStrategyOption("adaptive"), "adaptive");
  assert.equal(parseStrategyOption("parallel"), "parallel");
  assert.throws(() => parseStrategyOption("fast"));
});
