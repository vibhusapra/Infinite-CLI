import { mkdirSync } from "node:fs";
import path from "node:path";

export interface RuntimePaths {
  rootDir: string;
  dbPath: string;
  toolsDir: string;
  runsDir: string;
  artifactsDir: string;
  jobsDir: string;
  worktreesDir: string;
}

export function resolveRuntimePaths(cwd: string = process.cwd()): RuntimePaths {
  const rootDir = path.join(cwd, ".infinite");

  return {
    rootDir,
    dbPath: path.join(rootDir, "registry.db"),
    toolsDir: path.join(rootDir, "tools"),
    runsDir: path.join(rootDir, "runs"),
    artifactsDir: path.join(rootDir, "artifacts"),
    jobsDir: path.join(rootDir, "jobs"),
    worktreesDir: path.join(rootDir, "worktrees")
  };
}

export function ensureRuntimePaths(paths: RuntimePaths): void {
  mkdirSync(paths.rootDir, { recursive: true });
  mkdirSync(paths.toolsDir, { recursive: true });
  mkdirSync(paths.runsDir, { recursive: true });
  mkdirSync(paths.artifactsDir, { recursive: true });
  mkdirSync(paths.jobsDir, { recursive: true });
  mkdirSync(paths.worktreesDir, { recursive: true });
}
