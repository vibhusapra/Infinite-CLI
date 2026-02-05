import test from "node:test";
import assert from "node:assert/strict";
import { draftIntent } from "./intent.js";

test("draftIntent always includes exactly one clarification question", () => {
  const basic = draftIntent("make a hello tool");
  assert.ok(basic.clarificationQuestion);

  const withOutputHint = draftIntent("convert text to mp3 and save output file");
  assert.ok(withOutputHint.clarificationQuestion);
});

test("draftIntent asks PDF-specific clarification for summarize intents", () => {
  const pdf = draftIntent("make a small app to summarize a pdf");
  assert.ok(pdf.clarificationQuestion);
  assert.match(pdf.clarificationQuestion ?? "", /pdf summarize/i);
  assert.match(pdf.clarificationQuestion ?? "", /--out/i);
});

test("draftIntent asks command-shape clarification for file workflows", () => {
  const fileIntent = draftIntent("convert a csv file to json");
  assert.ok(fileIntent.clarificationQuestion);
  assert.match(fileIntent.clarificationQuestion ?? "", /command shape/i);
});
