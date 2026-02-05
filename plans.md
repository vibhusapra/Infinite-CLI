# Infinite CLI - Execution Plan

## Goal
Ship a terminal-first system where `infinite "<intent>"` can generate and run disposable tools quickly, with versioned history and feedback-driven improvement.

## Principles
- Optimize for iteration speed over perfect abstractions.
- Keep core orchestration stable; generated tool code stays disposable.
- Prefer observability and traceability over hidden automation.
- Assume network access and OpenAI API usage are first-class.

## Current State
- Node.js + TypeScript scaffold is working.
- CLI command tree exists with registry-backed `tools`, `tool show`, `tool run`, `tool improve`.
- Python runtime invocation path exists for stored tool versions.
- Intent intake exists with one clarification question hook.
- Worktree-based Codex candidate generation, validation, scoring, promotion, and auto-run are implemented.

## Phase 1 - Generation MVP
### Deliverables
- [x] OpenAI/Codex generation config loading.
- [x] Prompt template for candidate generation.
- [x] Parse model output via filesystem artifact contract.
- [x] Write generated tool files to `.infinite/tools/<name>/<version>/`.
- [x] Insert tool/version records into SQLite.
- [x] Auto-run generated tool when called from `infinite "<intent>"`.

### Acceptance Criteria
- [x] Running `infinite "<intent>"` on a missing tool generates and runs a Python tool.
- [x] Tool appears in `infinite tools`.
- [x] `infinite tool show <name>` includes the new version and manifest.
- [x] Run logs are written under `.infinite/runs/`.

## Phase 2 - Parallel Candidates
### Deliverables
- [x] Worker pool for N parallel generation attempts.
- [x] Candidate scoring function (valid parse, self-check result, run outcome, latency).
- [x] Best-candidate selection and install.
- [x] Rejected candidate storage for debugging.

### Acceptance Criteria
- [x] Generation runs with configurable `N`.
- [x] Failed candidates do not block successful install of best candidate.
- [x] Selection decision is visible in logs/metadata.

## Phase 3 - Improvement Loop
### Deliverables
- `tool improve` consumes feedback + recent runs.
- Regenerate as next version with lineage tracking.
- Optional regression self-check against previous version behavior.

### Acceptance Criteria
- `tool improve <name> --feedback` creates `v+1`.
- `tool run <name>` defaults to latest stable version.
- Version history can be inspected from `tool show`.

## Phase 4 - Hardening
### Deliverables
- Retry policy for transient API failures.
- Timeout/cancellation controls for generation and execution.
- Better diagnostics for malformed model outputs.
- Minimal smoke test suite for CLI workflows.

### Acceptance Criteria
- Core commands remain usable under intermittent API failures.
- Failure modes surface actionable error messages.
- CI or local check command validates core flow quickly.

## Implementation Notes
- Keep generated tools Python-first for path-of-least-resistance.
- Preserve `OPENAI_API_KEY` passthrough to generated tools.
- Keep model/runtime config centralized and env-driven.
- Default generation model is `gpt-5.3-codex` with `gpt-5-codex` fallback handling.
- Add `--json` support incrementally, starting with read-only commands.

## Near-Term Sprint Checklist
- [ ] Improve candidate prompt strategies by intent type.
- [ ] Add registry table for generation jobs/candidate metadata.
- [ ] Add regression comparison when improving existing tools.
- [ ] Add integration test fixture for codex-disabled fallback handling.
- [ ] Add `--json` output support for generation and run subcommands.
