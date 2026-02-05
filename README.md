# Infinite CLI
Infinite CLI is a self-extending terminal where any command you can imagine can exist. If the command does not exist yet, the system generates a disposable tool on the fly, runs it, and keeps the useful artifacts.

## Current Scaffold (Node.js + TypeScript)
- CLI command tree is wired:
  - `infinite "<natural command>"`
  - `infinite tools`
  - `infinite tool show <name>`
  - `infinite tool run <name> [args...]`
  - `infinite tool improve <name> --feedback "<text>"`
- Local runtime state bootstraps in `.infinite/` with SQLite registry at `.infinite/registry.db`.
- Python is the generated tool runtime target.
- Intent generation pipeline is scaffolded, but OpenAI-backed candidate generation is not implemented yet.

## Run Locally
```bash
npm install
npm run build
node dist/index.js tools
```

## Notes
- Network access and OpenAI API usage are expected in upcoming phases.
- See `todo.md` for phased milestones and architecture decisions.
