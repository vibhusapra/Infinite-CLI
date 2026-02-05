import path from "node:path";
import { mkdirSync, rmSync } from "node:fs";
import { runCommand } from "../runtime/command-runner.js";

export interface WorktreeHandle {
  path: string;
  remove: () => Promise<void>;
}

export class WorktreeManager {
  constructor(
    private readonly repoRoot: string,
    private readonly baseDir: string
  ) {}

  async create(jobId: string, candidateId: string): Promise<WorktreeHandle> {
    const worktreePath = path.join(this.baseDir, jobId, candidateId);
    mkdirSync(path.dirname(worktreePath), { recursive: true });
    rmSync(worktreePath, { recursive: true, force: true });

    const addResult = await runCommand(
      "git",
      ["worktree", "add", "--detach", worktreePath, "HEAD"],
      { cwd: this.repoRoot, timeoutMs: 30_000 }
    );

    if (addResult.exitCode !== 0) {
      throw new Error(
        `Failed to create worktree for ${candidateId}: ${addResult.stderr || addResult.stdout || "unknown error"}`
      );
    }

    return {
      path: worktreePath,
      remove: async () => {
        await removeWorktree(this.repoRoot, worktreePath);
      }
    };
  }
}

export async function resolveRepoRoot(cwd: string): Promise<string> {
  const result = await runCommand("git", ["rev-parse", "--show-toplevel"], { cwd, timeoutMs: 10_000 });
  if (result.exitCode !== 0) {
    throw new Error(`Could not resolve git repository root from ${cwd}.`);
  }

  const root = result.stdout.trim();
  if (!root) {
    throw new Error("Git repository root was empty.");
  }

  return root;
}

async function removeWorktree(repoRoot: string, worktreePath: string): Promise<void> {
  const removeResult = await runCommand(
    "git",
    ["worktree", "remove", "--force", worktreePath],
    { cwd: repoRoot, timeoutMs: 15_000 }
  );

  if (removeResult.exitCode !== 0) {
    rmSync(worktreePath, { recursive: true, force: true });
  }
}

