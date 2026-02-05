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

export async function confirmYesNo(question: string, defaultNo: boolean = true): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return !defaultNo;
  }

  const rl = createInterface({ input, output });
  try {
    const suffix = defaultNo ? " [y/N]" : " [Y/n]";
    const answer = (await rl.question(`${question}${suffix}\n> `)).trim().toLowerCase();

    if (answer.length === 0) {
      return !defaultNo;
    }

    if (["y", "yes"].includes(answer)) {
      return true;
    }

    if (["n", "no"].includes(answer)) {
      return false;
    }

    return false;
  } finally {
    rl.close();
  }
}
