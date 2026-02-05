# Infinite CLI - Build Plan

## Product Direction
- Terminal-first only. No web UI in v0.
- Code generation is the product; generated tool code is disposable by default.
- Favor speed and iteration over elegance.
- Assume network access is allowed.
- Primary integrations: OpenAI APIs (Responses, TTS, etc).
- Primary implementation stack: Node.js + TypeScript.

## v0 Scope (Must Have)
- `infinite "<natural command>" [-- ...args]`
- `infinite tools`
- `infinite tool show <name>`
- `infinite tool run <name> [-- ...args]`
- `infinite tool improve <name> --feedback "<text>"`
- Local registry of generated tools + versions + run history
- Parallel generation workers (multiple candidates per request)

## Explicit Non-Goals (v0)
- GUI or dashboard
- Multi-user auth system
- Strict sandboxing/isolation
- Complex plugin ecosystem
- Cross-device sync

## System Design (Pragmatic)

### 1) CLI Frontend
- Parse commands and route to orchestrator actions.
- Keep command UX stable even if backend internals change.

### 2) Orchestrator Agent
- Inputs:
  - user intent (natural command)
  - passthrough args
  - tool history (if existing tool)
  - improvement feedback (optional)
- Outputs:
  - one or more candidate implementations
  - tool manifest (name, description, args, examples)

### 3) Parallel Candidate Generation
- Spin N candidates in parallel (start with N=2 or N=3).
- Each candidate returns:
  - runnable tool entrypoint
  - manifest metadata
  - minimal self-check script
- Score candidates by:
  - self-check pass/fail
  - runtime success
  - useful output / no crash
  - latency

### 4) Tool Runtime
- Run generated tools as local processes.
- Pass through env vars (including `OPENAI_API_KEY`).
- Capture stdout/stderr/exit code + artifacts (e.g. mp3 files).

### 5) Registry + Versioning
- Local `.infinite/` workspace folder:
  - `registry.db` (SQLite)
  - `tools/<tool-name>/<version>/...`
  - `runs/<run-id>/logs.json`
- Track:
  - tool identity, manifest, versions
  - last-run status
  - user feedback

## Data Model (Initial)
- `tools(id, name, created_at, latest_version, status)`
- `tool_versions(id, tool_id, version, manifest_json, code_path, created_at, score)`
- `runs(id, tool_version_id, command, args_json, started_at, ended_at, exit_code, stdout_path, stderr_path, artifacts_json)`
- `feedback(id, tool_id, text, created_at)`

## Initial CLI Contract
- `infinite "forge summarize-pdf report.pdf --as haiku"`
  - If tool exists: run best current version.
  - If missing: generate + validate + install + run.
- `infinite tools`
  - List tool name, latest version, last run result, last run timestamp.
- `infinite tool show <name>`
  - Show manifest, args schema, examples, versions.
- `infinite tool run <name> [-- ...args]`
  - Directly invoke existing tool version (latest by default).
- `infinite tool improve <name> --feedback "..."`
  - Generate successor version from feedback + run history.

## OpenAI Integration Notes
- Use one model family first for consistency (Codex generation model).
- Keep model/provider settings centralized in config:
  - model
  - max tokens
  - temperature
  - parallel candidate count
- For TTS-style tools, generated code should call OpenAI TTS endpoints directly with `OPENAI_API_KEY`.

## Suggested Repo Layout
- `src/cli` command parsing and handlers
- `src/orchestrator` generation flow
- `src/agents` parallel candidate workers
- `src/runtime` run/validate tools
- `src/registry` sqlite + filesystem store
- `src/models` domain types
- `src/prompts` generation and improve templates
- `src/tui` optional Ink views (later phase)
- `.infinite/` runtime state (gitignored)

## Phase Plan

### Phase 0 - Foundation (Day 1-2)
- [ ] Confirm implementation language: Node.js + TypeScript.
- [ ] Set up CLI skeleton (e.g. `commander`/`yargs`) and config loader.
- [ ] Create `.infinite/` structure and SQLite migration v1.
- [ ] Implement `infinite tools` (empty list support).

### Phase 1 - Generate + Run (Day 3-5)
- [ ] Implement `infinite "<intent>"` flow with single candidate generation.
- [ ] Write generated code to `tools/<name>/<version>/`.
- [ ] Execute generated tool with args passthrough.
- [ ] Persist run logs and artifacts metadata.

### Phase 2 - Parallel Candidates (Day 6-8)
- [ ] Add worker pool for candidate generation (N configurable).
- [ ] Add scoring function and best-candidate selection.
- [ ] Persist rejected candidates for debugging.

### Phase 3 - Tool Management (Day 9-10)
- [ ] Add `tool show`, `tool run`.
- [ ] Add `tool improve` with feedback-driven regeneration.
- [ ] Version bump and lineage tracking.

### Phase 4 - Hardening (Day 11-14)
- [ ] Better error messages and retry behavior.
- [ ] Timeouts + cancellation support.
- [ ] Add smoke tests around core CLI flows.
- [ ] Add cleanup command for stale generated code.

## Example v0 Target Flow (Blob -> MP3 TTS)
- User runs:
  - `infinite "make a tool that converts stdin text to mp3 using openai tts, output file required"`
- Generated tool is installed as:
  - `tool name: text-to-mp3`
- User runs:
  - `cat notes.txt | infinite tool run text-to-mp3 -- --voice alloy --out notes.mp3`

## Risks and Mitigations
- Risk: low-quality generated code.
  - Mitigation: parallel candidates + basic validation + improve loop.
- Risk: inconsistent tool naming.
  - Mitigation: canonical naming rules in manifest generation.
- Risk: token/cost blowups.
  - Mitigation: cap candidates, prompt size limits, cheap retries first.
- Risk: brittle prompt drift.
  - Mitigation: version prompt templates and evaluate against fixed test intents.

## Immediate Next Tasks (Next 5 Coding Steps)
- [ ] Initialize Node.js + TypeScript project and package scripts.
- [ ] Scaffold CLI commands and subcommands.
- [ ] Add SQLite schema and registry interfaces.
- [ ] Implement `infinite tools` + `tool show` from registry.
- [ ] Implement one end-to-end generation-run path for a simple OpenAI tool.

## Questions To Resolve Before Coding Deep
- Generated tool runtime confirmed: Python first.
- Do you want default artifact location to be current directory or `.infinite/artifacts/`?
- Clarification policy confirmed: allow exactly 1 model follow-up question before execution, then proceed.
- Do you want a `--json` mode for all commands from day one?
