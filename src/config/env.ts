import { config as loadDotEnv } from "dotenv";

const MIN_CANDIDATE_COUNT = 1;
const MAX_CANDIDATE_COUNT = 5;

export interface InfiniteConfig {
  openAIApiKey: string | null;
  codexBinary: string;
  codexModel: string;
  candidateCount: number;
  codexTimeoutMs: number;
  keepWorktrees: boolean;
}

export function loadInfiniteConfig(env: NodeJS.ProcessEnv = process.env): InfiniteConfig {
  loadDotEnv();

  return {
    openAIApiKey: env.OPENAI_API_KEY?.trim() || null,
    codexBinary: env.INFINITE_CODEX_BIN?.trim() || "codex",
    codexModel: env.INFINITE_CODEX_MODEL?.trim() || "gpt-5-codex",
    candidateCount: parseBoundedInt(env.INFINITE_CANDIDATE_COUNT, 2, MIN_CANDIDATE_COUNT, MAX_CANDIDATE_COUNT),
    codexTimeoutMs: parseBoundedInt(env.INFINITE_CODEX_TIMEOUT_MS, 240_000, 30_000, 900_000),
    keepWorktrees: parseBoolean(env.INFINITE_KEEP_WORKTREES, false)
  };
}

function parseBoolean(raw: string | undefined, fallback: boolean): boolean {
  if (!raw) {
    return fallback;
  }

  const normalized = raw.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}

function parseBoundedInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }

  if (parsed < min) {
    return min;
  }

  if (parsed > max) {
    return max;
  }

  return parsed;
}
