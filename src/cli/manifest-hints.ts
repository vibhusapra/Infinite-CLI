import type { ToolManifest } from "../orchestrator/types.js";

export function getRequiredManifestArgs(manifest: ToolManifest | null | undefined): string[] {
  if (!manifest?.arguments || !Array.isArray(manifest.arguments)) {
    return [];
  }

  return manifest.arguments
    .filter((arg) => Boolean(arg?.required) && typeof arg?.name === "string")
    .map((arg) => arg.name.trim())
    .filter((name) => name.length > 0);
}

export function getPreferredManifestExample(manifest: ToolManifest | null | undefined): string | null {
  if (!manifest?.examples || !Array.isArray(manifest.examples)) {
    return null;
  }

  for (const example of manifest.examples) {
    if (typeof example === "string" && example.trim().length > 0) {
      return example.trim();
    }
  }

  return null;
}

export function formatRunTemplate(commandPrefix: string, requiredArgs: string[]): string {
  if (requiredArgs.length === 0) {
    return commandPrefix;
  }

  const placeholders = requiredArgs.map((name) => `<${toPlaceholder(name)}>`);
  return `${commandPrefix} ${placeholders.join(" ")}`;
}

function toPlaceholder(raw: string): string {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .replace(/^--?/, "")
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");

  if (cleaned.length === 0) {
    return "value";
  }

  return cleaned;
}
