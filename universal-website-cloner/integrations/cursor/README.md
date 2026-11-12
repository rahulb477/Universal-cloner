# Cursor

1. Copy the repository into your workspace; run `npm run setup` inside it.
2. Copy [universal-website-cloner.mdc](universal-website-cloner.mdc) to `.cursor/rules/universal-website-cloner.mdc` (rule type: agent-requested; the description tells Cursor when to load it).
3. In Agent chat say: **"Use the universal-website-cloner rule and start."**
4. MCP: copy [mcp.example.json](mcp.example.json) to `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (user). Check Settings → MCP for a connected status and run the smoke tests in [../../mcp/verification.md](../../mcp/verification.md).

Terminal commands in Cursor's agent run with your approval settings; allow `node` and `npm` for the skill folder.
