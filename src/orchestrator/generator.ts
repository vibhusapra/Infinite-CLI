import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { buildCodexPrompt, deriveFallbackToolName, normalizeManifest, sanitizeToolName } from "./spec.js";
import { WorktreeManager } from "./worktree-manager.js";
import { runCodexExec } from "./codex-runner.js";
import { evaluateCandidate } from "./evaluator.js";
import type {
  CandidateEvaluation,
  CandidatePaths,
  GenerationProgressReporter,
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
  reporter?: GenerationProgressReporter;
}

export async function generateToolFromIntent(input: GenerateToolInput): Promise<GenerationResult> {
  const jobId = createJobId();
  const jobDir = path.join(input.context.paths.jobsDir, jobId);
  mkdirSync(jobDir, { recursive: true });
  input.reporter?.({
    phase: "job-started",
    jobId,
    message: `Created generation job ${jobId}`
  });

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
      worktreeManager,
      reporter: input.reporter
    });
  });

  const allCandidates = await Promise.all(candidatePromises);
  const selectedCandidate = selectBestCandidate(allCandidates);

  if (!selectedCandidate) {
    throw new GenerationFailureError(jobId, jobDir, allCandidates);
  }

  input.reporter?.({
    phase: "selection-complete",
    jobId,
    message: `Selected ${selectedCandidate.candidateId} with score=${selectedCandidate.score}`
  });

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

  input.reporter?.({
    phase: "promotion-complete",
    jobId,
    message: `Promoted ${toolName} v${nextVersion}`
  });

  return {
    jobId,
    jobDir,
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
  reporter?: GenerationProgressReporter;
}

