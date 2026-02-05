import { spawn } from "node:child_process";

export interface PythonRunResult {
  startedAt: string;
  endedAt: string;
  exitCode: number;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
}

interface RunPythonToolOptions {
  streamOutput?: boolean;
}

export async function runPythonTool(
  entrypoint: string,
  args: string[],
  options: RunPythonToolOptions = {}
): Promise<PythonRunResult> {
  const startedAt = new Date().toISOString();
  const streamOutput = options.streamOutput ?? true;

  return new Promise<PythonRunResult>((resolve, reject) => {
    const child = spawn("python3", [entrypoint, ...args], {
      env: process.env,
      stdio: ["inherit", "pipe", "pipe"]
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutChunks.push(chunk);
      if (streamOutput) {
        process.stdout.write(chunk);
      }
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk);
      if (streamOutput) {
        process.stderr.write(chunk);
      }
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (exitCode, signal) => {
      resolve({
        startedAt,
        endedAt: new Date().toISOString(),
        exitCode: exitCode ?? 1,
        signal,
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8")
      });
    });
  });
}
