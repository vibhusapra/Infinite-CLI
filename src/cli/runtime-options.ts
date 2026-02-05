export type RuntimeOptions = {
  agents?: number;
  fast?: boolean;
  debug?: boolean;
};

export type RuntimeGenerationConfigInput = {
  candidateCount: number;
  codexTimeoutMs: number;
  keepWorktrees: boolean;
};

export type RuntimeGenerationConfig = {
  candidateCount: number;
  codexTimeoutMs: number;
  keepWorktrees: boolean;
  fast: boolean;
  debug: boolean;
};

export function parseInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid integer value: ${value}`);
  }
  return parsed;
}

export function resolveCandidateCount(configValue: number, overrideValue: number | undefined): number {
  if (overrideValue === undefined) {
    return configValue;
  }

  if (overrideValue < 1) {
    return 1;
  }

  if (overrideValue > 5) {
    return 5;
  }

  return overrideValue;
}

export function resolveRuntimeGenerationConfig(
  base: RuntimeGenerationConfigInput,
  options: RuntimeOptions
): RuntimeGenerationConfig {
  const fast = Boolean(options.fast);
  const debug = Boolean(options.debug);

  const candidateCount = resolveCandidateCount(
    fast ? 1 : base.candidateCount,
    options.agents
  );

  const codexTimeoutMs = fast ? Math.min(base.codexTimeoutMs, 120_000) : base.codexTimeoutMs;
  const keepWorktrees = debug ? true : base.keepWorktrees;

  return {
    candidateCount,
    codexTimeoutMs,
    keepWorktrees,
    fast,
    debug
  };
}

