import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { RuntimePaths } from "../config/runtime-paths.js";
import { Registry } from "../registry/registry.js";
import { runPythonTool } from "../runtime/python-runner.js";

export interface RunOutcome {
  exitCode: number;
  entrypoint: string;
  runDir: string;
  stdoutPath: string;
  stderrPath: string;
}

interface RunByVersionInput {
  toolVersionId: number;
  codePath: string;
  args: string[];
  paths: RuntimePaths;
  registry: Registry;
}

interface RunLatestByNameInput {
  name: string;
  args: string[];
  paths: RuntimePaths;
  registry: Registry;
}

export async function runLatestToolByName(input: RunLatestByNameInput): Promise<RunOutcome | null> {
  const latestVersion = input.registry.getLatestVersion(input.name);
  if (!latestVersion) {
    return null;
  }

  return runAndRecordByVersion({
    toolVersionId: latestVersion.id,
    codePath: latestVersion.codePath,
    args: input.args,
    paths: input.paths,
    registry: input.registry
  });
}

export async function runAndRecordByVersion(input: RunByVersionInput): Promise<RunOutcome> {
  const entrypoint = path.isAbsolute(input.codePath)
    ? input.codePath
    : path.resolve(input.paths.rootDir, input.codePath);

  if (!existsSync(entrypoint)) {
    throw new Error(`Entrypoint missing: ${entrypoint}`);
  }

  const runResult = await runPythonTool(entrypoint, input.args);
  const runId = createRunId();
  const runDir = path.join(input.paths.runsDir, runId);
  mkdirSync(runDir, { recursive: true });

  const stdoutPath = path.join(runDir, "stdout.log");
  const stderrPath = path.join(runDir, "stderr.log");
  writeFileSync(stdoutPath, runResult.stdout, "utf8");
  writeFileSync(stderrPath, runResult.stderr, "utf8");

  input.registry.recordRun({
    toolVersionId: input.toolVersionId,
    command: "python3",
    args: [entrypoint, ...input.args],
    startedAt: runResult.startedAt,
    endedAt: runResult.endedAt,
    exitCode: runResult.exitCode,
    stdoutPath,
    stderrPath
  });

  if (runResult.signal) {
    console.error(`Tool terminated by signal ${runResult.signal}`);
  }

  return {
    exitCode: runResult.exitCode,
    entrypoint,
    runDir,
    stdoutPath,
    stderrPath
  };
}

function createRunId(): string {
  const ts = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  return `${ts}-${random}`;
}

