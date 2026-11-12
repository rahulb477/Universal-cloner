# Gemini CLI

1. Copy the repository into your workspace; run `npm run setup` inside it.
2. Add [GEMINI.snippet.md](GEMINI.snippet.md) to the project `GEMINI.md` (context file loaded automatically).
3. Start `gemini` in the workspace and say: **"Follow universal-website-cloner/SKILL.md."**
4. MCP: merge [settings.example.json](settings.example.json) into `.gemini/settings.json` (project) or `~/.gemini/settings.json` (user); check `/mcp` and run [../../mcp/verification.md](../../mcp/verification.md) smoke tests.

Tool-approval prompts appear for shell commands; approve `node`/`npm` inside the skill folder.
