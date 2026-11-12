# Architecture

## Design goals
Host-independent (Markdown + Node), evidence-driven, safe by default, resumable, extensible.

## Layers
```
┌──────────────────────────────────────────────────────────────┐
│ Instructions   SKILL.md · PROMPT-START-HERE.md · workflows/  │  what to do, in what order
├──────────────────────────────────────────────────────────────┤
│ Roles          agents/ (15) · coordination via deliverables  │  who does it
├──────────────────────────────────────────────────────────────┤
│ Tools          scripts/ (Playwright, pixelmatch) · mcp/      │  how evidence is gathered
├──────────────────────────────────────────────────────────────┤
│ State          clone-workspace/<site>/                       │  reports/, evidence/, state.json, project/
├──────────────────────────────────────────────────────────────┤
│ Hosts          integrations/<host>/                          │  how a host loads the skill
└──────────────────────────────────────────────────────────────┘
```

## Data flow
`crawl` → `routes.json` → consumed by every other script (`resolveRoutes`) → evidence folders → agents write reports → Final Review aggregates. Scripts never need the AI; the AI never needs a specific host.

## Workspace layout (git-ignored)
```
clone-workspace/<host-slug>/
  state.json          phase state + hand-off log
  provenance.md       authorisation and licence decisions
  reports/*.md        templates filled in by agents
  evidence/<kind>/    crawl, screenshots, tokens, assets, interactions, console, links, a11y, perf, auth
  baseline/           accepted screenshots for regression
  project/            the independent clone (its own package.json)
```

## Choosing the clone's technology
| Target characteristics | Recommended | Why |
|------------------------|-------------|-----|
| Marketing / portfolio / blog, no accounts | Static or SSG (Astro, Next static export, plain HTML+Tailwind) | Fast, simple, no backend |
| Accounts + CRUD + dashboards | Next.js + TypeScript + Tailwind + PostgreSQL (Drizzle/Prisma) | One codebase, typed, SSR + API |
| Heavy client interactivity (editor, POS) | React/Vite SPA + Express/Fastify API | Clear client/server split |
| Real-time/collaboration | Supabase Realtime / Firebase / WebSockets | Managed realtime |
| E-commerce | Next.js + Postgres + mock payment adapter | Catalogue, cart, order model |
| User mandates a stack (Laravel, Rails, Django, Vue…) | Use it | Never force a framework |
| Small local demo | SQLite | Zero setup |
UI kit: Tailwind + shadcn/ui when design is custom or neutral; match the observed library (Bootstrap, MUI…) when it is evident and the user wants fidelity.

## Extension points
- **New script:** add `scripts/<name>.mjs` using `lib/common.mjs`; include `usageAndExit` help; add to SKILL.md table, `package.json` scripts, selftest, CHANGELOG.
- **New agent:** add `agents/NN-name.md`, list it in `agents/README.md` (validator enforces consistency).
- **New MCP server:** follow [../mcp/catalog.md](../mcp/catalog.md#adding-a-new-server).
- **New host:** add `integrations/<host>/README.md` and examples.
- **New category:** extend [../workflows/08-category-playbooks.md](../workflows/08-category-playbooks.md).

## Key design decisions
1. *Scripts over MCP as baseline* — deterministic, testable, work in any host.
2. *Inventory-first assets* — downloading is opt-in because of copyright.
3. *Exit code 1 = findings* — lets CI gate on audit scripts.
4. *Secrets only via env + redaction* — `redact()` masks any env value whose name looks secret in all script output.
5. *Evidence folders by kind* — makes diffing reference vs clone trivial.
