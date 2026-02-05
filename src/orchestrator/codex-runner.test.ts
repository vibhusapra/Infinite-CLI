import test from "node:test";
import assert from "node:assert/strict";
import { classifyFailure } from "./codex-runner.js";
import type { RunCommandResult } from "../runtime/command-runner.js";

function resultWith(output: { stdout?: string; stderr?: string; timedOut?: boolean; exitCode?: number }): RunCommandResult {
  return {
    command: "codex",
    args: ["exec"],
    cwd: "/tmp",
    startedAt: "2026-01-01T00:00:00.000Z",
    endedAt: "2026-01-01T00:00:01.000Z",
    exitCode: output.exitCode ?? 1,
    signal: null,
    timedOut: output.timedOut ?? false,
    stdout: output.stdout ?? "",
    stderr: output.stderr ?? ""
  };
}

test("classifyFailure detects model_not_found", () => {
  const kind = classifyFailure(resultWith({ stderr: "error: model_not_found" }));
  assert.equal(kind, "model_not_found");
  const unsupported = classifyFailure(
    resultWith({ stderr: "The 'abc' model is not supported when using Codex with a ChatGPT account." })
  );
  assert.equal(unsupported, "model_not_found");
});

test("classifyFailure detects unsupported reasoning config", () => {
  const kind = classifyFailure(
    resultWith({
      stderr: "Unsupported value: 'xhigh' ... param: \"reasoning.effort\" code: unsupported_value"
    })
  );
  assert.equal(kind, "unsupported_value");
});

test("classifyFailure detects timeout and transient", () => {
  assert.equal(classifyFailure(resultWith({ timedOut: true })), "timeout");
  assert.equal(classifyFailure(resultWith({ stderr: "429 rate limit exceeded" })), "transient");
});

test("classifyFailure returns none for success", () => {
  const kind = classifyFailure(resultWith({ exitCode: 0 }));
  assert.equal(kind, "none");
});
