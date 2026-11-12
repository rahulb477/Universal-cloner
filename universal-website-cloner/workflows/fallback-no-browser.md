# Fallback Workflows When Browser Automation Is Unavailable

First diagnose: `node scripts/check-env.mjs`. Common fixes: `npm run setup`; on Linux `npx playwright install-deps chromium` (needs admin rights); corporate proxies need `HTTPS_PROXY`.

## Ladder (use the highest rung that works)
1. **Playwright scripts** (preferred).
2. **Browser MCP verified connected** (Playwright MCP / Chrome DevTools MCP): perform the same steps interactively; save screenshots to `evidence/` by hand; follow [../mcp/verification.md](../mcp/verification.md).
3. **HTTP-only discovery**: `curl`/`fetch` for HTML, `robots.txt`, `sitemap.xml`, `<link>`/`<script>` URLs, meta tags, CSS files (read variables, `@media`, `@font-face`). Works for server-rendered sites; SPA content will be missing — say so in the report.
4. **User-supplied evidence**: ask for screenshots (desktop + mobile), screen recordings for animation, DevTools "Copy as cURL" for *shape only* (strip secrets), and a description of flows behind login.
5. **Reduced-confidence mode**: build from available evidence; mark every unverified item `unverified` in the inventories; do **not** claim visual parity or tested interactions.

## What changes in the reports
- QA report: list every script that could not run and why.
- Final report: "Not verified" section must be explicit.
- Never fabricate screenshots, diffs or test output.
