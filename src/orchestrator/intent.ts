const OUTPUT_HINTS = ["--out", "output", "save", "write", "file", "mp3", "json", "csv", "md"];
const FILE_HINTS = [
  "file",
  "pdf",
  "csv",
  "json",
  "txt",
  "md",
  "image",
  "audio",
  "video",
  "mp3",
  "wav",
  "png",
  "jpg"
];

export interface IntentDraft {
  normalizedIntent: string;
  clarificationQuestion?: string;
}

export function draftIntent(intent: string): IntentDraft {
  const normalizedIntent = intent.trim().replace(/\s+/g, " ");
  const lowered = normalizedIntent.toLowerCase();
  const hasOutputHint = OUTPUT_HINTS.some((hint) => lowered.includes(hint));
  const hasFileHint = FILE_HINTS.some((hint) => lowered.includes(hint));

  if (lowered.includes("pdf") && lowered.includes("summar")) {
    return {
      normalizedIntent,
      clarificationQuestion:
        "For PDF summarize, share the exact command shape you want (example: <tool> report.pdf --out summary.txt). Should --out be optional or required?"
    };
  }

  if (hasFileHint) {
    return {
      normalizedIntent,
      clarificationQuestion:
        "Share preferred command shape (input arg style + output behavior). Example: <tool> input.ext --out output.ext."
    };
  }

  return {
    normalizedIntent,
    clarificationQuestion: hasOutputHint
      ? "Any final constraints before I generate this tool (inputs, format, or edge-cases)?"
      : "What output should this tool produce, and where should it write it?"
  };
}
