# Hosted Builders (Bolt, Lovable, v0, Replit Agent, and similar)

These products usually cannot run local Playwright scripts against external sites, load MCP servers, or read a repository as a skill. Use them in **reduced mode**:

1. Paste the contents of [../../PROMPT-START-HERE.md](../../PROMPT-START-HERE.md) as your first message (it is self-contained).
2. Provide evidence yourself: desktop + mobile screenshots of each route, a route list, and descriptions of flows behind login (never paste real credentials into a hosted builder chat).
3. Follow [../../workflows/fallback-no-browser.md](../../workflows/fallback-no-browser.md): mark unverified items `unverified`, make no pixel-perfect claims.
4. To get the full verified workflow, build the clone there, then export/clone the project locally and run `scripts/pipeline.mjs --mode clone` plus `visual-diff.mjs` with a capable agent host.

Some builders (e.g. Replit) can run Node: if so, upload the repo, run `npm run setup` and `node scripts/check-env.mjs` to see what works.
