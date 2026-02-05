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
- Default Codex generation model: `gpt-5.3-codex` (fallback to `gpt-5-codex` on model-not-found).
- Local state root: `.infinite/`.
- Registry database: `.infinite/registry.db`.

## Current Command Surface
- `infinite "<intent>"`
- `icli <intent>` (alias of `infinite`)
- `icli chat` (interactive onboarding + guided build studio)
- Runtime flags: `--agents <n>` / `--<n>`, `--fast`, `--debug`
- Cleanup: `icli clean`, `icli clean --projects`, `icli clean --all --yes`
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
1. Improve generation prompt quality and candidate reliability.
2. Add richer validation and regression checks for promoted tools.
3. Complete `tool improve` regeneration flow.
4. Add structured generation metadata in registry for analytics.
5. Expand automated tests around orchestration and failure modes.
