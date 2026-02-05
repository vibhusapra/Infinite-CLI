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
- Missing piece: OpenAI-backed generation and install flow.

## Phase 1 - Generation MVP
### Deliverables
- OpenAI generation client and config loading.
- Prompt template for candidate generation.
- Parse model output into:
  - tool name
  - manifest JSON
  - Python entrypoint source
- Write generated tool files to `.infinite/tools/<name>/<version>/`.
- Insert tool/version records into SQLite.
- Auto-run generated tool when called from `infinite "<intent>"`.

### Acceptance Criteria
- Running `infinite "<intent>"` on a missing tool generates and runs a Python tool.
- Tool appears in `infinite tools`.
- `infinite tool show <name>` includes the new version and manifest.
- Run logs are written under `.infinite/runs/`.

## Phase 2 - Parallel Candidates
### Deliverables
- Worker pool for N parallel generation attempts.
- Candidate scoring function (valid parse, self-check result, run outcome, latency).
- Best-candidate selection and install.
- Rejected candidate storage for debugging.

### Acceptance Criteria
- Generation runs with configurable `N`.
- Failed candidates do not block successful install of best candidate.
- Selection decision is visible in logs/metadata.

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
- Add `--json` support incrementally, starting with read-only commands.

## Near-Term Sprint Checklist
- [ ] Add `src/openai/client.ts` and config loader.
- [ ] Add `src/prompts/generate-tool.ts`.
- [ ] Add `src/orchestrator/generate.ts`.
- [ ] Add registry write methods for new tool/version creation.
- [ ] Wire `infinite "<intent>"` to full generate-install-run path.
