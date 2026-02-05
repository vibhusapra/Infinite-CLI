import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Command } from "commander";
import { ensureRuntimePaths, resolveRuntimePaths } from "../config/runtime-paths.js";
import { draftIntent } from "../orchestrator/intent.js";
import { Registry } from "../registry/registry.js";
import { runPythonTool } from "../runtime/python-runner.js";
import { printToolDetails, printToolsTable } from "./format.js";
import { askOneQuestion } from "./prompt.js";

type JsonOption = { json?: boolean };
type ImproveOptions = { feedback: string };

export function buildProgram(): Command {
  const paths = resolveRuntimePaths(process.cwd());
  ensureRuntimePaths(paths);

  const registry = new Registry(paths.dbPath);

  const program = new Command();
  program
    .name("infinite")
    .description("Generate, run, and improve disposable CLI tools.")
    .showHelpAfterError();

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
      const latestVersion = registry.getLatestVersion(name);
      if (!latestVersion) {
        console.error(`No runnable version found for '${name}'.`);
        process.exitCode = 1;
        return;
      }

      const entrypoint = path.isAbsolute(latestVersion.codePath)
        ? latestVersion.codePath
        : path.resolve(paths.rootDir, latestVersion.codePath);

      if (!existsSync(entrypoint)) {
        console.error(`Entrypoint missing: ${entrypoint}`);
        process.exitCode = 1;
        return;
      }

      const runResult = await runPythonTool(entrypoint, args);

      const runId = createRunId();
      const runDir = path.join(paths.runsDir, runId);
      mkdirSync(runDir, { recursive: true });

      const stdoutPath = path.join(runDir, "stdout.log");
      const stderrPath = path.join(runDir, "stderr.log");

      writeFileSync(stdoutPath, runResult.stdout, "utf8");
      writeFileSync(stderrPath, runResult.stderr, "utf8");

      registry.recordRun({
        toolVersionId: latestVersion.id,
        command: "python3",
        args: [entrypoint, ...args],
        startedAt: runResult.startedAt,
        endedAt: runResult.endedAt,
        exitCode: runResult.exitCode,
        stdoutPath,
        stderrPath
      });

      if (runResult.signal) {
        console.error(`Tool terminated by signal ${runResult.signal}`);
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
      }

      console.log("Intent intake captured.");
      console.log(`Intent: ${draft.normalizedIntent}`);
      if (draft.clarificationQuestion) {
        console.log(`Clarification asked: ${draft.clarificationQuestion}`);
        console.log(`Clarification response: ${clarificationResponse ?? "(none provided)"}`);
      }
      console.log("Generation pipeline scaffolded. Next step: wire OpenAI candidate generation.");
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

function createRunId(): string {
  const ts = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  return `${ts}-${random}`;
}

