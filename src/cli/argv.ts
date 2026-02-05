const AGENT_SHORTHAND_PATTERN = /^--(\d+)$/;

export function normalizeCliArgv(argv: string[]): string[] {
  if (argv.length <= 2) {
    return argv;
  }

  const normalized = argv.slice(0, 2);

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    const shorthandMatch = token.match(AGENT_SHORTHAND_PATTERN);

    if (shorthandMatch) {
      normalized.push("--agents", shorthandMatch[1]);
      continue;
    }

    normalized.push(token);
  }

  return normalized;
}

