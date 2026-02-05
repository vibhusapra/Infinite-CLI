import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { REGISTRY_SCHEMA_SQL } from "./schema.js";
import type {
  ClearToolsResult,
  DeleteToolResult,
  LatestToolVersion,
  RunRecordInput,
  ToolDetails,
  ToolListRow,
  ToolVersionDetails,
  UpsertToolVersionInput
} from "./types.js";

type ToolRow = {
  id: number;
  name: string;
  status: string;
  created_at: string;
  latest_version: number;
};

type ToolVersionRow = {
  id: number;
  version: number;
  manifest_json: string;
  code_path: string;
  created_at: string;
  score: number | null;
};

type FeedbackRow = {
  id: number;
  text: string;
  created_at: string;
};

type ToolListQueryRow = {
  name: string;
  latest_version: number;
  status: string;
  created_at: string;
  last_run_at: string | null;
  last_exit_code: number | null;
};

type LatestVersionRow = {
  id: number;
  version: number;
  code_path: string;
};

type ToolIdRow = {
  id: number;
};

type ToolVersionIdRow = {
  id: number;
};

export class Registry {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma("busy_timeout = 5000");
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    this.db.exec(REGISTRY_SCHEMA_SQL);
  }

  close(): void {
    this.db.close();
  }

  listTools(): ToolListRow[] {
    const rows = this.db
      .prepare(
        `
        SELECT
          t.name,
          t.latest_version,
          t.status,
          t.created_at,
          (
            SELECT r.ended_at
            FROM runs r
            JOIN tool_versions tv ON tv.id = r.tool_version_id
            WHERE tv.tool_id = t.id
            ORDER BY r.started_at DESC
            LIMIT 1
          ) AS last_run_at,
          (
            SELECT r.exit_code
            FROM runs r
            JOIN tool_versions tv ON tv.id = r.tool_version_id
            WHERE tv.tool_id = t.id
            ORDER BY r.started_at DESC
            LIMIT 1
          ) AS last_exit_code
        FROM tools t
        ORDER BY t.name ASC
      `
      )
      .all() as ToolListQueryRow[];

    return rows.map((row) => ({
      name: row.name,
      latestVersion: row.latest_version,
      status: row.status,
      createdAt: row.created_at,
      lastRunAt: row.last_run_at,
      lastExitCode: row.last_exit_code
    }));
  }

  getToolByName(name: string): ToolDetails | null {
    const tool = this.db
      .prepare(
        `
        SELECT id, name, status, created_at, latest_version
        FROM tools
        WHERE name = ?
        LIMIT 1
      `
      )
      .get(name) as ToolRow | undefined;

    if (!tool) {
      return null;
    }

    const versionRows = this.db
      .prepare(
        `
        SELECT id, version, manifest_json, code_path, created_at, score
        FROM tool_versions
        WHERE tool_id = ?
        ORDER BY version DESC
      `
      )
      .all(tool.id) as ToolVersionRow[];

    const feedbackRows = this.db
      .prepare(
        `
        SELECT id, text, created_at
        FROM feedback
        WHERE tool_id = ?
        ORDER BY created_at DESC
        LIMIT 20
      `
      )
      .all(tool.id) as FeedbackRow[];

    const versions: ToolVersionDetails[] = versionRows.map((row) => ({
      id: row.id,
      version: row.version,
      manifest: parseManifest(row.manifest_json),
      codePath: row.code_path,
      createdAt: row.created_at,
      score: row.score
    }));

    return {
      id: tool.id,
      name: tool.name,
      status: tool.status,
      createdAt: tool.created_at,
      latestVersion: tool.latest_version,
      versions,
      recentFeedback: feedbackRows.map((row) => ({
        id: row.id,
        text: row.text,
        createdAt: row.created_at
      }))
    };
  }

  getLatestVersion(name: string): LatestToolVersion | null {
    const row = this.db
      .prepare(
        `
        SELECT tv.id, tv.version, tv.code_path
        FROM tools t
        JOIN tool_versions tv ON tv.tool_id = t.id
        WHERE t.name = ? AND tv.version = t.latest_version
        LIMIT 1
      `
      )
      .get(name) as LatestVersionRow | undefined;

    if (!row) {
      return null;
    }

    return {
      id: row.id,
      version: row.version,
      codePath: row.code_path
    };
  }

  addFeedback(name: string, text: string): boolean {
    const tool = this.db
      .prepare(
        `
        SELECT id
        FROM tools
        WHERE name = ?
        LIMIT 1
      `
      )
      .get(name) as ToolIdRow | undefined;

    if (!tool) {
      return false;
    }

    this.db
      .prepare(
        `
        INSERT INTO feedback (tool_id, text, created_at)
        VALUES (?, ?, ?)
      `
      )
      .run(tool.id, text, new Date().toISOString());

    return true;
  }

  getNextVersion(name: string): number {
    const row = this.db
      .prepare(
        `
        SELECT latest_version
        FROM tools
        WHERE name = ?
        LIMIT 1
      `
      )
      .get(name) as { latest_version: number } | undefined;

    if (!row) {
      return 1;
    }

    return row.latest_version + 1;
  }

  upsertToolVersion(input: UpsertToolVersionInput): number {
    const now = new Date().toISOString();

    const existing = this.db
      .prepare(
        `
        SELECT id
        FROM tools
        WHERE name = ?
        LIMIT 1
      `
      )
      .get(input.name) as ToolIdRow | undefined;

    let toolId: number;
    if (!existing) {
      const insertResult = this.db
        .prepare(
          `
          INSERT INTO tools (name, created_at, latest_version, status)
          VALUES (?, ?, ?, 'active')
        `
        )
        .run(input.name, now, input.version);
      toolId = Number(insertResult.lastInsertRowid);
    } else {
      toolId = existing.id;
    }

    this.db
      .prepare(
        `
        INSERT INTO tool_versions (tool_id, version, manifest_json, code_path, created_at, score)
        VALUES (?, ?, ?, ?, ?, ?)
      `
      )
      .run(toolId, input.version, JSON.stringify(input.manifest), input.codePath, now, input.score ?? null);

    this.db
      .prepare(
        `
        UPDATE tools
        SET latest_version = ?, status = 'active'
        WHERE id = ?
      `
      )
      .run(input.version, toolId);

    const versionRow = this.db
      .prepare(
        `
        SELECT id
        FROM tool_versions
        WHERE tool_id = ? AND version = ?
        LIMIT 1
      `
      )
      .get(toolId, input.version) as ToolVersionIdRow | undefined;

    if (!versionRow) {
      throw new Error(`Failed to resolve saved version id for ${input.name}@${input.version}`);
    }

    return versionRow.id;
  }

  recordRun(input: RunRecordInput): void {
    this.db
      .prepare(
        `
        INSERT INTO runs (
          tool_version_id,
          command,
          args_json,
          started_at,
          ended_at,
          exit_code,
          stdout_path,
          stderr_path,
          artifacts_json
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
      )
      .run(
        input.toolVersionId,
        input.command,
        JSON.stringify(input.args),
        input.startedAt,
        input.endedAt,
        input.exitCode,
        input.stdoutPath ?? null,
        input.stderrPath ?? null,
        JSON.stringify(input.artifacts ?? null)
      );
  }

  clearAllTools(): ClearToolsResult {
    const row = this.db
      .prepare(
        `
        SELECT COUNT(*) AS count
        FROM tools
      `
      )
      .get() as { count: number };

    this.db.exec(`
      DELETE FROM tools;
      DELETE FROM sqlite_sequence WHERE name IN ('tools', 'tool_versions', 'runs', 'feedback');
    `);

    return {
      deletedTools: row.count
    };
  }

  deleteToolByName(name: string): DeleteToolResult {
    const result = this.db
      .prepare(
        `
        DELETE FROM tools
        WHERE name = ?
      `
      )
      .run(name);

    return {
      deleted: result.changes > 0
    };
  }
}

function parseManifest(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return { raw };
  }
}
