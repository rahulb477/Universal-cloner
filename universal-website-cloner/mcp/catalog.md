# MCP Server Catalog

**Status legend** — *Registry-checked*: the npm package name was confirmed to exist on the npm registry when this repository was built (it says nothing about connectivity in your environment). *Documented*: recommended from vendor documentation; confirm the current install command in the vendor's docs, since MCP packages evolve quickly. **No server in this catalog was connected or exercised during repository development**; the build environment exposed no MCP tools.

| Server | Purpose | Typical command | Status | Notes |
|--------|---------|-----------------|--------|-------|
| Playwright MCP | Drive a real browser via accessibility snapshots; screenshots, clicks, forms | `npx @playwright/mcp@latest` | Registry-checked (`@playwright/mcp`) | Best general browser tool. Supports `--headless`, `--browser`, `--storage-state`. Restrict origins where the host allows. |
| Chrome DevTools MCP | Console, network, performance traces, DOM/CSS inspection in Chrome | `npx chrome-devtools-mcp@latest` | Registry-checked (`chrome-devtools-mcp`) | Needs Chrome installed. Great for perf/CLS investigations. |
| Filesystem MCP | Scoped file access | `npx @modelcontextprotocol/server-filesystem <allowed-dir>` | Registry-checked | Pass only the project directory. Redundant if the host has native file tools. |
| GitHub MCP | Repos, PRs, issues, code search | Official: `github/github-mcp-server` (remote or Docker) | Documented | The older npm package `@modelcontextprotocol/server-github` exists but is superseded by the official server; prefer the official one. Use a fine-grained token supplied by the host/env. |
| Figma MCP | Read Figma frames, variables, components for design-to-code | Figma Dev Mode MCP server (desktop app) or `npx figma-developer-mcp --stdio` with `FIGMA_API_KEY` | Registry-checked (`figma-developer-mcp`); Dev Mode server documented | Useful when the user has a Figma file; not a substitute for inspecting the live site. |
| shadcn/ui MCP | Browse/add shadcn components | `npx shadcn@latest mcp` | Documented | Only when the stack includes shadcn/ui. |
| Supabase MCP | Manage Supabase projects, SQL, migrations | `npx -y @supabase/mcp-server-supabase@latest --read-only --project-ref=<ref>` | Registry-checked | Needs `SUPABASE_ACCESS_TOKEN` in env. Use dev projects only; read-only by default. |
| Firebase MCP | Firebase project/rules/data tooling | `npx -y firebase-tools@latest mcp` | Registry-checked (`firebase-tools`) | Requires `firebase login`. Use emulators for clones. |
| Context7 | Current library docs for the agent | `npx -y @upstash/context7-mcp` | Registry-checked | Reduces hallucinated APIs for fast-moving libs. |

## Not covered by a standard MCP (use scripts)
Screenshot diffing & visual regression (`visual-diff.mjs`, `regression.mjs`), link checking, route crawling with robots awareness, auth test harness, repo validation.

## Adding a new server
1. Add a row here with status honestly marked.
2. Add a config entry to [servers.example.json](servers.example.json) and the relevant `integrations/<host>/` example.
3. Add a smoke test in [verification.md](verification.md).
4. Update CHANGELOG.md.
