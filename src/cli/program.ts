import { rmSync } from "node:fs";
import path from "node:path";
import { Command } from "commander";
import { loadInfiniteConfig } from "../config/env.js";
import { ensureRuntimePaths, resolveRuntimePaths } from "../config/runtime-paths.js";
import { performCleanup } from "../maintenance/cleanup.js";
import { ProgressNarrator } from "../narration/progress-narrator.js";
import { GenerationFailureError, generateToolFromIntent } from "../orchestrator/generator.js";
import { draftIntent } from "../orchestrator/intent.js";
import type { GenerationProgressEvent } from "../orchestrator/types.js";
import { resolveRepoRoot } from "../orchestrator/worktree-manager.js";
import { Registry } from "../registry/registry.js";
import { printToolDetails, printToolsTable } from "./format.js";
import { formatRunTemplate, getPreferredManifestExample, getRequiredManifestArgs } from "./manifest-hints.js";
import { askOneQuestion, confirmYesNo } from "./prompt.js";
import { parseInteger, parseStrategyOption, resolveRuntimeGenerationConfig, type RuntimeOptions } from "./runtime-options.js";
import { runStudioSession } from "./studio.js";
import { runAndRecordByVersion, runLatestToolByName } from "./tool-execution.js";

type JsonOption = { json?: boolean };
type ImproveOptions = { feedback: string };
type ToolCleanOptions = { yes?: boolean };
type CleanOptions = {
  projects?: boolean;
  logs?: boolean;
  artifacts?: boolean;
  all?: boolean;
  yes?: boolean;
};

