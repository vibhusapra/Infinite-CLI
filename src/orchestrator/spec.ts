import type { ToolManifest } from "./types.js";

export interface PromptBuildInput {
  intent: string;
  clarification?: string | null;
  outputDir: string;
  candidateId: string;
}

const STOP_WORDS = new Set([
  "a",
  "an",
  "the",
  "to",
  "for",
  "and",
  "or",
  "with",
  "using",
  "from",
  "of",
  "in",
  "on",
  "make",
  "build",
  "create",
  "tool",
  "that"
]);

export function buildCodexPrompt(input: PromptBuildInput): string {
  const clarification = input.clarification?.trim();

  return [
    "You are implementing one candidate for Infinite CLI.",
    `Candidate ID: ${input.candidateId}`,
    "",
    "Build a small Python CLI tool based on this request.",
    `User intent: ${input.intent}`,
    clarification ? `Clarification: ${clarification}` : "Clarification: none",
    "",
    "You MUST create exactly these files:",
    `1. ${input.outputDir}/tool.py`,
    `2. ${input.outputDir}/manifest.json`,
    `3. ${input.outputDir}/smoke_test.py`,
    "",
    "Requirements:",
    "- tool.py must be runnable with python3 and use argparse.",
    "- If external API access is required, use OPENAI_API_KEY from env.",
    "- Keep dependencies standard-library only when possible.",
    "- smoke_test.py must run fast and exit 0 when tool.py is healthy.",
    "- manifest.json must be valid JSON with keys:",
    '  name (kebab-case), description, version ("1.0.0"), runtime ("python"), entrypoint ("tool.py"), examples (array of strings), arguments (array).',
    "",
    "After writing files, print DONE.",
    "Do not ask follow-up questions."
  ].join("\n");
}

export function deriveFallbackToolName(intent: string): string {
  const normalized = intent
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (normalized.length === 0) {
    return "generated-tool";
  }

  const parts = normalized
    .split(" ")
    .filter((part) => part.length > 1 && !STOP_WORDS.has(part))
    .slice(0, 4)
    .map((part) => part.replace(/[^a-z0-9-]/g, ""));

  if (parts.length === 0) {
    return "generated-tool";
  }

  return sanitizeToolName(parts.join("-"));
}

export function sanitizeToolName(name: string): string {
  const sanitized = name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return sanitized.length > 0 ? sanitized : "generated-tool";
}

export function normalizeManifest(raw: unknown, fallbackIntent: string): ToolManifest {
  const fallbackName = deriveFallbackToolName(fallbackIntent);
  const base: ToolManifest = {
    name: fallbackName,
    description: "Generated tool",
    version: "1.0.0",
    runtime: "python",
    entrypoint: "tool.py",
    examples: []
  };

  if (!raw || typeof raw !== "object") {
    return base;
  }

  const candidate = raw as Partial<ToolManifest>;

  return {
    name: sanitizeToolName(typeof candidate.name === "string" ? candidate.name : fallbackName),
    description: typeof candidate.description === "string" ? candidate.description : base.description,
    version: typeof candidate.version === "string" ? candidate.version : base.version,
    runtime: "python",
    entrypoint: typeof candidate.entrypoint === "string" ? candidate.entrypoint : base.entrypoint,
    examples: Array.isArray(candidate.examples)
      ? candidate.examples.filter((value): value is string => typeof value === "string")
      : [],
    arguments: Array.isArray(candidate.arguments)
      ? candidate.arguments
          .filter((arg): arg is { name: string; description: string; required?: boolean } => {
            return (
              typeof arg === "object" &&
              arg !== null &&
              typeof (arg as { name?: unknown }).name === "string" &&
              typeof (arg as { description?: unknown }).description === "string"
            );
          })
          .map((arg) => ({
            name: arg.name,
            description: arg.description,
            required: Boolean(arg.required)
          }))
      : []
  };
}

