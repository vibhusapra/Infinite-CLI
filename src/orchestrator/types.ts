import type { RuntimePaths } from "../config/runtime-paths.js";

export interface ToolArgument {
  name: string;
  description: string;
  required?: boolean;
}

export interface ToolManifest {
  name: string;
  description: string;
  version: string;
  runtime: "python";
  entrypoint: string;
  examples: string[];
  arguments?: ToolArgument[];
}

export interface GenerationRequest {
  intent: string;
  clarification?: string | null;
}

export interface GenerationSettings {
  codexBinary: string;
  codexModel: string;
  candidateCount: number;
  codexTimeoutMs: number;
  keepWorktrees: boolean;
}

export interface CandidatePaths {
  candidateId: string;
  jobId: string;
  outputDir: string;
  worktreeDir: string;
  codexLastMessagePath: string;
  codexStdoutPath: string;
  codexStderrPath: string;
  compileStdoutPath: string;
  compileStderrPath: string;
  smokeStdoutPath: string;
  smokeStderrPath: string;
}

export interface CandidateEvaluation {
  candidateId: string;
  outputDir: string;
  manifest: ToolManifest | null;
  entrypointPath: string | null;
  smokeTestPath: string | null;
  codexExitCode: number;
  compileExitCode: number | null;
  smokeExitCode: number | null;
  score: number;
  isValid: boolean;
  summary: string;
  elapsedMs: number;
  logs: {
    codexStdoutPath: string;
    codexStderrPath: string;
    compileStdoutPath: string;
    compileStderrPath: string;
    smokeStdoutPath: string;
    smokeStderrPath: string;
  };
}

export interface GenerationResult {
  jobId: string;
  toolName: string;
  version: number;
  codePath: string;
  toolVersionId: number;
  selectedCandidate: CandidateEvaluation;
  allCandidates: CandidateEvaluation[];
}

export interface OrchestratorContext {
  paths: RuntimePaths;
  repoRoot: string;
}