export function buildProgram(): Command {
  const paths = resolveRuntimePaths(process.cwd());
  ensureRuntimePaths(paths);
  const config = loadInfiniteConfig();

  const registry = new Registry(paths.dbPath);

  const program = new Command();
  program
    .name("infinite")
    .description("Generate, run, and improve disposable CLI tools.")
    .option("-j, --agents <count>", "Parallel candidate agents/worktrees (1-5)", parseInteger)
    .option("--strategy <mode>", "Candidate strategy: adaptive or parallel", parseStrategyOption)
    .option("--score-cutoff <score>", "Early stop score cutoff for adaptive strategy", parseInteger)
    .option("--retry-budget <count>", "Codex retries per candidate (0-2)", parseInteger)
    .option("--fanout-delay-ms <ms>", "Delay before adaptive fanout launch (ms)", parseInteger)
    .option("--fast", "Fast mode: defaults to 1 agent and lower generation timeout")
    .option("--debug", "Debug mode: keep worktrees and print extra diagnostics")
    .option("--narrate", "Enable secondary LLM narration of progress (enabled by default)")
    .option("--no-narrate", "Disable secondary LLM narration of progress")
    .showHelpAfterError();

  program
    .command("chat")
    .description("Open interactive studio mode with onboarding and guided tool building.")
    .option("-j, --agents <count>", "Parallel candidate agents/worktrees (1-5)", parseInteger)
    .option("--strategy <mode>", "Candidate strategy: adaptive or parallel", parseStrategyOption)
    .option("--score-cutoff <score>", "Early stop score cutoff for adaptive strategy", parseInteger)
    .option("--retry-budget <count>", "Codex retries per candidate (0-2)", parseInteger)
    .option("--fanout-delay-ms <ms>", "Delay before adaptive fanout launch (ms)", parseInteger)
    .option("--fast", "Fast mode: defaults to 1 agent and lower generation timeout")
    .option("--debug", "Debug mode: keep worktrees and keep worktree artifacts")
    .option("--narrate", "Enable secondary LLM narration of progress (enabled by default)")
    .option("--no-narrate", "Disable secondary LLM narration of progress")
    .action(async (options: RuntimeOptions) => {
      const globalOptions = program.opts<RuntimeOptions>();
      const mergedOptions = mergeRuntimeOptions(globalOptions, options);

      await runStudioSession({
        config,
        paths,
        registry,
        options: mergedOptions
      });
    });

  program
    .command("clean")
    .description("Clean old generated projects and runtime state under .infinite/")
    .option("--projects", "Remove generated tool projects and registry tool data")
    .option("--logs", "Remove generation jobs, run logs, and temporary worktrees")
    .option("--artifacts", "Remove files in .infinite/artifacts")
    .option("--all", "Remove projects, logs, and artifacts")
    .option("-y, --yes", "Skip confirmation prompt")
    .action(async (options: CleanOptions) => {
      const normalized = normalizeCleanupOptions(options);
      if (!normalized.projects && !normalized.logs && !normalized.artifacts) {
        console.log("Nothing to clean.");
        return;
      }

      const needsConfirmation = normalized.projects || normalized.all;
      if (needsConfirmation && !options.yes) {
        const proceed = await confirmYesNo(
          "This will delete generated projects and can remove tool history. Continue?",
          true
        );
        if (!proceed) {
          console.log("Cancelled cleanup.");
          return;
        }
      }

      const summary = performCleanup({
        paths,
        registry,
        options: {
          projects: normalized.projects,
          logs: normalized.logs,
          artifacts: normalized.artifacts
        }
      });

      console.log("Cleanup complete.");
      console.log(`- removed tool records: ${summary.removedToolRecords}`);
      console.log(`- removed tool directories: ${summary.removedToolDirectories}`);
      console.log(`- removed job directories: ${summary.removedJobDirectories}`);
      console.log(`- removed run directories: ${summary.removedRunDirectories}`);
      console.log(`- removed worktree directories: ${summary.removedWorktreeDirectories}`);
      console.log(`- removed artifact entries: ${summary.removedArtifactEntries}`);
    });

  program
    .command("tools")
    .description("List installed/generated tools.")
    .option("--json", "Output JSON")
    .action((options: JsonOption) => {
      const tools = registry.listTools();
      if (options.json) {
        console.log(JSON.stringify(tools, null, 2));
        return;
      }

      printToolsTable(tools);
    });

  const tool = program.command("tool").description("Inspect and manage generated tools.");

  tool
    .command("show")
    .argument("<name>", "Tool name")
    .option("--json", "Output JSON")
    .description("Shows description, schema, examples, version, and recent runs.")
    .action((name: string, options: JsonOption) => {
      const details = registry.getToolByName(name);
      if (!details) {
        console.error(`Tool '${name}' was not found.`);
        process.exitCode = 1;
        return;
      }

      if (options.json) {
        console.log(JSON.stringify(details, null, 2));
        return;
      }

      printToolDetails(details);
    });

  tool
    .command("run")
    .argument("<name>", "Tool name")
    .argument("[args...]", "Arguments passed to the tool entrypoint")
    .description("Direct invocation of a generated tool.")
    .action(async (name: string, args: string[] = []) => {
      const runResult = await runLatestToolByName({
        name,
        args,
        paths,
        registry
      });

      if (!runResult) {
        console.error(`No runnable version found for '${name}'.`);
        process.exitCode = 1;
        return;
      }

      process.exitCode = runResult.exitCode;
    });

  tool
    .command("improve")
    .argument("<name>", "Tool name")
    .requiredOption("--feedback <text>", "Feedback to guide next version")
    .description("Store feedback for future tool regeneration.")
    .action((name: string, options: ImproveOptions) => {
      const feedback = options.feedback.trim();
      if (feedback.length === 0) {
        console.error("--feedback must be non-empty.");
        process.exitCode = 1;
        return;
      }

      const saved = registry.addFeedback(name, feedback);
      if (!saved) {
        console.error(`Tool '${name}' was not found.`);
        process.exitCode = 1;
        return;
      }

      console.log(`Stored feedback for '${name}'.`);
    });

  tool
    .command("clean")
    .argument("<name>", "Tool name")
    .option("-y, --yes", "Skip confirmation prompt")
    .description("Delete one generated tool (all versions/history) from registry and disk.")
    .action(async (name: string, options: ToolCleanOptions) => {
      if (!options.yes) {
        const proceed = await confirmYesNo(
          `Delete tool '${name}' and all of its versions/history?`,
          true
        );
        if (!proceed) {
          console.log("Cancelled.");
          return;
        }
      }

      const deleted = registry.deleteToolByName(name);
      const toolDir = path.join(paths.toolsDir, name);
      rmSync(toolDir, { recursive: true, force: true });

      if (!deleted.deleted) {
        console.log(`Tool '${name}' was not in registry. Removed local directory if present.`);
        return;
      }

      console.log(`Deleted tool '${name}' from registry and local projects.`);
    });

  program
    .argument("[intent...]", "Natural command to generate or run")
    .action(async (intentParts: string[]) => {
      if (!intentParts || intentParts.length === 0) {
        program.outputHelp();
        return;
      }

      const intent = intentParts.join(" ");
      const draft = draftIntent(intent);

      let clarificationResponse: string | null = null;
      if (draft.clarificationQuestion) {
        clarificationResponse = await askOneQuestion(draft.clarificationQuestion);
        if (clarificationResponse) {
          console.log(`\n[input] Clarification received: "${clarificationResponse}"`);
        } else {
          console.log("\n[input] No clarification provided. Continuing with original intent.");
        }
      }

      if (!config.openAIApiKey) {
        console.error("Warning: OPENAI_API_KEY is not set. Generated OpenAI tools may fail at runtime.");
      }

      const repoRoot = await resolveRepoRoot(process.cwd());
      const runtimeOptions = program.opts<RuntimeOptions>();
      const runtimeConfig = resolveRuntimeGenerationConfig(
        {
          candidateCount: config.candidateCount,
          codexTimeoutMs: config.codexTimeoutMs,
          keepWorktrees: config.keepWorktrees,
          strategy: config.strategy,
          scoreCutoff: config.scoreCutoff,
          retryBudget: config.retryBudget,
          fanoutDelayMs: config.fanoutDelayMs
        },
        runtimeOptions
      );
      console.log(
        `[config] strategy=${runtimeConfig.strategy} agents=${runtimeConfig.candidateCount} cutoff=${runtimeConfig.scoreCutoff} retries=${runtimeConfig.retryBudget} fanoutDelayMs=${runtimeConfig.fanoutDelayMs} timeoutMs=${runtimeConfig.codexTimeoutMs} keepWorktrees=${runtimeConfig.keepWorktrees} fast=${runtimeConfig.fast} debug=${runtimeConfig.debug} narrate=${runtimeOptions.narrate !== false}`
      );

      const narrator = new ProgressNarrator({
        enabled: runtimeOptions.narrate !== false,
        intent: draft.normalizedIntent,
        apiKey: config.openAIApiKey,
        model: config.narratorModel,
        flushIntervalMs: config.narratorFlushMs
      });
      narrator.start();

      try {
        const generation = await generateToolFromIntent({
          request: {
            intent: draft.normalizedIntent,
            clarification: clarificationResponse
          },
          settings: {
            codexBinary: config.codexBinary,
            codexModel: config.codexModel,
            candidateCount: runtimeConfig.candidateCount,
            codexTimeoutMs: runtimeConfig.codexTimeoutMs,
            keepWorktrees: runtimeConfig.keepWorktrees,
            strategy: runtimeConfig.strategy,
            scoreCutoff: runtimeConfig.scoreCutoff,
            retryBudget: runtimeConfig.retryBudget,
            fanoutDelayMs: runtimeConfig.fanoutDelayMs
          },
          context: {
            paths,
            repoRoot
          },
          registry,
          reporter: (event) => {
            printProgress(event);
            narrator.push(event);
          }
        }).catch((error: unknown) => {
          if (error instanceof GenerationFailureError) {
            console.error(`\n[error] Generation failed for job ${error.jobId}`);
            for (const candidate of error.candidates) {
              console.error(
                `  - ${candidate.candidateId}: score=${candidate.score} (${candidate.summary})`
              );
              console.error(`    codex summary: ${candidate.logs.codexLastMessagePath}`);
              console.error(`    codex stderr: ${candidate.logs.codexStderrPath}`);
              console.error(`    compile stderr: ${candidate.logs.compileStderrPath}`);
              console.error(`    smoke stderr: ${candidate.logs.smokeStderrPath}`);
            }
            console.error(`[hint] Job logs: ${error.jobDir}`);
            console.error(`[hint] Inspect: ${path.join(error.jobDir, "candidate-*/logs/*.log")}`);
            process.exitCode = 1;
            return null;
          }

          throw error;
        });

        if (!generation) {
          return;
        }

        console.log(`Generated tool '${generation.toolName}' v${generation.version}.`);
        console.log(
          `Selected ${generation.selectedCandidate.candidateId} score=${generation.selectedCandidate.score} (${generation.selectedCandidate.summary}).`
        );
        console.log(`[info] Generation job artifacts: ${generation.jobDir}`);
        if (runtimeConfig.debug) {
          console.log(`[debug] Worktrees are kept under: ${paths.worktreesDir}`);
        }

        const requiredManifestArgs = getRequiredManifestArgs(generation.selectedCandidate.manifest);
        if (requiredManifestArgs.length > 0) {
          console.log(
            `[hint] Skipping auto-run: '${generation.toolName}' requires input args (${requiredManifestArgs.join(", ")}).`
          );
          console.log(
            `[hint] Try: ${formatRunTemplate(
              `icli tool run ${generation.toolName} --`,
              requiredManifestArgs
            )}`
          );
          const example = getPreferredManifestExample(generation.selectedCandidate.manifest);
          if (example) {
            console.log(`[hint] Manifest example: ${example}`);
          }
          process.exitCode = 0;
          return;
        }

        const runResult = await runAndRecordByVersion({
          toolVersionId: generation.toolVersionId,
          codePath: generation.codePath,
          args: [],
          paths,
          registry,
          streamOutput: false
        });

        if (isLikelyMissingRequiredArgs(runResult)) {
          console.log(
            `[hint] Tool '${generation.toolName}' needs required args. Try: icli tool run ${generation.toolName} -- --help`
          );
          process.exitCode = 0;
          return;
        }

        process.exitCode = runResult.exitCode;
      } finally {
        await narrator.close();
      }
    });

  const closeRegistry = (): void => {
    registry.close();
  };

  process.on("beforeExit", closeRegistry);
  process.on("SIGINT", () => {
    closeRegistry();
    process.exit(130);
  });
  process.on("SIGTERM", () => {
    closeRegistry();
    process.exit(143);
  });

  return program;
}

