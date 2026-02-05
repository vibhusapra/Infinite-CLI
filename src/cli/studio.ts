import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import path from "node:path";
import type { InfiniteConfig } from "../config/env.js";
import type { RuntimePaths } from "../config/runtime-paths.js";
import { ProgressNarrator } from "../narration/progress-narrator.js";
import { GenerationFailureError, generateToolFromIntent } from "../orchestrator/generator.js";
import { draftIntent } from "../orchestrator/intent.js";
import type { GenerationProgressEvent } from "../orchestrator/types.js";
import { resolveRepoRoot } from "../orchestrator/worktree-manager.js";
import { Registry } from "../registry/registry.js";
import { printToolDetails, printToolsTable } from "./format.js";
import { formatRunTemplate, getPreferredManifestExample, getRequiredManifestArgs } from "./manifest-hints.js";
import {
  parseInteger,
  parseStrategyOption,
  resolveRuntimeGenerationConfig,
  type RuntimeGenerationConfig,
  type RuntimeOptions
} from "./runtime-options.js";
import { runAndRecordByVersion, runLatestToolByName } from "./tool-execution.js";

interface StudioInput {
  config: InfiniteConfig;
  paths: RuntimePaths;
  registry: Registry;
  options: RuntimeOptions;
}

export async function runStudioSession(inputData: StudioInput): Promise<void> {
  const repoRoot = await resolveRepoRoot(process.cwd());
  const rl = createInterface({ input, output });

  let sessionOptions: RuntimeOptions = {
    agents: inputData.options.agents,
    strategy: inputData.options.strategy,
    scoreCutoff: inputData.options.scoreCutoff,
    retryBudget: inputData.options.retryBudget,
    fanoutDelayMs: inputData.options.fanoutDelayMs,
    fast: inputData.options.fast,
    debug: inputData.options.debug,
    narrate: inputData.options.narrate
  };

  printStudioBanner();
  printStudioHelp();

  if (!inputData.config.openAIApiKey) {
    console.log(warn("OPENAI_API_KEY is not set. OpenAI-based generated tools may fail at runtime."));
  }

  while (true) {
    const line = (await rl.question(color.cyan("studio> "))).trim();
    if (line.length === 0) {
      continue;
    }

    if (line === "/exit" || line === "/quit") {
      console.log(color.dim("Exiting studio."));
      break;
    }

    if (line === "/help") {
      printStudioHelp();
      continue;
    }

    if (line === "/tools") {
      printToolsTable(inputData.registry.listTools());
      continue;
    }

    if (line.startsWith("/show ")) {
      const toolName = line.slice("/show ".length).trim();
      if (toolName.length === 0) {
        console.log(warn("Usage: /show <tool-name>"));
        continue;
      }

      const details = inputData.registry.getToolByName(toolName);
      if (!details) {
        console.log(warn(`Tool '${toolName}' was not found.`));
        continue;
      }
      printToolDetails(details);
      continue;
    }

    if (line.startsWith("/run ")) {
      const args = splitWords(line.slice("/run ".length).trim());
      const toolName = args[0];
      if (!toolName) {
        console.log(warn("Usage: /run <tool-name> [args...]"));
        continue;
      }

      const result = await runLatestToolByName({
        name: toolName,
        args: args.slice(1),
        paths: inputData.paths,
        registry: inputData.registry
      });

      if (!result) {
        console.log(warn(`No runnable version found for '${toolName}'.`));
        continue;
      }

      console.log(
        color.dim(`run exit=${result.exitCode} logs=${result.runDir}`)
      );
      continue;
    }

    if (line.startsWith("/agents ")) {
      const raw = line.slice("/agents ".length).trim();
      try {
        sessionOptions.agents = parseInteger(raw);
        console.log(color.green(`agents set to ${sessionOptions.agents}`));
      } catch (error) {
        console.log(warn(error instanceof Error ? error.message : String(error)));
      }
      continue;
    }

    if (line.startsWith("/strategy ")) {
      const raw = line.slice("/strategy ".length).trim();
      try {
        sessionOptions.strategy = parseStrategyOption(raw);
        console.log(color.green(`strategy=${sessionOptions.strategy}`));
      } catch (error) {
        console.log(warn(error instanceof Error ? error.message : String(error)));
      }
      continue;
    }

    if (line.startsWith("/fast")) {
      sessionOptions.fast = applyToggleCommand(line, sessionOptions.fast);
      console.log(color.green(`fast=${Boolean(sessionOptions.fast)}`));
      continue;
    }

    if (line.startsWith("/debug")) {
      sessionOptions.debug = applyToggleCommand(line, sessionOptions.debug);
      console.log(color.green(`debug=${Boolean(sessionOptions.debug)}`));
      continue;
    }

    if (line.startsWith("/narrate")) {
      sessionOptions.narrate = applyToggleCommand(line, sessionOptions.narrate ?? true);
      console.log(color.green(`narrate=${Boolean(sessionOptions.narrate)}`));
      continue;
    }

    if (line === "/flags") {
      const runtimeConfig = resolveConfig(inputData.config, sessionOptions);
      printRuntimeConfig(runtimeConfig, sessionOptions.narrate !== false);
      continue;
    }

    await handleBuildRequest({
      intent: line,
      repoRoot,
      config: inputData.config,
      paths: inputData.paths,
      registry: inputData.registry,
      options: sessionOptions,
      rl
    });
  }

  rl.close();
}

