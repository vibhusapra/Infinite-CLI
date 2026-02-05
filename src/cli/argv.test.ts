import test from "node:test";
import assert from "node:assert/strict";
import { normalizeCliArgv } from "./argv.js";

test("normalizeCliArgv converts --4 shorthand into --agents 4", () => {
  const input = ["node", "dist/index.js", "make", "tool", "--4"];
  const output = normalizeCliArgv(input);
  assert.deepEqual(output, ["node", "dist/index.js", "make", "tool", "--agents", "4"]);
});

test("normalizeCliArgv leaves normal options untouched", () => {
  const input = ["node", "dist/index.js", "--agents", "3", "make", "tool"];
  const output = normalizeCliArgv(input);
  assert.deepEqual(output, input);
});

