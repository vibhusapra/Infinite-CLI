const OUTPUT_HINTS = ["--out", "output", "save", "write", "file", "mp3", "json", "csv", "md"];

export interface IntentDraft {
  normalizedIntent: string;
  clarificationQuestion?: string;
}

export function draftIntent(intent: string): IntentDraft {
  const normalizedIntent = intent.trim().replace(/\s+/g, " ");
  const lowered = normalizedIntent.toLowerCase();
  const hasOutputHint = OUTPUT_HINTS.some((hint) => lowered.includes(hint));

  return {
    normalizedIntent,
    clarificationQuestion: hasOutputHint
      ? undefined
      : "What output should this tool produce, and where should it write it?"
  };
}