interface BuildRequestInput {
  intent: string;
  repoRoot: string;
  config: InfiniteConfig;
  paths: RuntimePaths;
  registry: Registry;
  options: RuntimeOptions;
  rl: ReturnType<typeof createInterface>;
}

async function handleBuildRequest(input: BuildRequestInput): Promise<void> {
  const draft = draftIntent(input.intent);
  let clarificationResponse: string | null = null;

  if (draft.clarificationQuestion) {
    clarificationResponse = (await input.rl.question(`${draft.clarificationQuestion}\n> `)).trim() || null;
    if (clarificationResponse) {
      console.log(color.dim(`[input] Clarification received: "${clarificationResponse}"`));
    } else {
      console.log(color.dim("[input] No clarification provided. Continuing."));
    }
  }

  const runtimeConfig = resolveConfig(input.config, input.options);
  printRuntimeConfig(runtimeConfig, input.options.narrate !== false);

  const narrator = new ProgressNarrator({
    enabled: input.options.narrate !== false,
    intent: draft.normalizedIntent,
    apiKey: input.config.openAIApiKey,
    model: input.config.narratorModel,
    flushIntervalMs: input.config.narratorFlushMs
  });
  narrator.start();

  try {
    const generation = await generateToolFromIntent({
      request: {
        intent: draft.normalizedIntent,
        clarification: clarificationResponse
      },
      settings: {
        codexBinary: input.config.codexBinary,
        codexModel: input.config.codexModel,
        candidateCount: runtimeConfig.candidateCount,
        codexTimeoutMs: runtimeConfig.codexTimeoutMs,
        keepWorktrees: runtimeConfig.keepWorktrees,
        strategy: runtimeConfig.strategy,
        scoreCutoff: runtimeConfig.scoreCutoff,
        retryBudget: runtimeConfig.retryBudget,
        fanoutDelayMs: runtimeConfig.fanoutDelayMs
      },
      context: {
        paths: input.paths,
        repoRoot: input.repoRoot
      },
      registry: input.registry,
      reporter: (event) => {
        printProgress(event);
        narrator.push(event);
      }
    }).catch((error: unknown) => {
      if (error instanceof GenerationFailureError) {
        console.log(warn(`Generation failed for job ${error.jobId}`));
        for (const candidate of error.candidates) {
          console.log(
            `  - ${candidate.candidateId}: score=${candidate.score} (${candidate.summary})`
          );
          console.log(`    codex summary: ${candidate.logs.codexLastMessagePath}`);
          console.log(`    codex stderr: ${candidate.logs.codexStderrPath}`);
          console.log(`    compile stderr: ${candidate.logs.compileStderrPath}`);
          console.log(`    smoke stderr: ${candidate.logs.smokeStderrPath}`);
        }
        console.log(color.dim(`job logs: ${error.jobDir}`));
        return null;
      }

      throw error;
    });

    if (!generation) {
      return;
    }

    console.log(
      color.green(
        `Generated '${generation.toolName}' v${generation.version} via ${generation.selectedCandidate.candidateId} (score=${generation.selectedCandidate.score}).`
      )
    );
    console.log(color.dim(`job artifacts: ${generation.jobDir}`));

    const requiredManifestArgs = getRequiredManifestArgs(generation.selectedCandidate.manifest);
    if (requiredManifestArgs.length > 0) {
      console.log(
        color.yellow(
          `Skipping auto-run: '${generation.toolName}' requires input args (${requiredManifestArgs.join(", ")}).`
        )
      );
      console.log(
        color.dim(
          `Try: ${formatRunTemplate(`/run ${generation.toolName}`, requiredManifestArgs)}`
        )
      );
      const example = getPreferredManifestExample(generation.selectedCandidate.manifest);
      if (example) {
        console.log(color.dim(`manifest example: ${example}`));
      }
      return;
    }

    const runResult = await runAndRecordByVersion({
      toolVersionId: generation.toolVersionId,
      codePath: generation.codePath,
      args: [],
      paths: input.paths,
      registry: input.registry,
      streamOutput: false
    });

    if (isLikelyMissingRequiredArgs(runResult.exitCode, runResult.stderr)) {
      console.log(
        color.yellow(
          `Tool '${generation.toolName}' needs required args. Try: /run ${generation.toolName} --help`
        )
      );
      console.log(color.dim(`logs=${runResult.runDir}`));
      if (runtimeConfig.debug) {
        console.log(color.dim(`worktrees: ${input.paths.worktreesDir}`));
      }
      return;
    }

    console.log(color.dim(`run exit=${runResult.exitCode} logs=${runResult.runDir}`));
    if (runtimeConfig.debug) {
      console.log(color.dim(`worktrees: ${input.paths.worktreesDir}`));
    }
  } finally {
    await narrator.close();
  }
}

