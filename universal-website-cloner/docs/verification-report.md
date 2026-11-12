# Verification Report — release 1.0.0

Everything here comes from commands actually executed while building the repository (Linux sandbox, Node v22.23.4, Playwright 1.65.0, Chromium 158 headless, axe-core 4.14.0). Re-run `npm run selftest` on your machine to reproduce.

## 1. Implemented and verified

### Repository validation (`npm run validate`) — 10/10 checks passed
Required files · integration folders · JSON parse · `node --check` on all 23 `.mjs` files · every script documents `--help` · markdown relative links (77 files) · SKILL.md front matter · 15 agent definitions referenced in the roster · version consistency (package.json / VERSION.md / CHANGELOG.md) · no secrets or session files.

### End-to-end self-test (`npm run selftest`) — 20 passed, 0 failed, 0 skipped
Run against `testing/fixture-site`, a local website with deliberate defects.

| Test | What it proves |
|------|----------------|
| validate-repo | repository quality gate runs and passes |
| scan-secrets (clean) / (detects) | no false positive on clean dir; detects an AWS-style key and a storage-state file |
| init-project + state | workspace scaffolded from templates; phase update and `next` work |
| mcp-check | runs and reports honestly when nothing is configured |
| crawl | discovers ≥ 6 routes, finds a sitemap-only page, skips robots-disallowed `/private`, flags `/dashboard` as requiring auth, records a 404 |
| screenshot | 6 captures (3 routes × desktop+mobile), manifest without failures |
| visual-diff | identical sets pass; an image with a painted red band fails (exit 1) |
| regression | baseline created, unchanged site passes |
| check-links | reports the deliberately broken `/missing` link (exit 1); clean page passes (exit 0) |
| console-errors | captures a deliberate `console.error` (exit 1); clean page passes |
| a11y-check | detects missing alt, unlabeled input, empty button on the defective page; clean page passes (with axe-core active) |
| perf-audit | produces a report within budget on localhost |
| extract-design-tokens | finds CSS variable `--brand`, the 640 px breakpoint and `@keyframes fadein` |
| extract-assets | inventories `/logo.svg` |
| discover-interactions | finds 2 tabs and the search input, records state-changing probes, captures login-form fields (required password), skips the submit button as risky |
| auth-test ×3 | missing credentials → exit 3; valid login + protected route + session persistence in a fresh context + logout + anonymous re-check → pass, and the password appears in neither stdout nor the report; wrong credentials are rejected with a visible error |
| pipeline | `--mode clone` subset runs crawl + screenshots |

Other checks: `--help` exits 0 on all 20 scripts and the self-test; `check-env.mjs` reports Node, npm, git, zip, python3, Playwright, pngjs, pixelmatch, axe-core and a real Chromium launch as OK.

## 2. Implemented but not verified in this environment
| Item | Why unverified |
|------|----------------|
| Running the scripts against a real third-party production website | Only the local fixture was used; real sites bring bot protection, SPAs, iframes, cookie walls that were not exercised |
| `extract-assets --download`, `--ignore-robots`, `--allow-mutations`, `--headed`, `--storage-state` on non-fixture sites | Code paths exist; not exercised by the self-test |
| `perf-audit` mobile viewport medians, `screenshot` tablet/laptop viewports | Self-test uses desktop/mobile only |
| macOS / Windows behaviour (path handling, `zip` fallback to PowerShell) | Only Linux available |
| Firefox / WebKit | Not supported by design (Chromium only) |
| Full agent workflow driven by a live AI model on a real site | This repository is the skill; no end-to-end AI-run clone was performed here |

## 3. Not verified: MCP and host integrations
- **No MCP server was connected or exercised.** The development environment exposed no MCP tools. `mcp/catalog.md` states which package names were confirmed to exist on the npm registry (`@playwright/mcp`, `chrome-devtools-mcp`, `@modelcontextprotocol/server-filesystem`, `@supabase/mcp-server-supabase`, `figma-developer-mcp`, `firebase-tools`, `@upstash/context7-mcp`); existence on npm is not proof of working connectivity.
- Host integration files (Claude Code, Codex, Cursor, Copilot, opencode, Gemini CLI, hosted builders) reflect commonly documented conventions and were **not tested in those hosts**. Config snippets are marked EXAMPLE.
- GitHub MCP, Figma Dev Mode server and shadcn MCP are *documented* only (no registry check or run).

## 4. Environment notes recorded during development
- Chromium initially failed to launch for lack of system libraries; resolved with `npx playwright install-deps chromium` (needs admin rights). This is documented in INSTALL.md and troubleshooting.md.
- A self-test design bug (in-process fixture server blocked by `spawnSync`) was found and fixed by running the fixture as a child process.
- The first self-test run exposed a crawler bug (robots-skipped routes lacked a `route` field) and fixture/interactions issues; all were fixed and the full suite then passed.

## 5. Packaging
`npm run package` runs the validator, stages a clean copy (no `node_modules`, `clone-workspace`, `.auth`, `.env*`, storage states, logs), zips it and writes a SHA-256 file to `dist/`. Result of the packaging run is reported in the delivery message (a ZIP cannot contain its own checksum).
