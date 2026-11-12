# GitHub Copilot (VS Code, agent mode)

1. Copy the repository into your workspace; run `npm run setup` inside it.
2. Append [copilot-instructions.snippet.md](copilot-instructions.snippet.md) to `.github/copilot-instructions.md`.
3. Optional reusable prompt: copy [clone-website.prompt.md](clone-website.prompt.md) to `.github/prompts/clone-website.prompt.md`, then run it from chat with `/clone-website`.
4. Switch Copilot Chat to **Agent** mode so it can run terminal commands and edit files.
5. MCP: copy [vscode-mcp.example.json](vscode-mcp.example.json) to `.vscode/mcp.json`; use the "MCP: List Servers" command and Tools picker to verify, then run [../../mcp/verification.md](../../mcp/verification.md) smoke tests.

Copilot's cloud coding agent runs in a GitHub-hosted sandbox with limited network/browser access; prefer local agent mode for this skill.
