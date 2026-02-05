export type RuntimeOptions = {
  agents?: number;
  fast?: boolean;
  debug?: boolean;
  narrate?: boolean;
  strategy?: GenerationStrategy;
  scoreCutoff?: number;
  retryBudget?: number;
  fanoutDelayMs?: number;
};

export type GenerationStrategy = "adaptive" | "parallel";

export type RuntimeGenerationConfigInput = {
  candidateCount: number;
  codexTimeoutMs: number;
  keepWorktrees: boolean;
  strategy: GenerationStrategy;
  scoreCutoff: number;
  retryBudget: number;
  fanoutDelayMs: number;
};

export type RuntimeGenerationConfig = {
  candidateCount: number;
  codexTimeoutMs: number;
  keepWorktrees: boolean;
  fast: boolean;
  debug: boolean;
  strategy: GenerationStrategy;
  scoreCutoff: number;
  retryBudget: number;
  fanoutDelayMs: number;
};

export function parseInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`Invalid integer value: ${value}`);
  }
  return parsed;
}

export function parseStrategyOption(value: string): GenerationStrategy {
  const normalized = value.trim().toLowerCase();
  if (normalized === "adaptive" || normalized === "parallel") {
    return normalized;
  }
  throw new Error(`Invalid strategy value: ${value}. Expected adaptive or parallel.`);
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
  const strategy = options.strategy ?? base.strategy;
  const scoreCutoff = resolveBoundedNumber(base.scoreCutoff, options.scoreCutoff, 50, 200);
  const retryBudget = resolveBoundedNumber(base.retryBudget, options.retryBudget, 0, 2);
  const fanoutDelayMs = resolveBoundedNumber(base.fanoutDelayMs, options.fanoutDelayMs, 0, 30_000);

  return {
    candidateCount,
    codexTimeoutMs,
    keepWorktrees,
    fast,
    debug,
    strategy,
    scoreCutoff,
    retryBudget,
    fanoutDelayMs
  };
}

function resolveBoundedNumber(base: number, override: number | undefined, min: number, max: number): number {
  const value = override === undefined ? base : override;
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
}
