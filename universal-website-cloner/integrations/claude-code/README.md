# Claude Code

## Install the skill
Project-level (shared with the repo) or user-level (all projects):
```bash
# project
mkdir -p .claude/skills && cp -r universal-website-cloner .claude/skills/universal-website-cloner
# user
mkdir -p ~/.claude/skills && cp -r universal-website-cloner ~/.claude/skills/universal-website-cloner
```
`SKILL.md` has the required front matter (`name`, `description`), so Claude Code can discover it. Then run:
```bash
cd .claude/skills/universal-website-cloner && npm run setup
```
Start a session and say: **"Use the universal-website-cloner skill."** (or paste [../../PROMPT-START-HERE.md](../../PROMPT-START-HERE.md)).

## Sub-agents
Claude Code supports custom sub-agents (Markdown files in `.claude/agents/`). The 15 role files in [../../agents](../../agents/README.md) can be copied there; add front matter (`name`, `description`, optionally `tools`) at the top of each. Without sub-agents, Claude plays each role sequentially.

## MCP servers
```bash
claude mcp add playwright -- npx @playwright/mcp@latest
claude mcp list          # verify; then follow ../../mcp/verification.md
```
Or commit a project `.mcp.json` based on [mcp.example.json](mcp.example.json) (no secrets; use env vars).

## Permissions tip
Allow `node scripts/*`, `npm run *` and Playwright; deny reading `.auth/` and `.env*`.