function printProgress(event: GenerationProgressEvent): void {
  const prefix = event.candidateId ? `[${event.candidateId}]` : "[job]";
  const timestamp = new Date().toLocaleTimeString();
  console.log(`[${timestamp}]${prefix} ${event.message}`);
}


function mergeRuntimeOptions(base: RuntimeOptions, override: RuntimeOptions): RuntimeOptions {
  return {
    agents: override.agents ?? base.agents,
    fast: override.fast ?? base.fast,
    debug: override.debug ?? base.debug,
    narrate: override.narrate ?? base.narrate,
    strategy: override.strategy ?? base.strategy,
    scoreCutoff: override.scoreCutoff ?? base.scoreCutoff,
    retryBudget: override.retryBudget ?? base.retryBudget,
    fanoutDelayMs: override.fanoutDelayMs ?? base.fanoutDelayMs
  };
}

function normalizeCleanupOptions(options: CleanOptions): {
  projects: boolean;
  logs: boolean;
  artifacts: boolean;
  all: boolean;
} {
  const all = Boolean(options.all);
  const projects = all || Boolean(options.projects);
  const logs = all || Boolean(options.logs);
  const artifacts = all || Boolean(options.artifacts);

  if (!projects && !logs && !artifacts) {
    return {
      projects: false,
      logs: true,
      artifacts: false,
      all: false
    };
  }

  return {
    projects,
    logs,
    artifacts,
    all
  };
}

function isLikelyMissingRequiredArgs(runResult: { exitCode: number; stderr: string }): boolean {
  if (runResult.exitCode === 0) {
    return false;
  }

  const lowered = runResult.stderr.toLowerCase();
  return (
    lowered.includes("the following arguments are required") ||
    (lowered.includes("usage:") && lowered.includes("error:"))
  );
}
