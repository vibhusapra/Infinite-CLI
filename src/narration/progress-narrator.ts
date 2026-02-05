import type { GenerationProgressEvent } from "../orchestrator/types.js";

const DEFAULT_FLUSH_INTERVAL_MS = 4000;

export interface ProgressNarratorOptions {
  enabled: boolean;
  intent: string;
  apiKey: string | null;
  model: string;
  flushIntervalMs?: number;
  print?: (line: string) => void;
}

export class ProgressNarrator {
  private readonly print: (line: string) => void;
  private readonly flushIntervalMs: number;
  private readonly eventHistory: GenerationProgressEvent[] = [];
  private readonly recentNarration: string[] = [];
  private readonly models: string[];
  private pendingEvents: GenerationProgressEvent[] = [];
  private flushTimer: NodeJS.Timeout | null = null;
  private inflight: Promise<void> | null = null;
  private closed = false;

  constructor(private readonly options: ProgressNarratorOptions) {
    this.print = options.print ?? console.log;
    this.flushIntervalMs = options.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;
    this.models = uniqueModels([options.model, "gpt-5-mini", "gpt-4.1-mini"]);
  }

  start(): void {
    if (!this.options.enabled) {
      return;
    }

    this.print("[narrator] live narration enabled");
    if (!this.options.apiKey) {
      this.print("[narrator] OPENAI_API_KEY missing; using local narration fallback.");
    }
  }

  push(event: GenerationProgressEvent): void {
    if (!this.options.enabled || this.closed) {
      return;
    }

    this.pendingEvents.push(event);
    this.eventHistory.push(event);
    if (this.eventHistory.length > 120) {
      this.eventHistory.splice(0, this.eventHistory.length - 120);
    }

    this.scheduleFlush();
  }

  async close(): Promise<void> {
    if (!this.options.enabled || this.closed) {
      return;
    }

    this.closed = true;
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    while (true) {
      if (this.inflight) {
        await this.inflight;
        continue;
      }

      if (this.pendingEvents.length === 0) {
        return;
      }

      await this.flush();
    }
  }

