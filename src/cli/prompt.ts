import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

export async function askOneQuestion(question: string): Promise<string | null> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return null;
  }

  const rl = createInterface({ input, output });
  try {
    const answer = await rl.question(`${question}\n> `);
    const trimmed = answer.trim();
    return trimmed.length > 0 ? trimmed : null;
  } finally {
    rl.close();
  }
}

