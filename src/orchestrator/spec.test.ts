import test from "node:test";
import assert from "node:assert/strict";
import { buildCodexPrompt, deriveFallbackToolName, normalizeManifest, sanitizeToolName } from "./spec.js";

test("sanitizeToolName normalizes casing and symbols", () => {
  assert.equal(sanitizeToolName("Text To MP3!!"), "text-to-mp3");
});

test("deriveFallbackToolName strips stop words and keeps signal words", () => {
  const name = deriveFallbackToolName("make a tool that converts blob text to mp3 with openai");
  assert.equal(name, "converts-blob-text-mp3");
});

test("normalizeManifest provides safe defaults", () => {
  const manifest = normalizeManifest({}, "create csv cleaner");
  assert.equal(manifest.runtime, "python");
  assert.equal(manifest.entrypoint, "tool.py");
  assert.ok(manifest.name.length > 0);
});

test("buildCodexPrompt includes intent-specific guidance for pdf summarize", () => {
  const prompt = buildCodexPrompt({
    intent: "make a small app to summarize a pdf",
    outputDir: "/tmp/out",
    candidateId: "candidate-1"
  });

  assert.match(prompt, /Intent-specific requirements:/);
  assert.match(prompt, /pypdf/i);
  assert.match(prompt, /--out/);
  assert.match(prompt, /Do not require output_path as a positional argument/i);
});
