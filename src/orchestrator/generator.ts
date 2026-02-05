import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildCodexPrompt, deriveFallbackToolName, normalizeManifest, sanitizeToolName } from "./spec.js";
import { WorktreeManager } from "./worktree-manager.js";
import { runCodexExec } from "./codex-runner.js";
import { evaluateCandidate } from "./evaluator.js";
import type {
  CandidateEvaluation,
  CandidatePaths,
  GenerationRequest,
  GenerationResult,
  GenerationSettings,
  OrchestratorContext
} from "./types.js";
import { Registry } from "../registry/registry.js";

interface GenerateToolInput {
  request: GenerationRequest;
  settings: GenerationSettings;
  context: OrchestratorContext;
  registry: Registry;
}

export async function generateToolFromIntent(input: GenerateToolInput): Promise<GenerationResult> {
  const jobId = createJobId();
  const jobDir = path.join(input.context.paths.jobsDir, jobId);
  mkdirSync(jobDir, { recursive: true });

  const worktreeManager = new WorktreeManager(input.context.repoRoot, input.context.paths.worktreesDir);

  const candidatePromises = Array.from({ length: input.settings.candidateCount }, (_, index) => {
    const candidateIndex = index + 1;
    return runCandidate({
      candidateIndex,
      jobId,
      jobDir,
      request: input.request,
      settings: input.settings,
      context: input.context,
      worktreeManager
    });
  });

  const allCandidates = await Promise.all(candidatePromises);
  const selectedCandidate = selectBestCandidate(allCandidates);

  if (!selectedCandidate) {
    const failureSummary = allCandidates
      .map((candidate) => `${candidate.candidateId}: score=${candidate.score} (${candidate.summary})`)
      .join("\n");
    throw new Error(`No valid candidate produced a runnable tool.\n${failureSummary}`);
  }

  const selectedManifest = selectedCandidate.manifest ?? normalizeManifest(null, input.request.intent);
  const toolName = sanitizeToolName(selectedManifest.name || deriveFallbackToolName(input.request.intent));

  const nextVersion = input.registry.getNextVersion(toolName);
  const installDir = path.join(input.context.paths.toolsDir, toolName, `v${nextVersion}`);
  rmSync(installDir, { recursive: true, force: true });
  mkdirSync(path.dirname(installDir), { recursive: true });
  cpSync(selectedCandidate.outputDir, installDir, { recursive: true });

  const entrypointAbsolutePath = path.join(installDir, selectedManifest.entrypoint || "tool.py");
  if (!existsSync(entrypointAbsolutePath)) {
    throw new Error(`Selected candidate is missing entrypoint: ${entrypointAbsolutePath}`);
  }

  const relativeCodePath = toPosixPath(path.relative(input.context.paths.rootDir, entrypointAbsolutePath));
  const toolVersionId = input.registry.upsertToolVersion({
    name: toolName,
    version: nextVersion,
    manifest: selectedManifest,
    codePath: relativeCodePath,
    score: selectedCandidate.score
  });

  // Preserve candidate details for debugging and handoff.
  const selectionPath = path.join(jobDir, "selection.json");
  writeFileSync(
    selectionPath,
    JSON.stringify(
      {
        selectedCandidate: selectedCandidate.candidateId,
        selectedScore: selectedCandidate.score,
        candidates: allCandidates.map((candidate) => ({
          candidateId: candidate.candidateId,
          score: candidate.score,
          summary: candidate.summary,
          isValid: candidate.isValid
        }))
      },
      null,
      2
    ),
    "utf8"
  );

  return {
    jobId,
    toolName,
    version: nextVersion,
    codePath: entrypointAbsolutePath,
    toolVersionId,
    selectedCandidate,
    allCandidates
  };
}

interface RunCandidateInput {
  candidateIndex: number;
  jobId: string;
  jobDir: string;
  request: GenerationRequest;
  settings: GenerationSettings;
  context: OrchestratorContext;
  worktreeManager: WorktreeManager;
}

