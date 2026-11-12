# OpenAI Codex CLI

1. Copy the repository into your workspace and run `npm run setup` inside it.
2. Add the pointer from [AGENTS.snippet.md](AGENTS.snippet.md) to the `AGENTS.md` at your project root (Codex reads it automatically).
3. Start Codex in the workspace and say: **"Follow universal-website-cloner/SKILL.md."**
4. Optional MCP: merge [config.example.toml](config.example.toml) into `~/.codex/config.toml`, then run `codex mcp list` / `/mcp` and follow [../../mcp/verification.md](../../mcp/verification.md).

Sandbox note: Codex's default sandbox may block network access and browser launches. Use an approval/sandbox mode that allows network for the target site, or fall back to [../../workflows/fallback-no-browser.md](../../workflows/fallback-no-browser.md).
