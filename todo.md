# Infinite CLI - TODO

## Snapshot
- Stack: Node.js + TypeScript.
- Generated tool runtime: Python.
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

## In Progress
- [ ] Wire OpenAI-backed candidate generation into `infinite "<intent>"`.

## Next Up (Priority Order)
- [ ] Add OpenAI client/config module:
  - [ ] model
  - [ ] API key source (`OPENAI_API_KEY`)
  - [ ] max tokens / temperature
- [ ] Define candidate artifact format (manifest + Python entrypoint + optional self-check).
- [ ] Implement single-candidate generation path:
  - [ ] prompt template
  - [ ] response parsing
  - [ ] filesystem write to `.infinite/tools/<name>/<version>/`
  - [ ] registry insert (`tools` + `tool_versions`)
- [ ] Auto-run newly generated tool after install.
- [ ] Persist generation event metadata for debugging.

## After Single Candidate Works
- [ ] Add parallel candidate generation (N configurable).
- [ ] Add candidate scoring and selection.
- [ ] Persist rejected candidates for inspection.
- [ ] Implement `tool improve` regeneration path using feedback and run history.

## Open Decisions
- [ ] Default artifact output location:
  - [ ] current working directory
  - [ ] `.infinite/artifacts/`
- [ ] Standardize `--json` output mode across all commands.

## Quality Gates for v0
- [ ] `npm run check` passes.
- [ ] `npm run build` passes.
- [ ] `infinite tools` works with empty and non-empty registries.
- [ ] `infinite "<intent>"` can generate and run at least one OpenAI-based tool end-to-end.
- [ ] `tool improve` creates a new version linked to previous lineage.
