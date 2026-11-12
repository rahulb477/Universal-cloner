# Host Integrations

How to give this skill to each AI coding host. In every case the entry point is the same: the host must read [../SKILL.md](../SKILL.md) (or [../PROMPT-START-HERE.md](../PROMPT-START-HERE.md)) and then follow the startup protocol.

| Host | Folder | Skill mechanism | Sub-agents | MCP config |
|------|--------|-----------------|-----------|------------|
| Claude Code | [claude-code](claude-code/README.md) | `.claude/skills/<name>/SKILL.md` (auto-discovered) | yes | `.mcp.json` / `claude mcp add` |
| OpenAI Codex CLI | [codex](codex/README.md) | `AGENTS.md` pointer | limited | `~/.codex/config.toml` |
| Cursor | [cursor](cursor/README.md) | `.cursor/rules/*.mdc` | background agents | `.cursor/mcp.json` |
| GitHub Copilot (VS Code) | [github-copilot](github-copilot/README.md) | `.github/copilot-instructions.md`, prompt files | agent mode | `.vscode/mcp.json` |
| opencode | [opencode](opencode/README.md) | `AGENTS.md` pointer | yes (agents) | `opencode.json` |
| Gemini CLI | [gemini-cli](gemini-cli/README.md) | `GEMINI.md` pointer | limited | `~/.gemini/settings.json` |
| Hosted builders (Bolt, Lovable, v0, Replit…) | [hosted-builders](hosted-builders/README.md) | paste prompt | no | usually none |

> Host products change often. The snippets here reflect commonly documented conventions at the time of writing and were **not executed against live hosts** during development. If a path or flag differs, follow the host's current docs — the skill itself is host-independent Markdown plus Node scripts.
