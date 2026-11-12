# Worked Example (illustrative transcript)

> This is an **illustrative** session showing the expected behaviour, using the bundled fixture site as the "target". It is not a record of a real third-party clone.

**User:** Read universal-website-cloner/SKILL.md and start.

**Agent:** Checking capabilities…
```
$ node scripts/check-env.mjs
OK    node                 v22.x (need >= 18.17)
OK    playwright           installed
OK    chromium launch      Chromium 1xx
```
MCP: `mcp-check` found no configuration; I have no MCP tools in this session, so I'll use the Playwright scripts.
Questions: 1) Target URL? 2) Do you own it / have permission? 3) Login needed, which roles? 4) Authorised test credentials (env vars) only if needed? 5) Stack/scope preferences?

**User:** `http://127.0.0.1:4010` (start with `node testing/fixture-site/server.mjs`), yes I own it, login exists (demo user), go with your recommendation.

**Agent:** Recorded authorisation in provenance. Creating workspace and running discovery.
```
$ node scripts/init-project.mjs --url http://127.0.0.1:4010 --auth required
$ node scripts/pipeline.mjs --url http://127.0.0.1:4010 --mode reference
```
Discovery summary: 11 routes (1 via sitemap, 1 skipped by robots, `/dashboard` requires login, `/missing` is a 404), forms: login; interactions: tabs, details, dialog, search. Tokens: brand `#4f46e5`, breakpoint 640 px, `fadein` keyframes.

Architecture proposal: Next.js + Tailwind, cookie sessions, SQLite/Postgres users table with one seeded demo user. Not reproducible: none. Proceeding.

*(Implementation happens in `clone-workspace/<slug>/project/`.)*

**Agent (QA):**
```
$ SITE_USERNAME=demo@clone.local SITE_PASSWORD=… node scripts/auth-test.mjs --url http://localhost:3000/login --protected /dashboard --logout-selector '#logout'
$ node scripts/visual-diff.mjs --reference …/reference --candidate …/clone --out …/diff --max-mismatch 5
Worst mismatch: 3.2% (pricing, mobile) — logged V-004
```
**Final report:** verified items list (with commands), unverified list, run instructions.

## Try the real tooling on the fixture
```bash
node testing/fixture-site/server.mjs &         # http://127.0.0.1:4010
node scripts/pipeline.mjs --url http://127.0.0.1:4010 --mode reference
```
