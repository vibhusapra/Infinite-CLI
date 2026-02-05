import test from "node:test";
import assert from "node:assert/strict";
import { ProgressNarrator, buildLocalNarration, extractResponseText } from "./progress-narrator.js";

test("extractResponseText reads output_text field", () => {
  const text = extractResponseText({ output_text: "hello narration" });
  assert.equal(text, "hello narration");
});

test("extractResponseText reads nested output content", () => {
  const text = extractResponseText({
    output: [
      {
        content: [{ type: "output_text", text: "line 1" }, { type: "output_text", text: "line 2" }]
      }
    ]
  });
  assert.equal(text, "line 1\nline 2");
});

test("buildLocalNarration includes plan progress and next", () => {
  const narration = buildLocalNarration("make a tiny cli tool", [
    { phase: "job-started", jobId: "job-1", message: "Created generation job job-1" },
    { phase: "candidate-codex-running", jobId: "job-1", candidateId: "candidate-1", message: "running codex exec" }
  ]);

  assert.match(narration, /Plan:/);
  assert.match(narration, /Progress:/);
  assert.match(narration, /Next:/);
});

test("ProgressNarrator.close drains pending events queued during inflight narration", async () => {
  const lines: string[] = [];
  const globalWithFetch = globalThis as typeof globalThis & { fetch: typeof fetch };
  const originalFetch = globalWithFetch.fetch;
  let callCount = 0;

  globalWithFetch.fetch = (async () => {
    callCount += 1;
    if (callCount === 1) {
      await new Promise((resolve) => setTimeout(resolve, 30));
    }

    return new Response(
      JSON.stringify({
        output_text: `Plan:\n- call-${callCount}\nProgress:\n- call-${callCount}\nNext:\n- call-${callCount}`
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" }
      }
    );
  }) as typeof fetch;

  try {
    const narrator = new ProgressNarrator({
      enabled: true,
      intent: "build a tool",
      apiKey: "sk-test",
      model: "gpt-5-mini",
      flushIntervalMs: 1,
      print: (line) => lines.push(line)
    });

    narrator.start();
    narrator.push({
      phase: "candidate-codex-running",
      jobId: "job-1",
      candidateId: "candidate-1",
      message: "first event"
    });

    await new Promise((resolve) => setTimeout(resolve, 5));

    narrator.push({
      phase: "candidate-evaluating",
      jobId: "job-1",
      candidateId: "candidate-1",
      message: "second event"
    });

    await narrator.close();
  } finally {
    globalWithFetch.fetch = originalFetch;
  }

  assert.equal(callCount, 2);
  assert(lines.some((line) => line.includes("call-2")));
});
