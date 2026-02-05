export const REGISTRY_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS tools (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  latest_version INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active'
);

CREATE TABLE IF NOT EXISTS tool_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tool_id INTEGER NOT NULL,
  version INTEGER NOT NULL,
  manifest_json TEXT NOT NULL,
  code_path TEXT NOT NULL,
  created_at TEXT NOT NULL,
  score REAL,
  FOREIGN KEY (tool_id) REFERENCES tools(id) ON DELETE CASCADE,
  UNIQUE (tool_id, version)
);

CREATE TABLE IF NOT EXISTS runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tool_version_id INTEGER NOT NULL,
  command TEXT NOT NULL,
  args_json TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT NOT NULL,
  exit_code INTEGER NOT NULL,
  stdout_path TEXT,
  stderr_path TEXT,
  artifacts_json TEXT,
  FOREIGN KEY (tool_version_id) REFERENCES tool_versions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tool_id INTEGER NOT NULL,
  text TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (tool_id) REFERENCES tools(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_tool_versions_tool_id ON tool_versions(tool_id);
CREATE INDEX IF NOT EXISTS idx_runs_tool_version_id ON runs(tool_version_id);
CREATE INDEX IF NOT EXISTS idx_feedback_tool_id ON feedback(tool_id);
`;