async function runCandidate(input: RunCandidateInput): Promise<CandidateEvaluation> {
  const candidateId = `candidate-${input.candidateIndex}`;
  const paths = createCandidatePaths(input.jobDir, input.jobId, candidateId);
  mkdirSync(paths.outputDir, { recursive: true });

  let worktreeHandle: { path: string; remove: () => Promise<void> } | null = null;
  let heartbeat: NodeJS.Timeout | null = null;
  const start = Date.now();

  try {
    input.reporter?.({
      phase: "candidate-started",
      jobId: input.jobId,
      candidateId,
      message: `${candidateId}: creating isolated worktree`
    });

    worktreeHandle = await input.worktreeManager.create(input.jobId, candidateId);
    paths.worktreeDir = worktreeHandle.path;

    const prompt = buildCodexPrompt({
      intent: input.request.intent,
      clarification: input.request.clarification,
      outputDir: path.join(worktreeHandle.path, "_infinite_output"),
      candidateId
    });

    input.reporter?.({
      phase: "candidate-codex-running",
      jobId: input.jobId,
      candidateId,
      message: `${candidateId}: running codex exec`
    });

    heartbeat = startHeartbeat(() => {
      input.reporter?.({
        phase: "candidate-codex-heartbeat",
        jobId: input.jobId,
        candidateId,
        message: `${candidateId}: still generating...`
      });
    });

    const codexResult = await runCodexExec({
      codexBinary: input.settings.codexBinary,
      codexModel: input.settings.codexModel,
      timeoutMs: input.settings.codexTimeoutMs,
      worktreeDir: worktreeHandle.path,
      outputDir: path.join(worktreeHandle.path, "_infinite_output"),
      outputLastMessagePath: paths.codexLastMessagePath,
      prompt
    });
    stopHeartbeat(heartbeat);
    heartbeat = null;

    input.reporter?.({
      phase: "candidate-codex-finished",
      jobId: input.jobId,
      candidateId,
      message: `${candidateId}: codex finished with exit=${codexResult.process.exitCode}`
    });

    input.reporter?.({
      phase: "candidate-evaluating",
      jobId: input.jobId,
      candidateId,
      message: `${candidateId}: collecting generated files and running validation`
    });

    const artifactSource = syncCandidateArtifacts({
      outputDir: paths.outputDir,
      worktreeDir: worktreeHandle.path,
      jobId: input.jobId,
      candidateId
    });
    input.reporter?.({
      phase: "candidate-evaluating",
      jobId: input.jobId,
      candidateId,
      message: `${candidateId}: artifacts source=${artifactSource}`
    });

    const evaluation = await evaluateCandidate({
      candidateId,
      intent: input.request.intent,
      paths,
      codexResult: codexResult.process,
      elapsedMs: Date.now() - start
    });

    input.reporter?.({
      phase: "candidate-finished",
      jobId: input.jobId,
      candidateId,
      message: `${candidateId}: score=${evaluation.score} (${evaluation.summary})`
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

    input.reporter?.({
      phase: "candidate-failed",
      jobId: input.jobId,
      candidateId,
      message: `${candidateId}: crashed before completion`
    });

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
        codexLastMessagePath: paths.codexLastMessagePath,
        codexStdoutPath: paths.codexStdoutPath,
        codexStderrPath: paths.codexStderrPath,
        compileStdoutPath: paths.compileStdoutPath,
        compileStderrPath: paths.compileStderrPath,
        smokeStdoutPath: paths.smokeStdoutPath,
        smokeStderrPath: paths.smokeStderrPath
      }
    };
  } finally {
    if (heartbeat) {
      stopHeartbeat(heartbeat);
    }

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

export class GenerationFailureError extends Error {
  constructor(
    public readonly jobId: string,
    public readonly jobDir: string,
    public readonly candidates: CandidateEvaluation[]
  ) {
    super(buildFailureMessage(candidates));
    this.name = "GenerationFailureError";
  }
}

function buildFailureMessage(candidates: CandidateEvaluation[]): string {
  const details = candidates
    .map((candidate) => `${candidate.candidateId}: score=${candidate.score} (${candidate.summary})`)
    .join("\n");
  return `No valid candidate produced a runnable tool.\n${details}`;
}

function startHeartbeat(onTick: () => void): NodeJS.Timeout {
  return setInterval(onTick, 5000);
}

function stopHeartbeat(timer: NodeJS.Timeout): void {
  clearInterval(timer);
}

type SyncArtifactsInput = {
  outputDir: string;
  worktreeDir: string;
  jobId: string;
  candidateId: string;
};

function syncCandidateArtifacts(input: SyncArtifactsInput): string {
  mkdirSync(input.outputDir, { recursive: true });

  const requiredFiles = ["tool.py", "manifest.json", "smoke_test.py"];

  const directCandidatePaths = [
    input.outputDir,
    path.join(input.worktreeDir, "_infinite_output"),
    path.join(input.worktreeDir, ".infinite", "jobs", input.jobId, input.candidateId, "output"),
    path.join(input.worktreeDir, "output")
  ];

  for (const sourceDir of directCandidatePaths) {
    if (directoryHasRequiredFiles(sourceDir, requiredFiles)) {
      copyRequiredFiles(sourceDir, input.outputDir, requiredFiles);
      return sourceDir;
    }
  }

  const scanned = findLikelyArtifactDir(input.worktreeDir, requiredFiles);
  if (scanned) {
    copyRequiredFiles(scanned, input.outputDir, requiredFiles);
    return scanned;
  }

  return "not-found";
}

function directoryHasRequiredFiles(directory: string, requiredFiles: string[]): boolean {
  if (!existsSync(directory)) {
    return false;
  }

  return requiredFiles.every((file) => existsSync(path.join(directory, file)));
}

function copyRequiredFiles(sourceDir: string, destinationDir: string, requiredFiles: string[]): void {
  mkdirSync(destinationDir, { recursive: true });
  for (const file of requiredFiles) {
    cpSync(path.join(sourceDir, file), path.join(destinationDir, file));
  }
}

function findLikelyArtifactDir(rootDir: string, requiredFiles: string[]): string | null {
  const candidates: { dir: string; matched: number }[] = [];
  walkDirectories(rootDir, 0, 6, (dir) => {
    let matched = 0;
    for (const file of requiredFiles) {
      if (existsSync(path.join(dir, file))) {
        matched += 1;
      }
    }
    if (matched > 0) {
      candidates.push({ dir, matched });
    }
  });

  candidates.sort((a, b) => b.matched - a.matched);
  const best = candidates[0];
  if (!best || best.matched < requiredFiles.length) {
    return null;
  }

  return best.dir;
}

function walkDirectories(
  rootDir: string,
  depth: number,
  maxDepth: number,
  onDirectory: (dir: string) => void
): void {
  if (depth > maxDepth) {
    return;
  }

  if (!existsSync(rootDir)) {
    return;
  }

  let entries: string[] = [];
  try {
    entries = readdirSync(rootDir);
  } catch {
    return;
  }

  onDirectory(rootDir);

  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry);
    let stats;
    try {
      stats = statSync(fullPath);
    } catch {
      continue;
    }

    if (!stats.isDirectory()) {
      continue;
    }

    if (entry === ".git" || entry === "node_modules") {
      continue;
    }

    walkDirectories(fullPath, depth + 1, maxDepth, onDirectory);
  }
}
