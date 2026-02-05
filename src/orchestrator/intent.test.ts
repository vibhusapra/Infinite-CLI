import test from "node:test";
import assert from "node:assert/strict";
import { draftIntent } from "./intent.js";

test("draftIntent always includes exactly one clarification question", () => {
  const basic = draftIntent("make a hello tool");
  assert.ok(basic.clarificationQuestion);

  const withOutputHint = draftIntent("convert text to mp3 and save output file");
  assert.ok(withOutputHint.clarificationQuestion);
});

