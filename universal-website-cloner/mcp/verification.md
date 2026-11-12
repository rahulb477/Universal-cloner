# Verifying MCP Connectivity

Never write "connected" in a report unless a smoke test below succeeded **in the current session**.

## Step 1 — What is configured?
```bash
node scripts/mcp-check.mjs
```
Lists server names found in known config files. Says nothing about whether they started.

## Step 2 — What is live? (inside the AI host)
- Claude Code: `/mcp` or `claude mcp list`
- Codex CLI: `/mcp` in the TUI or `codex mcp list`
- Cursor: Settings → MCP (green dot) / tools list in Agent chat
- VS Code Copilot: "MCP: List Servers" command, then Tools picker in Agent mode
- opencode: `opencode mcp list`
- Gemini CLI: `/mcp`
- Hosted builders: consult the product UI; most have none.

Commands vary by version; use the host's help if one is missing.

## Step 3 — Smoke tests (record result + date in `evidence/mcp-verification.md`)
| Server | Smoke test | Pass condition |
|--------|-----------|----------------|
| Playwright MCP | navigate to `https://example.com`, take a snapshot | page title "Example Domain" returned |
| Chrome DevTools MCP | open `https://example.com`, list console messages | call returns without error |
| Filesystem | list the project directory | only allowed paths visible; outside path denied |
| GitHub | read repo metadata of a repo the token can access | metadata returned |
| Figma | fetch a node from a file the user shared | node data returned |
| Supabase | `list_tables` on the dev project (read-only) | table list returned |
| Firebase | list projects / read rules via the tool | call succeeds |
| Context7 | resolve a library id (e.g. `react`) | id returned |

## Step 4 — Record
```
MCP verification — <date>
- playwright: VERIFIED (navigate+snapshot ok)
- figma: NOT AVAILABLE (no tool exposed)
- chrome-devtools: CONFIGURED BUT FAILED (error: …) → using scripts/perf-audit.mjs
```

## If a server fails
Check Node ≥ 18, network/proxy, the config path and JSON validity, required env vars (names only), and the host's MCP logs. Then use the script fallback and say so.
