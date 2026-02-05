# AGENTS.md - Infinite CLI

## Mission
Build and iterate Infinite CLI as a terminal-first system that generates disposable tools on demand, with fast feedback loops and minimal ceremony.

## Product Constraints
- No GUI requirement for v0.
- Network access is expected.
- OpenAI API usage is core, not optional.
- Generated tool code is disposable by default.
- Stable value lives in orchestration, registry, logs, and version lineage.

## Stack and Runtime
- Core implementation: Node.js + TypeScript.
- Generated tools: Python first.
- Local state root: `.infinite/`.
- Registry database: `.infinite/registry.db`.

## Current Command Surface
- `infinite "<intent>"`
- `infinite tools`
- `infinite tool show <name>`
- `infinite tool run <name> [args...]`
- `infinite tool improve <name> --feedback "<text>"`

## Execution Policy
- Allow one clarification question before generation/execution when needed.
- After clarification (or no answer), proceed without additional interactive prompts.
- Keep execution permissive for local workflows.

## Repository Map
- `src/index.ts` CLI entrypoint.
- `src/cli/` command wiring, output formatting, prompt utility.
- `src/orchestrator/` intent and generation flow.
- `src/runtime/` generated tool execution.
- `src/registry/` SQLite schema and data access.
- `plans.md` phased implementation roadmap.
- `todo.md` live backlog and status.

## Engineering Rules
- Keep core modules small and composable.
- Prefer explicit types over ad-hoc object shapes.
- Persist meaningful run metadata for debugability.
- Avoid over-engineering abstractions before generation flow is working end-to-end.
- Do not introduce strict sandboxing unless requested by product direction changes.

## Definition of Done (Feature-Level)
- Compiles (`npm run build`) and type-checks (`npm run check`).
- Has at least one CLI-level smoke path.
- Writes state changes deterministically under `.infinite/`.
- Surfaces actionable error output on failure.

## Near-Term Priorities
1. Implement OpenAI-backed candidate generation.
2. Persist generated tools as versioned artifacts in `.infinite/tools/`.
3. Auto-run generated tools from the natural-intent path.
4. Add candidate scoring and parallel generation.
5. Complete `tool improve` regeneration flow.
