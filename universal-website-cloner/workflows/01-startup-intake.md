# Startup & Intake

Do these in order. Do not write clone code until Phase 3 is complete.

1. **Read** [../SKILL.md](../SKILL.md) fully.
2. **Check capabilities** — never assume:
   ```bash
   cd universal-website-cloner && npm run setup      # first time only
   node scripts/check-env.mjs
   node scripts/mcp-check.mjs
   ```
   Then list the tools your host actually exposes. Record which of {Playwright scripts, Playwright MCP, Chrome DevTools MCP, filesystem, GitHub, Figma, database MCP} are *verified usable* (see [../mcp/verification.md](../mcp/verification.md)).
3. **Ask the user** (one message, all questions):
   1. What is the target website URL?
   2. Do you own it or have written/clear permission to inspect and reproduce it? (record the answer in `provenance.md`)
   3. Does it need a login? If yes: which roles exist, and can you provide **authorised test credentials** (set as env vars `SITE_USERNAME` / `SITE_PASSWORD`; do not paste them into chat if you can avoid it)?
   4. Any stack preference (default recommended by the skill), scope limits (pages/features to include or skip), and what the clone is for (learning, migration, prototype)?
4. **Init workspace:** `node scripts/init-project.mjs --url <url> --auth required|none|unknown`.
5. **Confirm scope** in one short paragraph, then start Discovery.

## If the user says "go with your recommendation" / gives no preferences
Choose the stack using [../docs/architecture.md](../docs/architecture.md), record the choice, proceed — don't block on optional questions. Do still require a URL and the authorisation answer.

## Refuse or pause when
The request is to impersonate a brand for phishing/fraud, bypass access controls, copy paid content, or reuse private data. Offer a legitimate alternative (original design inspired by the structure, licensed assets, synthetic data).
