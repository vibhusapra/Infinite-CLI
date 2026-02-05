# Infinite CLI - TODO

## Snapshot
- Stack: Node.js + TypeScript.
- Generated tool runtime: Python.
- Default generation model: `gpt-5.3-codex` (with fallback to `gpt-5-codex`).
- UX policy: allow exactly 1 clarification question before execution.
- Runtime state: `.infinite/` local workspace.

## Done
- [x] Initialize Node.js + TypeScript project (`package.json`, `tsconfig.json`).
- [x] Add CLI entrypoint and command tree:
  - [x] `infinite "<intent>"`
  - [x] `infinite tools`
  - [x] `infinite tool show <name>`
  - [x] `infinite tool run <name> [args...]`
  - [x] `infinite tool improve <name> --feedback "<text>"`
- [x] Bootstrap `.infinite/` directories.
- [x] Add SQLite registry schema (`tools`, `tool_versions`, `runs`, `feedback`).
- [x] Implement tool listing and tool details reads from registry.
- [x] Implement feedback persistence.
- [x] Implement Python runtime invocation path for existing tool versions.
- [x] Capture run logs to `.infinite/runs/<run-id>/stdout.log` and `stderr.log`.
- [x] Add TypeScript compile and type-check scripts.
- [x] Add environment config and `.env.example` for API/model settings.
- [x] Implement worktree-based parallel candidate generation via Codex CLI.
- [x] Implement candidate validation (`manifest`, `py_compile`, `smoke_test.py`) and scoring.
- [x] Implement candidate promotion to `.infinite/tools/<name>/v<version>/`.
- [x] Wire natural-intent flow to generate, promote, and auto-run winning candidate.
- [x] Add baseline unit tests (`spec` + scoring).
- [x] Add CLI UX override for parallel agents: `--agents <n>` and shorthand `--<n>` (e.g., `--4`).
- [x] Add `--fast` and `--debug` runtime presets for quicker or more inspectable generation runs.

## In Progress
- [ ] Improve prompts and validation to increase candidate pass rate across varied intents.

## Next Up (Priority Order)
- [ ] Add richer prompt variants per candidate strategy (minimal/robust/fast).
- [ ] Add stronger candidate regression checks beyond smoke tests.
- [ ] Store generation summary metadata in registry (job id, candidate ranking details).
- [ ] Add `--json` mode for `tool run` and natural-intent generation outputs.
- [ ] Add retry policy for transient Codex API failures.

## After Single Candidate Works
- [x] Add parallel candidate generation (N configurable).
- [x] Add candidate scoring and selection.
- [x] Persist rejected candidates for inspection.
- [ ] Implement `tool improve` regeneration path using feedback and run history.

## Open Decisions
- [ ] Default artifact output location:
  - [ ] current working directory
  - [ ] `.infinite/artifacts/`
- [ ] Standardize `--json` output mode across all commands.

## Quality Gates for v0
- [x] `npm run check` passes.
- [x] `npm run build` passes.
- [x] `npm run test` passes.
- [x] `infinite tools` works with empty and non-empty registries.
- [ ] `infinite "<intent>"` can generate and run at least one OpenAI-based tool end-to-end.
- [ ] `tool improve` creates a new version linked to previous lineage.
