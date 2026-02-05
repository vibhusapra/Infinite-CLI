import { spawn } from "node:child_process";

export interface RunCommandOptions {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  stdin?: string;
}

export interface RunCommandResult {
  command: string;
  args: string[];
  cwd: string;
  startedAt: string;
  endedAt: string;
  exitCode: number;
  signal: NodeJS.Signals | null;
  timedOut: boolean;
  stdout: string;
  stderr: string;
}

export async function runCommand(
  command: string,
  args: string[],
  options: RunCommandOptions = {}
): Promise<RunCommandResult> {
  const cwd = options.cwd ?? process.cwd();
  const startedAt = new Date().toISOString();

  return new Promise<RunCommandResult>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: options.env ?? process.env,
      stdio: "pipe"
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let timedOut = false;
    let timer: NodeJS.Timeout | null = null;

    if (typeof options.timeoutMs === "number" && options.timeoutMs > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
      }, options.timeoutMs);
    }

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutChunks.push(chunk);
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk);
    });

    child.on("error", (error) => {
      if (timer) {
        clearTimeout(timer);
      }
      reject(error);
    });

    if (options.stdin && options.stdin.length > 0) {
      child.stdin.write(options.stdin);
    }
    child.stdin.end();

    child.on("close", (exitCode, signal) => {
      if (timer) {
        clearTimeout(timer);
      }

      resolve({
        command,
        args,
        cwd,
        startedAt,
        endedAt: new Date().toISOString(),
        exitCode: exitCode ?? 1,
        signal,
        timedOut,
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8")
      });
    });
  });
}

