# opencode

1. Copy the repository into your workspace; run `npm run setup` inside it.
2. Add the pointer from [../codex/AGENTS.snippet.md](../codex/AGENTS.snippet.md) to the project `AGENTS.md` (opencode reads it).
3. Start `opencode` and say: **"Follow universal-website-cloner/SKILL.md."**
4. Sub-agents: opencode supports custom agents (Markdown in `.opencode/agent/` or the `agent` config). The role files in [../../agents](../../agents/README.md) can be adapted.
5. MCP: merge [opencode.example.json](opencode.example.json) into `opencode.json`; verify with `opencode mcp list` and [../../mcp/verification.md](../../mcp/verification.md).
