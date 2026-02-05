import test from "node:test";
import assert from "node:assert/strict";
import { formatRunTemplate, getPreferredManifestExample, getRequiredManifestArgs } from "./manifest-hints.js";

test("getRequiredManifestArgs returns required argument names", () => {
  const args = getRequiredManifestArgs({
    name: "x",
    description: "x",
    version: "1.0.0",
    runtime: "python",
    entrypoint: "tool.py",
    examples: [],
    arguments: [
      { name: "pdf_path", description: "Input PDF", required: true },
      { name: "--out", description: "Output file", required: false }
    ]
  });

  assert.deepEqual(args, ["pdf_path"]);
});

test("getPreferredManifestExample picks first non-empty example", () => {
  const example = getPreferredManifestExample({
    name: "x",
    description: "x",
    version: "1.0.0",
    runtime: "python",
    entrypoint: "tool.py",
    examples: ["", "python3 tool.py input.pdf --out summary.txt"],
    arguments: []
  });

  assert.equal(example, "python3 tool.py input.pdf --out summary.txt");
});

test("formatRunTemplate renders placeholders for required args", () => {
  const command = formatRunTemplate("icli tool run pdf-summary-writer --", ["pdf_path", "output_path"]);
  assert.equal(command, "icli tool run pdf-summary-writer -- <pdf_path> <output_path>");
});
