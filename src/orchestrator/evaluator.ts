import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { runCommand, type RunCommandResult } from "../runtime/command-runner.js";
import { normalizeManifest } from "./spec.js";
import type { CandidateEvaluation, CandidatePaths, ToolManifest } from "./types.js";

interface EvaluateCandidateInput {
  candidateId: string;
  intent: string;
  paths: CandidatePaths;
  codexResult: RunCommandResult;
  elapsedMs: number;
}

export async function evaluateCandidate(input: EvaluateCandidateInput): Promise<CandidateEvaluation> {
  mkdirSync(input.paths.outputDir, { recursive: true });

  const manifestPath = path.join(input.paths.outputDir, "manifest.json");
  const toolPath = path.join(input.paths.outputDir, "tool.py");
  const smokePath = path.join(input.paths.outputDir, "smoke_test.py");

  writeFileSync(input.paths.codexStdoutPath, input.codexResult.stdout, "utf8");
  writeFileSync(input.paths.codexStderrPath, input.codexResult.stderr, "utf8");

  let manifest: ToolManifest | null = null;
  if (existsSync(manifestPath)) {
    try {
      const raw = JSON.parse(readFileSync(manifestPath, "utf8")) as unknown;
      manifest = normalizeManifest(raw, input.intent);
    } catch {
      manifest = null;
    }
  }

  const entrypointPath = existsSync(toolPath) ? toolPath : null;
  const smokeTestPath = existsSync(smokePath) ? smokePath : null;

  let compileExitCode: number | null = null;
  let smokeExitCode: number | null = null;

  if (entrypointPath) {
    const compileResult = await runCommand("python3", ["-m", "py_compile", entrypointPath], {
      cwd: input.paths.outputDir,
      timeoutMs: 20_000
    });
    compileExitCode = compileResult.exitCode;
    writeFileSync(input.paths.compileStdoutPath, compileResult.stdout, "utf8");
    writeFileSync(input.paths.compileStderrPath, compileResult.stderr, "utf8");
  } else {
    writeFileSync(input.paths.compileStdoutPath, "", "utf8");
    writeFileSync(input.paths.compileStderrPath, "Missing tool.py", "utf8");
  }

  if (smokeTestPath) {
    const smokeResult = await runCommand("python3", [smokeTestPath], {
      cwd: input.paths.outputDir,
      timeoutMs: 30_000,
      env: {
        ...process.env,
        INFINITE_TOOL_PATH: entrypointPath ?? "",
        INFINITE_MANIFEST_PATH: manifestPath
      }
    });
    smokeExitCode = smokeResult.exitCode;
    writeFileSync(input.paths.smokeStdoutPath, smokeResult.stdout, "utf8");
    writeFileSync(input.paths.smokeStderrPath, smokeResult.stderr, "utf8");
  } else {
    writeFileSync(input.paths.smokeStdoutPath, "", "utf8");
    writeFileSync(input.paths.smokeStderrPath, "Missing smoke_test.py", "utf8");
  }

  const scoreDetails = scoreCandidate({
    codexExitCode: input.codexResult.exitCode,
    manifestExists: manifest !== null,
    entrypointExists: entrypointPath !== null,
    compileExitCode,
    smokeExitCode,
    elapsedMs: input.elapsedMs
  });

  return {
    candidateId: input.candidateId,
    outputDir: input.paths.outputDir,
    manifest,
    entrypointPath,
    smokeTestPath,
    codexExitCode: input.codexResult.exitCode,
    compileExitCode,
    smokeExitCode,
    score: scoreDetails.score,
    isValid: scoreDetails.isValid,
    summary: scoreDetails.summary,
    elapsedMs: input.elapsedMs,
    logs: {
      codexLastMessagePath: input.paths.codexLastMessagePath,
      codexStdoutPath: input.paths.codexStdoutPath,
      codexStderrPath: input.paths.codexStderrPath,
      compileStdoutPath: input.paths.compileStdoutPath,
      compileStderrPath: input.paths.compileStderrPath,
      smokeStdoutPath: input.paths.smokeStdoutPath,
      smokeStderrPath: input.paths.smokeStderrPath
    }
  };
}

export interface CandidateScoreInput {
  codexExitCode: number;
  manifestExists: boolean;
  entrypointExists: boolean;
  compileExitCode: number | null;
  smokeExitCode: number | null;
  elapsedMs: number;
}

interface CandidateScoreResult {
  score: number;
  isValid: boolean;
  summary: string;
}

export function scoreCandidate(input: CandidateScoreInput): CandidateScoreResult {
  let score = 0;
  const notes: string[] = [];

  if (input.codexExitCode === 0) {
    score += 20;
    notes.push("codex-ok");
  } else {
    score -= 60;
    notes.push("codex-failed");
  }

  if (input.manifestExists) {
    score += 20;
    notes.push("manifest-ok");
  } else {
    score -= 20;
    notes.push("manifest-missing");
  }

  if (input.entrypointExists) {
    score += 25;
    notes.push("entrypoint-ok");
  } else {
    score -= 40;
    notes.push("entrypoint-missing");
  }

  if (input.compileExitCode === 0) {
    score += 25;
    notes.push("compile-ok");
  } else {
    score -= 30;
    notes.push("compile-failed");
  }

  if (input.smokeExitCode === 0) {
    score += 20;
    notes.push("smoke-ok");
  } else {
    score -= 15;
    notes.push("smoke-failed");
  }

  // Light penalty to prefer faster candidates.
  const latencyPenalty = Math.min(20, Math.floor(input.elapsedMs / 3_000));
  score -= latencyPenalty;

  const isValid =
    input.codexExitCode === 0 &&
    input.manifestExists &&
    input.entrypointExists &&
    input.compileExitCode === 0 &&
    input.smokeExitCode === 0;

  return {
    score,
    isValid,
    summary: notes.join(",")
  };
}
