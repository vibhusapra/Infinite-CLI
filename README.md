# Infinite CLI
Infinite CLI is a self-extending terminal where any command you can imagine can exist. If the command does not exist yet, the system generates a disposable tool on the fly, runs it, and keeps the useful artifacts.

## Current Scaffold (Node.js + TypeScript)
- CLI command tree:
  - `infinite "<natural command>"`
  - `icli chat`
  - `infinite tools`
  - `infinite tool show <name>`
  - `infinite tool run <name> [args...]`
  - `infinite tool improve <name> --feedback "<text>"`
- Local runtime state bootstraps in `.infinite/` with SQLite registry at `.infinite/registry.db`.
- Python is the generated tool runtime target.
- Natural-intent flow now runs an orchestration pipeline:
  - asks one clarification question in interactive sessions
  - prints live progress updates while generation is running
  - can stream a secondary LLM narration (`Plan / Progress / Next`) from progress events
  - uses adaptive scheduling by default (candidate-1 first, fanout only if needed)
  - runs `codex exec` per candidate
  - auto-retries known Codex compatibility/transient failures
  - validates candidates (`manifest`, `py_compile`, `smoke_test.py`)
  - scores and promotes best candidate to `.infinite/tools/<name>/v<version>/`
  - auto-runs promoted tool when zero-arg invocation is safe, otherwise prints exact run template and records run logs only when executed

## Run Locally
```bash
npm install
npm run build
node dist/index.js tools
```

To install command aliases locally for your shell:
```bash
npm link
```

Then use either `infinite` or `icli`.

Examples:
```bash
icli make a tiny tool that prints hello from icli --4
icli --agents 3 make a tiny tool that summarizes json input
icli chat
icli --fast make a tiny tool that prints hello fast
icli --debug make a tiny tool that prints hello with debug artifacts
icli --no-narrate make a tiny tool that prints hello with raw progress only
icli --strategy parallel --agents 3 make a tiny tool that converts csv to json
```

## API Key and Runtime Config
Create `.env` in repo root (see `.env.example`):

```bash
cp .env.example .env
```

Key settings:
- `OPENAI_API_KEY`
- `INFINITE_CODEX_BIN` (default: `codex`)
- `INFINITE_CODEX_MODEL` (default: `gpt-5.3-codex`)
- `INFINITE_CANDIDATE_COUNT` (default: `2`)
- `INFINITE_CODEX_TIMEOUT_MS` (default: `240000`)
- `INFINITE_KEEP_WORKTREES` (default: `false`)
- `INFINITE_STRATEGY` (default: `adaptive`)
- `INFINITE_SCORE_CUTOFF` (default: `90`)
- `INFINITE_RETRY_BUDGET` (default: `2`)
- `INFINITE_FANOUT_DELAY_MS` (default: `0`)
- `INFINITE_NARRATOR_MODEL` (default: `gpt-5-mini`)
- `INFINITE_NARRATOR_FLUSH_MS` (default: `4000`)

Model behavior:
- Orchestrator tries `INFINITE_CODEX_MODEL` first.
- If Codex returns `model_not_found`, it retries automatically with `gpt-5-codex`.
- CLI runtime override: `--agents <n>` (or shorthand `--<n>`, for example `--4`) overrides `INFINITE_CANDIDATE_COUNT`.
- `--strategy <adaptive|parallel>` controls candidate scheduling mode.
- `--score-cutoff <int>` sets adaptive early-stop score threshold.
- `--retry-budget <0..2>` controls Codex retries per candidate.
- `--fanout-delay-ms <ms>` adds delay before adaptive fanout launches.
- `--fast`: defaults to 1 candidate and caps generation timeout to 120s (unless you explicitly pass `--agents`).
- `--debug`: keeps worktrees and prints debug artifact locations.
- `--narrate` / `--no-narrate`: enable or disable secondary LLM narration of generation progress.
- In `icli chat`, `/narrate [on|off]` and `/strategy <adaptive|parallel>` are available in-session.

## Useful Commands
```bash
# list all generated tools
icli tools

# list tools as JSON
icli tools --json

# inspect one tool (manifest, versions, feedback)
icli tool show <tool-name>

# run a tool directly
icli tool run <tool-name>

# pass arguments to a generated tool
icli tool run <tool-name> -- --arg1 value

# add feedback for future improvement
icli tool improve <tool-name> --feedback "handle csv edge cases"

# remove one tool (all versions/history)
icli tool clean <tool-name> --yes

# cleanup ephemeral logs/worktrees (default behavior)
icli clean

# remove generated tool projects + registry tool records
icli clean --projects

# full cleanup (projects + logs + artifacts)
icli clean --all --yes
```

## Notes
- Network access and OpenAI API usage are expected.
- See `todo.md` for phased milestones and architecture decisions.