  private scheduleFlush(): void {
    if (this.flushTimer || this.closed) {
      return;
    }

    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flush();
    }, this.flushIntervalMs);
  }

  private async flush(): Promise<void> {
    if (this.inflight) {
      return;
    }

    if (this.pendingEvents.length === 0) {
      return;
    }

    const batch = this.pendingEvents.splice(0, this.pendingEvents.length);
    this.inflight = (async () => {
      const narration = await this.generateNarration(batch);
      if (narration.trim().length === 0) {
        return;
      }

      const lines = narration.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
      for (const line of lines) {
        this.print(`[narrator] ${line}`);
      }
      this.recentNarration.push(narration);
      if (this.recentNarration.length > 6) {
        this.recentNarration.splice(0, this.recentNarration.length - 6);
      }
    })().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      this.print(`[narrator] fallback: ${message}`);
      const fallback = buildLocalNarration(this.options.intent, batch);
      for (const line of fallback.split("\n")) {
        if (line.trim().length > 0) {
          this.print(`[narrator] ${line}`);
        }
      }
    }).finally(() => {
      this.inflight = null;
      if (this.pendingEvents.length > 0 && !this.closed) {
        this.scheduleFlush();
      }
    });

    await this.inflight;
  }

  private async generateNarration(batch: GenerationProgressEvent[]): Promise<string> {
    if (!this.options.apiKey) {
      return buildLocalNarration(this.options.intent, batch);
    }

    const prompt = buildNarrationPrompt({
      intent: this.options.intent,
      batch,
      recentNarration: this.recentNarration
    });

    let lastError: Error | null = null;
    for (const model of this.models) {
      try {
        const response = await fetch("https://api.openai.com/v1/responses", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.options.apiKey}`
          },
          body: JSON.stringify({
            model,
            input: [
              {
                role: "system",
                content: [
                  {
                    type: "input_text",
                    text: [
                      "You narrate a live software-building orchestration stream.",
                      "Respond in plain text with exactly three sections:",
                      "Plan:",
                      "Progress:",
                      "Next:",
                      "Each section should be 1-3 concise bullet lines.",
                      "Avoid markdown fences. Keep it direct and technical."
                    ].join("\n")
                  }
                ]
              },
              {
                role: "user",
                content: [
                  {
                    type: "input_text",
                    text: prompt
                  }
                ]
              }
            ]
          })
        });

        if (!response.ok) {
          const body = await response.text();
          if (isModelNotFound(response.status, body)) {
            lastError = new Error(`model '${model}' unavailable`);
            continue;
          }
          throw new Error(`narrator API error ${response.status}: ${body}`);
        }

        const json = (await response.json()) as unknown;
        const text = extractResponseText(json);
        if (!text) {
          throw new Error("narrator returned empty text");
        }
        return text;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }

    if (lastError) {
      throw lastError;
    }
    return buildLocalNarration(this.options.intent, batch);
  }
}

interface NarrationPromptInput {
  intent: string;
  batch: GenerationProgressEvent[];
  recentNarration: string[];
}

function buildNarrationPrompt(input: NarrationPromptInput): string {
  const eventLines = input.batch.map((event) => {
    const scope = event.candidateId ? `${event.phase}:${event.candidateId}` : event.phase;
    return `- ${scope} | ${event.message}`;
  });

  return [
    `Intent: ${input.intent}`,
    "Latest events:",
    ...eventLines,
    "",
    "Recent narration context:",
    ...(input.recentNarration.length === 0 ? ["- none"] : input.recentNarration.map((value) => `- ${value}`)),
    "",
    "Narrate what is happening right now."
  ].join("\n");
}

function isModelNotFound(status: number, body: string): boolean {
  if (status !== 400) {
    return false;
  }
  const lowered = body.toLowerCase();
  return lowered.includes("model_not_found") || lowered.includes("does not exist");
}

export function extractResponseText(json: unknown): string | null {
  if (!json || typeof json !== "object") {
    return null;
  }

  const record = json as Record<string, unknown>;
  if (typeof record.output_text === "string" && record.output_text.length > 0) {
    return record.output_text;
  }

  const output = record.output;
  if (!Array.isArray(output)) {
    return null;
  }

  const pieces: string[] = [];
  for (const item of output) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const content = (item as Record<string, unknown>).content;
    if (!Array.isArray(content)) {
      continue;
    }

    for (const part of content) {
      if (!part || typeof part !== "object") {
        continue;
      }
      const text = (part as Record<string, unknown>).text;
      if (typeof text === "string" && text.length > 0) {
        pieces.push(text);
      }
    }
  }

  if (pieces.length === 0) {
    return null;
  }

  return pieces.join("\n");
}

export function buildLocalNarration(intent: string, events: GenerationProgressEvent[]): string {
  const first = events[0];
  const last = events[events.length - 1];
  const progressLines = events.slice(-4).map((event) => `- ${event.message}`);

  return [
    `Plan: Build a runnable tool for "${intent}" with candidate generation + validation.`,
    "Progress:",
    ...progressLines,
    `Next: ${inferNextStep(last?.phase, first?.jobId)}`
  ].join("\n");
}

function inferNextStep(phase: GenerationProgressEvent["phase"] | undefined, jobId: string | undefined): string {
  switch (phase) {
    case "scheduler-started":
      return "running adaptive scheduler and launching first candidate.";
    case "scheduler-fanout":
      return "launching another candidate due to insufficient previous score.";
    case "job-started":
      return "worktrees will spin up and codex execution will begin.";
    case "candidate-retry":
      return "codex retry is in progress with adjusted settings/model.";
    case "candidate-codex-running":
    case "candidate-codex-heartbeat":
      return "waiting for codex output, then evaluating artifacts.";
    case "candidate-evaluating":
      return "compile + smoke validation is running.";
    case "candidate-finished":
      return "selecting best candidate and promoting version.";
    case "selection-complete":
      return `promotion and auto-run will follow for ${jobId ?? "this job"}.`;
    case "promotion-complete":
      return "tool install is done; next step is execution with arguments.";
    case "candidate-failed":
      return "other candidates or failure diagnostics will determine next action.";
    case "scheduler-early-stop":
      return "candidate quality cutoff reached; no further fanout needed.";
    case "scheduler-drain":
      return "scheduler has stopped launching additional candidates.";
    default:
      return "continuing orchestration.";
  }
}

function uniqueModels(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (trimmed.length === 0 || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}
