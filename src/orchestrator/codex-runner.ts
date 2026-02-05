import { mkdirSync } from "node:fs";
import path from "node:path";
import { runCommand, type RunCommandResult } from "../runtime/command-runner.js";

export interface CodexRunInput {
  codexBinary: string;
  codexModel: string;
  timeoutMs: number;
  worktreeDir: string;
  outputDir: string;
  outputLastMessagePath: string;
  prompt: string;
}

export interface CodexRunResult {
  process: RunCommandResult;
}

export async function runCodexExec(input: CodexRunInput): Promise<CodexRunResult> {
  mkdirSync(path.dirname(input.outputLastMessagePath), { recursive: true });

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

  const preferredArgs = ["exec", "--model", input.codexModel, ...baseArgs];

  let commandResult = await runCommand(input.codexBinary, preferredArgs, {
    cwd: input.worktreeDir,
    timeoutMs: input.timeoutMs,
    env: process.env
  });

  if (shouldRetryWithFallbackModel(commandResult) && input.codexModel !== "gpt-5-codex") {
    const fallbackArgs = ["exec", "--model", "gpt-5-codex", ...baseArgs];
    commandResult = await runCommand(input.codexBinary, fallbackArgs, {
      cwd: input.worktreeDir,
      timeoutMs: input.timeoutMs,
      env: process.env
    });
  }

  return {
    process: commandResult
  };
}

function shouldRetryWithFallbackModel(result: RunCommandResult): boolean {
  if (result.exitCode === 0) {
    return false;
  }

  const combined = `${result.stderr}\n${result.stdout}`.toLowerCase();
  return combined.includes("model_not_found") || combined.includes("does not exist");
}
