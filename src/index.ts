#!/usr/bin/env node

import { normalizeCliArgv } from "./cli/argv.js";
import { buildProgram } from "./cli/program.js";

async function main(): Promise<void> {
  const program = buildProgram();
  const argv = normalizeCliArgv(process.argv);
  await program.parseAsync(argv);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Error: ${message}`);
  process.exitCode = 1;
});