async function runCandidate(input: RunCandidateInput): Promise<CandidateEvaluation> {
  const candidateId = `candidate-${input.candidateIndex}`;
  const paths = createCandidatePaths(input.jobDir, input.jobId, candidateId);
  mkdirSync(paths.outputDir, { recursive: true });

  let worktreeHandle: { path: string; remove: () => Promise<void> } | null = null;
  const start = Date.now();

  try {
    worktreeHandle = await input.worktreeManager.create(input.jobId, candidateId);
    paths.worktreeDir = worktreeHandle.path;

    const prompt = buildCodexPrompt({
      intent: input.request.intent,
      clarification: input.request.clarification,
      outputDir: paths.outputDir,
      candidateId
    });

    const codexResult = await runCodexExec({
      codexBinary: input.settings.codexBinary,
      codexModel: input.settings.codexModel,
      timeoutMs: input.settings.codexTimeoutMs,
      worktreeDir: worktreeHandle.path,
      outputDir: paths.outputDir,
      outputLastMessagePath: paths.codexLastMessagePath,
      prompt
    });

    const evaluation = await evaluateCandidate({
      candidateId,
      intent: input.request.intent,
      paths,
      codexResult: codexResult.process,
      elapsedMs: Date.now() - start
    });

    return evaluation;
  } catch (error) {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    writeFileSync(paths.codexStderrPath, message, "utf8");
    writeFileSync(paths.codexStdoutPath, "", "utf8");
    writeFileSync(paths.compileStdoutPath, "", "utf8");
    writeFileSync(paths.compileStderrPath, "Not executed due to candidate failure", "utf8");
    writeFileSync(paths.smokeStdoutPath, "", "utf8");
    writeFileSync(paths.smokeStderrPath, "Not executed due to candidate failure", "utf8");

    return {
      candidateId,
      outputDir: paths.outputDir,
      manifest: null,
      entrypointPath: null,
      smokeTestPath: null,
      codexExitCode: 1,
      compileExitCode: null,
      smokeExitCode: null,
      score: -999,
      isValid: false,
      summary: "candidate-crashed",
      elapsedMs: Date.now() - start,
      logs: {
        codexStdoutPath: paths.codexStdoutPath,
        codexStderrPath: paths.codexStderrPath,
        compileStdoutPath: paths.compileStdoutPath,
        compileStderrPath: paths.compileStderrPath,
        smokeStdoutPath: paths.smokeStdoutPath,
        smokeStderrPath: paths.smokeStderrPath
      }
    };
  } finally {
    if (worktreeHandle && !input.settings.keepWorktrees) {
      try {
        await worktreeHandle.remove();
      } catch {
        // ignore cleanup failures
      }
    }
  }
}

function createCandidatePaths(jobDir: string, jobId: string, candidateId: string): CandidatePaths {
  const candidateDir = path.join(jobDir, candidateId);
  const logsDir = path.join(candidateDir, "logs");
  const outputDir = path.join(candidateDir, "output");
  mkdirSync(logsDir, { recursive: true });
  mkdirSync(outputDir, { recursive: true });

  return {
    candidateId,
    jobId,
    outputDir,
    worktreeDir: "",
    codexLastMessagePath: path.join(logsDir, "codex-last-message.txt"),
    codexStdoutPath: path.join(logsDir, "codex-stdout.log"),
    codexStderrPath: path.join(logsDir, "codex-stderr.log"),
    compileStdoutPath: path.join(logsDir, "compile-stdout.log"),
    compileStderrPath: path.join(logsDir, "compile-stderr.log"),
    smokeStdoutPath: path.join(logsDir, "smoke-stdout.log"),
    smokeStderrPath: path.join(logsDir, "smoke-stderr.log")
  };
}

function selectBestCandidate(candidates: CandidateEvaluation[]): CandidateEvaluation | null {
  const valid = candidates.filter((candidate) => candidate.isValid);
  if (valid.length === 0) {
    return null;
  }

  valid.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.elapsedMs - b.elapsedMs;
  });
  return valid[0] ?? null;
}

function createJobId(): string {
  const now = new Date();
  const ts = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(
    now.getUTCDate()
  ).padStart(2, "0")}-${String(now.getUTCHours()).padStart(2, "0")}${String(now.getUTCMinutes()).padStart(
    2,
    "0"
  )}${String(now.getUTCSeconds()).padStart(2, "0")}`;
  const random = Math.random().toString(36).slice(2, 8);
  return `job-${ts}-${random}`;
}

function toPosixPath(value: string): string {
  return value.split(path.sep).join("/");
}