function printStudioBanner(): void {
  const lines = [
    "+--------------------------------------------------------------------------+",
    "|   ___ _____ _      ___     ____ _     ___   ____ _____ _   _ ____  ___  |",
    "|  |_ _|_   _| |    |_ _|   / ___| |   |_ _| / ___|_   _| | | |  _ \\|_ _| |",
    "|   | |  | | | |     | |   | |   | |    | |  \\___ \\ | | | | | | | | || |  |",
    "|   | |  | | | |___  | |   | |___| |___ | |   ___) || | | |_| | |_| || |  |",
    "|  |___| |_| |_____|___|    \\____|_____|___| |____/ |_|  \\___/|____/|___| |",
    "+--------------------------------------------------------------------------+",
    "| Build tiny software with Codex worktrees in parallel.                    |",
    "+--------------------------------------------------------------------------+"
  ];

  console.log(color.magenta(lines.join("\n")));
}

function printStudioHelp(): void {
  console.log(color.bold("\nCommands"));
  console.log("  /help                 Show this help");
  console.log("  /tools                List generated tools");
  console.log("  /show <name>          Show tool details");
  console.log("  /run <name> [args]    Run a generated tool");
  console.log("  /agents <1-5>         Set parallel candidate count");
  console.log("  /strategy <mode>      Set candidate strategy (adaptive|parallel)");
  console.log("  /fast [on|off]        Toggle fast preset");
  console.log("  /debug [on|off]       Toggle debug preset");
  console.log("  /narrate [on|off]     Toggle secondary LLM narration");
  console.log("  /flags                Show current runtime flags");
  console.log("  /exit                 Exit studio");
  console.log(color.dim("\nType any non-command sentence to build a tool."));
}

function printRuntimeConfig(config: RuntimeGenerationConfig, narrate: boolean): void {
  console.log(
    `[config] strategy=${config.strategy} agents=${config.candidateCount} cutoff=${config.scoreCutoff} retries=${config.retryBudget} fanoutDelayMs=${config.fanoutDelayMs} timeoutMs=${config.codexTimeoutMs} keepWorktrees=${config.keepWorktrees} fast=${config.fast} debug=${config.debug} narrate=${narrate}`
  );
}

function resolveConfig(config: InfiniteConfig, options: RuntimeOptions): RuntimeGenerationConfig {
  return resolveRuntimeGenerationConfig(
    {
      candidateCount: config.candidateCount,
      codexTimeoutMs: config.codexTimeoutMs,
      keepWorktrees: config.keepWorktrees,
      strategy: config.strategy,
      scoreCutoff: config.scoreCutoff,
      retryBudget: config.retryBudget,
      fanoutDelayMs: config.fanoutDelayMs
    },
    options
  );
}

function printProgress(event: GenerationProgressEvent): void {
  const prefix = event.candidateId ? `[${event.candidateId}]` : "[job]";
  const timestamp = new Date().toLocaleTimeString();
  console.log(`[${timestamp}]${prefix} ${event.message}`);
}

function applyToggleCommand(line: string, current: boolean | undefined): boolean {
  const parts = line.split(/\s+/).filter((part) => part.length > 0);
  const rawValue = parts[1]?.toLowerCase();
  if (!rawValue) {
    return !Boolean(current);
  }

  if (["on", "true", "1", "yes"].includes(rawValue)) {
    return true;
  }

  if (["off", "false", "0", "no"].includes(rawValue)) {
    return false;
  }

  return !Boolean(current);
}

function splitWords(line: string): string[] {
  if (line.length === 0) {
    return [];
  }
  return line.split(/\s+/).filter((part) => part.length > 0);
}

function warn(message: string): string {
  return color.yellow(`warning: ${message}`);
}

function isLikelyMissingRequiredArgs(exitCode: number, stderr: string): boolean {
  if (exitCode === 0) {
    return false;
  }

  const lowered = stderr.toLowerCase();
  return (
    lowered.includes("the following arguments are required") ||
    (lowered.includes("usage:") && lowered.includes("error:"))
  );
}

const color = {
  reset: "\u001b[0m",
  bold: (value: string) => `\u001b[1m${value}\u001b[0m`,
  dim: (value: string) => `\u001b[2m${value}\u001b[0m`,
  cyan: (value: string) => `\u001b[36m${value}\u001b[0m`,
  magenta: (value: string) => `\u001b[35m${value}\u001b[0m`,
  green: (value: string) => `\u001b[32m${value}\u001b[0m`,
  yellow: (value: string) => `\u001b[33m${value}\u001b[0m`
};
