import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import { Registry } from "../registry/registry.js";
import type { RuntimePaths } from "../config/runtime-paths.js";
import { performCleanup } from "./cleanup.js";

function createRuntimePaths(rootDir: string): RuntimePaths {
  const infiniteRoot = path.join(rootDir, ".infinite");
  const paths: RuntimePaths = {
    rootDir: infiniteRoot,
    dbPath: path.join(infiniteRoot, "registry.db"),
    toolsDir: path.join(infiniteRoot, "tools"),
    runsDir: path.join(infiniteRoot, "runs"),
    artifactsDir: path.join(infiniteRoot, "artifacts"),
    jobsDir: path.join(infiniteRoot, "jobs"),
    worktreesDir: path.join(infiniteRoot, "worktrees")
  };

  mkdirSync(paths.toolsDir, { recursive: true });
  mkdirSync(paths.runsDir, { recursive: true });
  mkdirSync(paths.artifactsDir, { recursive: true });
  mkdirSync(paths.jobsDir, { recursive: true });
  mkdirSync(paths.worktreesDir, { recursive: true });

  return paths;
}

test("performCleanup removes log directories by default options", () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "icli-clean-"));
  const paths = createRuntimePaths(tempRoot);
  const registry = new Registry(paths.dbPath);

  try {
    writeFileSync(path.join(paths.jobsDir, "job1.log"), "job", "utf8");
    writeFileSync(path.join(paths.runsDir, "run1.log"), "run", "utf8");
    writeFileSync(path.join(paths.worktreesDir, "wt1.log"), "wt", "utf8");

    const summary = performCleanup({
      paths,
      registry,
      options: {
        projects: false,
        logs: true,
        artifacts: false
      }
    });

    assert.equal(summary.removedJobDirectories, 1);
    assert.equal(summary.removedRunDirectories, 1);
    assert.equal(summary.removedWorktreeDirectories, 1);
    assert.equal(readdirSync(paths.jobsDir).length, 0);
    assert.equal(readdirSync(paths.runsDir).length, 0);
    assert.equal(readdirSync(paths.worktreesDir).length, 0);
  } finally {
    registry.close();
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

test("performCleanup removes project records and tool directories", () => {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "icli-clean-"));
  const paths = createRuntimePaths(tempRoot);
  const registry = new Registry(paths.dbPath);

  try {
    const toolFile = path.join(paths.toolsDir, "hello", "v1", "tool.py");
    mkdirSync(path.dirname(toolFile), { recursive: true });
    writeFileSync(toolFile, "print('hello')", "utf8");

    registry.upsertToolVersion({
      name: "hello",
      version: 1,
      manifest: { name: "hello", entrypoint: "tool.py" },
      codePath: "tools/hello/v1/tool.py",
      score: 1
    });

    assert.equal(registry.listTools().length, 1);

    const summary = performCleanup({
      paths,
      registry,
      options: {
        projects: true,
        logs: false,
        artifacts: false
      }
    });

    assert.equal(summary.removedToolRecords, 1);
    assert.equal(registry.listTools().length, 0);
    assert.equal(readdirSync(paths.toolsDir).length, 0);
  } finally {
    registry.close();
    rmSync(tempRoot, { recursive: true, force: true });
  }
});

