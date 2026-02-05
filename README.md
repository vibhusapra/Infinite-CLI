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
  - spins up parallel candidate worktrees
  - runs `codex exec` per candidate
  - validates candidates (`manifest`, `py_compile`, `smoke_test.py`)
  - scores and promotes best candidate to `.infinite/tools/<name>/v<version>/`
  - auto-runs promoted tool and records run logs

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

Model behavior:
- Orchestrator tries `INFINITE_CODEX_MODEL` first.
- If Codex returns `model_not_found`, it retries automatically with `gpt-5-codex`.
- CLI runtime override: `--agents <n>` (or shorthand `--<n>`, for example `--4`) overrides `INFINITE_CANDIDATE_COUNT`.
- `--fast`: defaults to 1 candidate and caps generation timeout to 120s (unless you explicitly pass `--agents`).
- `--debug`: keeps worktrees and prints debug artifact locations.

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
