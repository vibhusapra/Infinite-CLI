import { mkdirSync } from "node:fs";
import path from "node:path";
import { runCommand, type RunCommandResult } from "../runtime/command-runner.js";
import type { CandidateFailureKind } from "./types.js";

export interface CodexRunInput {
  codexBinary: string;
  codexModel: string;
  timeoutMs: number;
  retryBudget: number;
  worktreeDir: string;
  outputDir: string;
  outputLastMessagePath: string;
  prompt: string;
  onRetry?: (event: {
    attempt: number;
    model: string;
    reason: CandidateFailureKind;
    message: string;
  }) => void;
}

export interface CodexRunResult {
  process: RunCommandResult;
  attempts: number;
  failureKind: CandidateFailureKind;
}

export async function runCodexExec(input: CodexRunInput): Promise<CodexRunResult> {
  mkdirSync(path.dirname(input.outputLastMessagePath), { recursive: true });

  const models = uniqueModels([input.codexModel, "gpt-5-codex"]);
  let attempts = 0;
  let retriesRemaining = input.retryBudget;
  let lastResult: RunCommandResult | null = null;
  let lastFailureKind: CandidateFailureKind = "unknown";

  for (let modelIndex = 0; modelIndex < models.length; modelIndex += 1) {
    const model = models[modelIndex]!;
    const modelAttempts = await runWithModel({
      ...input,
      model,
      retriesRemaining,
      onRetry: (event) => {
        input.onRetry?.(event);
        retriesRemaining = Math.max(0, retriesRemaining - 1);
      }
    });

    attempts += modelAttempts.attempts;
    lastResult = modelAttempts.process;
    lastFailureKind = modelAttempts.failureKind;

    if (modelAttempts.process.exitCode === 0) {
      return {
        process: modelAttempts.process,
        attempts,
        failureKind: "none"
      };
    }

    if (modelAttempts.failureKind === "model_not_found" && modelIndex < models.length - 1) {
      input.onRetry?.({
        attempt: attempts + 1,
        model: models[modelIndex + 1]!,
        reason: "model_not_found",
        message: `retrying with fallback model ${models[modelIndex + 1]}`
      });
      continue;
    }

    if (!isRetriableFailure(modelAttempts.failureKind) || retriesRemaining === 0) {
      break;
    }
  }

  return {
    process: lastResult ?? makeFallbackResult(input.codexBinary, input.codexModel, input.worktreeDir),
    attempts,
    failureKind: lastFailureKind
  };
}

interface RunWithModelInput extends CodexRunInput {
  model: string;
  retriesRemaining: number;
}

async function runWithModel(input: RunWithModelInput): Promise<CodexRunResult> {
  const baseArgs = [
    "--dangerously-bypass-approvals-and-sandbox",
    "--cd",
    input.worktreeDir,
    "--add-dir",
    input.outputDir,
    "--output-last-message",
    input.outputLastMessagePath,
    input.prompt
  ];

  let attempts = 0;
  let retriesRemaining = input.retriesRemaining;
  let commandResult: RunCommandResult | null = null;
  let failureKind: CandidateFailureKind = "unknown";

  while (true) {
    attempts += 1;
    const args = [
      "exec",
      "--model",
      input.model,
      "-c",
      'model_reasoning_effort="high"',
      ...baseArgs
    ];
    commandResult = await runCommand(input.codexBinary, args, {
      cwd: input.worktreeDir,
      timeoutMs: input.timeoutMs,
      env: process.env
    });

    failureKind = classifyFailure(commandResult);
    if (commandResult.exitCode === 0) {
      return {
        process: commandResult,
        attempts,
        failureKind: "none"
      };
    }

    if (!isRetriableFailure(failureKind) || retriesRemaining === 0) {
      break;
    }

    retriesRemaining -= 1;
    input.onRetry?.({
      attempt: attempts + 1,
      model: input.model,
      reason: failureKind,
      message: `retrying attempt ${attempts + 1} after ${failureKind}`
    });
    await sleep(backoffMs(attempts));
  }

  return {
    process: commandResult ?? makeFallbackResult(input.codexBinary, input.model, input.worktreeDir),
    attempts,
    failureKind
  };
}

export function classifyFailure(result: RunCommandResult): CandidateFailureKind {
  if (result.exitCode === 0) {
    return "none";
  }

  const combined = `${result.stderr}\n${result.stdout}`.toLowerCase();
  if (combined.includes("model_not_found") || combined.includes("does not exist")) {
    return "model_not_found";
  }
  if (
    combined.includes("model is not supported") ||
    combined.includes("not supported when using codex")
  ) {
    return "model_not_found";
  }
  if (
    combined.includes("unsupported value") ||
    combined.includes("invalid_request_error") ||
    combined.includes("param\": \"reasoning.effort\"")
  ) {
    return "unsupported_value";
  }
  if (result.timedOut || combined.includes("timed out") || combined.includes("timeout")) {
    return "timeout";
  }
  if (
    combined.includes("rate limit") ||
    combined.includes("429") ||
    combined.includes("temporarily unavailable") ||
    combined.includes("connection") ||
    combined.includes("network")
  ) {
    return "transient";
  }
  return "unknown";
}

function isRetriableFailure(failureKind: CandidateFailureKind): boolean {
  return failureKind === "unsupported_value" || failureKind === "transient" || failureKind === "timeout";
}

function uniqueModels(models: string[]): string[] {
  const unique = new Set<string>();
  for (const model of models) {
    const trimmed = model.trim();
    if (trimmed.length > 0) {
      unique.add(trimmed);
    }
  }
  return [...unique];
}

function backoffMs(attempt: number): number {
  return Math.min(2500, 300 * attempt);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeFallbackResult(command: string, model: string, cwd: string): RunCommandResult {
  const now = new Date().toISOString();
  return {
    command,
    args: ["exec", "--model", model],
    cwd,
    startedAt: now,
    endedAt: now,
    exitCode: 1,
    signal: null,
    timedOut: false,
    stdout: "",
    stderr: "codex run did not execute"
  };
}
