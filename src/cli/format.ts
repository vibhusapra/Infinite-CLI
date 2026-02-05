import type { ToolDetails, ToolListRow } from "../registry/types.js";

export function printToolsTable(tools: ToolListRow[]): void {
  if (tools.length === 0) {
    console.log("No tools installed yet.");
    return;
  }

  const rows = tools.map((tool) => ({
    name: tool.name,
    version: `v${tool.latestVersion}`,
    status: tool.status,
    lastRun: tool.lastRunAt ?? "never",
    lastExit: tool.lastExitCode === null ? "-" : String(tool.lastExitCode)
  }));

  console.log("NAME\tVERSION\tSTATUS\tLAST_RUN\tLAST_EXIT");
  for (const row of rows) {
    console.log(`${row.name}\t${row.version}\t${row.status}\t${row.lastRun}\t${row.lastExit}`);
  }
}

export function printToolDetails(details: ToolDetails): void {
  console.log(`Name: ${details.name}`);
  console.log(`Status: ${details.status}`);
  console.log(`Created: ${details.createdAt}`);
  console.log(`Latest Version: v${details.latestVersion}`);
  console.log("");
  console.log("Versions:");

  if (details.versions.length === 0) {
    console.log("- none");
  } else {
    for (const version of details.versions) {
      console.log(
        `- v${version.version} | score=${version.score ?? "n/a"} | created=${version.createdAt} | code=${version.codePath}`
      );
      const manifestSummary = summarizeManifest(version.manifest);
      console.log(`  manifest: ${manifestSummary}`);
    }
  }

  console.log("");
  console.log("Recent Feedback:");
  if (details.recentFeedback.length === 0) {
    console.log("- none");
  } else {
    for (const feedback of details.recentFeedback) {
      console.log(`- ${feedback.createdAt}: ${feedback.text}`);
    }
  }
}

function summarizeManifest(manifest: unknown): string {
  if (manifest === null || manifest === undefined) {
    return "null";
  }

  if (typeof manifest === "string") {
    return manifest;
  }

  try {
    return JSON.stringify(manifest);
  } catch {
    return "[unserializable manifest]";
  }
}

