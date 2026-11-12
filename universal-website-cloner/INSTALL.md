# Installation

## Requirements
| Requirement | Needed for | Notes |
|-------------|-----------|-------|
| Node.js ≥ 18.17 (22 recommended) | all scripts | `node -v` |
| npm | dependency install | |
| Chromium via Playwright | browser scripts | installed by `npm run setup` |
| Linux system libraries for Chromium | browser scripts on Linux | `npx playwright install-deps chromium` (needs admin rights) |
| `zip` or `python3` (or PowerShell on Windows) | `npm run package` | |
| Git (optional) | version control of the clone | |

## Steps
```bash
# 1. Put the folder where your AI host can read it (see integrations/<host>/README.md)
unzip universal-website-cloner-v1.0.0.zip && cd universal-website-cloner

# 2. Install dependencies + browser
npm run setup

# 3. Verify
npm run check-env
npm run selftest      # optional but recommended; takes ~1–2 minutes
npm run validate
```

## Install into a host
| Host | Guide |
|------|-------|
| Claude Code | [integrations/claude-code](integrations/claude-code/README.md) |
| Codex CLI | [integrations/codex](integrations/codex/README.md) |
| Cursor | [integrations/cursor](integrations/cursor/README.md) |
| GitHub Copilot | [integrations/github-copilot](integrations/github-copilot/README.md) |
| opencode | [integrations/opencode](integrations/opencode/README.md) |
| Gemini CLI | [integrations/gemini-cli](integrations/gemini-cli/README.md) |
| Hosted builders | [integrations/hosted-builders](integrations/hosted-builders/README.md) |

## Optional MCP servers
See [mcp/README.md](mcp/README.md). Nothing is required; scripts are the baseline.

## Credentials (only for sites that need login)
```bash
export SITE_USERNAME='authorised-test-user'
export SITE_PASSWORD='<authorised-test-password>'     # shell only; never commit
```
Windows PowerShell: `$env:SITE_USERNAME='…'; $env:SITE_PASSWORD='…'`.

## Uninstall
Delete the folder. Evidence and workspaces live only in `clone-workspace/` (git-ignored) and sessions in `.auth/`.

More: [docs/setup.md](docs/setup.md) · [docs/troubleshooting.md](docs/troubleshooting.md).
