import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import type { RuntimePaths } from "../config/runtime-paths.js";
import { Registry } from "../registry/registry.js";

export interface CleanupOptions {
  projects: boolean;
  logs: boolean;
  artifacts: boolean;
}

export interface CleanupSummary {
  removedToolRecords: number;
  removedToolDirectories: number;
  removedJobDirectories: number;
  removedRunDirectories: number;
  removedWorktreeDirectories: number;
  removedArtifactEntries: number;
}

interface PerformCleanupInput {
  paths: RuntimePaths;
  registry: Registry;
  options: CleanupOptions;
}

export function performCleanup(input: PerformCleanupInput): CleanupSummary {
  const summary: CleanupSummary = {
    removedToolRecords: 0,
    removedToolDirectories: 0,
    removedJobDirectories: 0,
    removedRunDirectories: 0,
    removedWorktreeDirectories: 0,
    removedArtifactEntries: 0
  };

  if (input.options.projects) {
    const result = input.registry.clearAllTools();
    summary.removedToolRecords = result.deletedTools;
    summary.removedToolDirectories = purgeDirectoryContents(input.paths.toolsDir);
  }

  if (input.options.logs) {
    summary.removedJobDirectories = purgeDirectoryContents(input.paths.jobsDir);
    summary.removedRunDirectories = purgeDirectoryContents(input.paths.runsDir);
    summary.removedWorktreeDirectories = purgeDirectoryContents(input.paths.worktreesDir);
  }

  if (input.options.artifacts) {
    summary.removedArtifactEntries = purgeDirectoryContents(input.paths.artifactsDir);
  }

  return summary;
}

function purgeDirectoryContents(directory: string): number {
  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true });
    return 0;
  }

  const entries = readdirSync(directory);
  for (const entry of entries) {
    rmSync(path.join(directory, entry), { recursive: true, force: true });
  }

  mkdirSync(directory, { recursive: true });
  return entries.length;
}
