export interface ToolListRow {
  name: string;
  latestVersion: number;
  status: string;
  createdAt: string;
  lastRunAt: string | null;
  lastExitCode: number | null;
}

export interface ToolVersionDetails {
  id: number;
  version: number;
  manifest: unknown;
  codePath: string;
  createdAt: string;
  score: number | null;
}

export interface FeedbackRecord {
  id: number;
  text: string;
  createdAt: string;
}

export interface ToolDetails {
  id: number;
  name: string;
  status: string;
  createdAt: string;
  latestVersion: number;
  versions: ToolVersionDetails[];
  recentFeedback: FeedbackRecord[];
}

export interface LatestToolVersion {
  id: number;
  version: number;
  codePath: string;
}

export interface RunRecordInput {
  toolVersionId: number;
  command: string;
  args: string[];
  startedAt: string;
  endedAt: string;
  exitCode: number;
  stdoutPath?: string | null;
  stderrPath?: string | null;
  artifacts?: unknown;
}

export interface UpsertToolVersionInput {
  name: string;
  version: number;
  manifest: unknown;
  codePath: string;
  score?: number | null;
}
