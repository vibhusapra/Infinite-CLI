import test from "node:test";
import assert from "node:assert/strict";
import { loadInfiniteConfig } from "./env.js";

test("loadInfiniteConfig parses adaptive orchestration settings", () => {
  const config = loadInfiniteConfig({
    OPENAI_API_KEY: "sk-test",
    INFINITE_CODEX_BIN: "codex",
    INFINITE_CODEX_MODEL: "gpt-5.3-codex",
    INFINITE_CANDIDATE_COUNT: "3",
    INFINITE_CODEX_TIMEOUT_MS: "120000",
    INFINITE_KEEP_WORKTREES: "true",
    INFINITE_STRATEGY: "parallel",
    INFINITE_SCORE_CUTOFF: "95",
    INFINITE_RETRY_BUDGET: "1",
    INFINITE_FANOUT_DELAY_MS: "250",
    INFINITE_NARRATOR_MODEL: "gpt-5-mini",
    INFINITE_NARRATOR_FLUSH_MS: "4000"
  });

  assert.equal(config.strategy, "parallel");
  assert.equal(config.scoreCutoff, 95);
  assert.equal(config.retryBudget, 1);
  assert.equal(config.fanoutDelayMs, 250);
  assert.equal(config.keepWorktrees, true);
});

test("loadInfiniteConfig bounds invalid adaptive settings", () => {
  const config = loadInfiniteConfig({
    INFINITE_STRATEGY: "unknown",
    INFINITE_SCORE_CUTOFF: "999",
    INFINITE_RETRY_BUDGET: "9",
    INFINITE_FANOUT_DELAY_MS: "-10"
  });

  assert.equal(config.strategy, "adaptive");
  assert.equal(config.scoreCutoff, 200);
  assert.equal(config.retryBudget, 2);
  assert.equal(config.fanoutDelayMs, 0);
});
