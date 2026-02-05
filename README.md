# Infinite CLI
Infinite CLI is a self-extending terminal where any command you can imagine can exist. If the command does not exist yet, the system generates a disposable tool on the fly, runs it, and keeps the useful artifacts.

## Current Scaffold (Node.js + TypeScript)
- CLI command tree:
  - `infinite "<natural command>"`
  - `infinite tools`
  - `infinite tool show <name>`
  - `infinite tool run <name> [args...]`
  - `infinite tool improve <name> --feedback "<text>"`
- Local runtime state bootstraps in `.infinite/` with SQLite registry at `.infinite/registry.db`.
- Python is the generated tool runtime target.
- Natural-intent flow now runs an orchestration pipeline:
  - asks one clarification question in interactive sessions
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

## API Key and Runtime Config
Create `.env` in repo root (see `.env.example`):

```bash
cp .env.example .env
```

Key settings:
- `OPENAI_API_KEY`
- `INFINITE_CODEX_BIN` (default: `codex`)
- `INFINITE_CODEX_MODEL` (default: `gpt-5-codex`)
- `INFINITE_CANDIDATE_COUNT` (default: `2`)
- `INFINITE_CODEX_TIMEOUT_MS` (default: `240000`)
- `INFINITE_KEEP_WORKTREES` (default: `false`)

## Notes
- Network access and OpenAI API usage are expected.
- See `todo.md` for phased milestones and architecture decisions.
