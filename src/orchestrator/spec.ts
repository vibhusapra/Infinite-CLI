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
  const extraInstructions = buildIntentSpecificInstructions(input.intent);

  const promptLines = [
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
    "- Build for terminal users: predictable file-in/file-out behavior and clear --help text.",
    "- If external API access is required, use OPENAI_API_KEY from env.",
    "- Keep dependencies standard-library only when possible.",
    "- Prefer a single primary input argument and optional flags over many required positional arguments.",
    "- If output can be textual, print to stdout by default and allow optional --out to write a file.",
    "- If output must be a file (for example audio/binary), require --out as a named flag, not a required positional argument.",
    "- manifest.json must match tool.py argument behavior (set required=true only when truly required).",
    "- Include at least one concrete runnable command in manifest.examples.",
    "- smoke_test.py must run fast and exit 0 when tool.py is healthy.",
    "- smoke_test.py should exercise --help and one local happy-path invocation.",
    "- manifest.json must be valid JSON with keys:",
    '  name (kebab-case), description, version ("1.0.0"), runtime ("python"), entrypoint ("tool.py"), examples (array of strings), arguments (array).',
    "",
    "After writing files, print DONE.",
    "Do not ask follow-up questions."
  ];

  if (extraInstructions.length > 0) {
    promptLines.push("", "Intent-specific requirements:");
    for (const instruction of extraInstructions) {
      promptLines.push(`- ${instruction}`);
    }
  }

  return promptLines.join("\n");
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

function buildIntentSpecificInstructions(intent: string): string[] {
  const lowered = intent.toLowerCase();
  const instructions: string[] = [];

  if (lowered.includes("pdf") && lowered.includes("summar")) {
    instructions.push(
      "Support input via positional path argument. Accept both .pdf and .txt so smoke tests can run without external dependencies."
    );
    instructions.push(
      "If input is .pdf, extract text with lazy optional imports: prefer pypdf, then try pdftotext subprocess, otherwise print a clear install hint and exit non-zero."
    );
    instructions.push(
      "If OPENAI_API_KEY is available, call OpenAI API for summarization. If missing, use a deterministic local fallback summary so basic use still works."
    );
    instructions.push(
      "Expose optional --out for writing summary to file; if --out is omitted, print summary to stdout."
    );
    instructions.push(
      "Do not require output_path as a positional argument."
    );
    instructions.push(
      "smoke_test.py must validate the .txt path flow and fallback summary behavior without requiring network."
    );
  }

  if (lowered.includes("tts") || lowered.includes("mp3")) {
    instructions.push(
      "Require --out and write binary output correctly. smoke_test.py can validate argument handling without live API calls."
    );
  }

  return instructions;
}
