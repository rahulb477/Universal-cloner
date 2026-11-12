# Universal Website Cloner Studio

A self-hosted web app that turns a URL into an independent, working project:

1. opens the site in headless Chromium and discovers its routes automatically,
2. records layout, design tokens, forms, interactive states and API calls at desktop, tablet and mobile widths,
3. plans the architecture (with your AI provider, or a built-in planner when none is configured),
4. generates a separate project: pages, shared components, local assets, a Node backend, SQLite storage and sessions where the site needs them,
5. installs, builds and tests it in a restricted process,
6. serves it at its own preview address, and
7. packages a verified ZIP.

The original **agent skill** (`universal-website-cloner/`) is still here, with its landing-page section, file browser (`/browse`) and ZIP download (`/api/download`).

> Use it only on websites you own or are authorised to reproduce. The studio does not bypass logins, CAPTCHA, MFA or paywalls, and it never submits purchases or destructive actions.

## Quick start

Requirements: **Node.js 22.5 or newer** (generated projects use `node:sqlite`), npm, Linux or macOS.

```bash
npm install
npm run build
npm start            # studio on http://localhost:3000, previews on :4100
```

Open `http://localhost:3000/studio`.

No database setup is needed: without `DATABASE_URL` the studio uses an embedded PostgreSQL (PGlite) in `./data`. No browser setup is needed on Linux x64: a Chromium build is bundled. On other platforms run `npx playwright install chromium` or set `CHROMIUM_EXECUTABLE_PATH`.

### Try it without touching a real site

The repository ships a small demo website ("Harbor & Pine": 10 pages, tabs, accordion, dialog, mobile menu, contact form, search, login).

```bash
npm run demo-site                                   # http://127.0.0.1:4599
STUDIO_ALLOW_PRIVATE_TARGETS=127.0.0.1:4599 npm start
```

In the studio choose **New Clone Project**, enter `http://127.0.0.1:4599/`, and optionally turn on *Login required* with the demo account `demo@harbor.test` / `harbor-demo-1`.

### Configuration

Copy `.env.example` to `.env`. The variables that matter for anything beyond localhost:

| Variable | Purpose |
| --- | --- |
| `STUDIO_PASSWORD` | Password for the UI and API. **Without it the studio is open.** |
| `STUDIO_SECRET` | Master secret for encrypting provider keys and signing sessions. |
| `DATABASE_URL` | PostgreSQL instead of the embedded database. |
| `STUDIO_DATA_DIR` | Persistent directory for the database, projects, logs and ZIPs. |
| `PREVIEW_PORT`, `PREVIEW_PUBLIC_ORIGIN` | Where previews are served. |

AI keys are not environment variables. Add them in **AI Providers**: Anthropic, Google Gemini, OpenAI, OpenRouter, or any OpenAI-compatible endpoint. A provider is marked *Connected* only after a real test request succeeds.

## Using the studio

| Area | What it does |
| --- | --- |
| **Overview** | Counts and recent activity read from the database and running previews. |
| **New Clone Project** | URL, *Analyze Website* (one read-only page load), name/description, test-account sign-in, scope, viewports, backend/database/auth/animation/responsive switches, AI or built-in planning. |
| **My Projects** | Status (Pending, Analyzing, Discovery complete, Generating, Building, Ready, Failed), routes, build, preview and ZIP availability; open, resume, rebuild, logs, preview, ZIP, delete. |
| **Builder workspace** | File explorer, code editor (save, save & rebuild, AI-proposed edits), the 13 pipeline steps, build and preview logs, analysis, export checks, and the live preview with desktop/tablet/mobile sizes, fullscreen, refresh, open in new tab, copy URL, rebuild and ZIP. |
| **Live Previews** | Running preview servers; stop, start, or replace an address. |
| **AI Providers** | Add, edit, test, set default, delete. Keys are shown masked only. |
| **API Configuration** | Default connection, request parameters, usage counters, key handling. |
| **Clone History** | Every job with the state and duration of each step. |
| **Settings** | Crawl limits, build limits, retries, preview expiry, system status. |

### The pipeline

Thirteen steps, each reported from the real job state (the progress bar is "completed steps ÷ 13", nothing else):

validating URL → launching browser → discovering routes → capturing screenshots → analyzing design → mapping functionality → planning architecture → generating source code → installing dependencies → building → running tests → starting preview server → preparing ZIP.

Jobs run on the server in a queue stored in the database (one at a time). They continue when the browser tab is closed, can be cancelled, resume from the failed stage, and retry unexpected failures automatically (configurable).

### What "reconstruction" means here

The generator captures each route's rendered DOM, strips the original scripts, localises stylesheets, fonts and images, groups repeated headers/footers into shared components, and replays recorded interactions (menus, tabs, accordions, dialogs) with a small runtime script. Forms are classified (contact, newsletter, search, login, sign-up) and wired to a generated Node server with SQLite storage and cookie sessions.

Limits you should know:

- The output is always a dependency-free multi-page project (HTML, CSS, one runtime script, a Node server). The AI plan may *recommend* a framework; the generator does not emit React/Next.js projects.
- Behaviour that exists only inside the original site's JavaScript (client-side routing logic, canvas apps, live data, payments, third-party widgets) is not reproduced. The workspace's Analysis tab lists what was seen but could not be replayed.
- Server-side logic of the original cannot be observed. Generated endpoints implement the visible behaviour of the forms, not the original business rules.
- Sites that block automated browsers, or need CAPTCHA/MFA to sign in, stop with a clear error.

### Generated project

```
package.json  README.md  .env.example  .gitignore
src/pages/        one HTML file per route
src/components/   shared header/footer and other repeated blocks
src/styles/ src/scripts/ src/data/   styles, runtime, site manifest
public/assets/    images, fonts
server/           Node HTTP server, form endpoints, auth, search
db/               SQLite schema
tests/            smoke tests (node --test)
docs/             architecture, routes, limitations, testing notes
```

`npm run build && npm test && npm start`. No dependencies to install.

## Security model

- **SSRF**: only http(s); private, loopback, link-local and metadata addresses are refused after DNS resolution, for the first request and for every request the browser makes while crawling. Credentials in URLs are refused.
- **Secrets**: provider keys and test-account passwords are encrypted with AES-256-GCM. Keys are never returned by the API, never logged, never sent to the target site, never written into generated projects. The test-account password is erased when discovery ends.
- **Isolation**: build, test and preview processes run with a clean environment, Node's permission model limited to the project directory, memory and time limits, and loopback-only ports. `npm install` runs with `--ignore-scripts` against an allow-list.
- **Previews**: served from a separate origin behind a 128-bit token that can be replaced; they stop when idle.
- **API**: optional password session, same-origin check on every mutation, rate limits, path-traversal checks on all file access.
- **ZIP**: verified before download (integrity, required files, scan for stored secrets); a failed build removes the previous archive.

This is defence in depth for a self-hosted tool, not a multi-tenant sandbox: there is one shared password and no per-user separation. For stronger isolation run the studio inside a container or VM (see `docs/DEPLOYMENT.md`).

## Development

```bash
npm run dev          # development server
npm run typecheck
npm run lint
npm run test:e2e     # engine end-to-end test (47 checks, about 4 minutes)
npm run build && npm run test:ui   # browser test of the UI against the production build (32 checks)
npm run package:skill              # rebuild the agent-skill ZIP served by /api/download
```

Layout:

```
src/app/(site)/        landing page and skill browser
src/app/studio/        dashboard pages
src/app/api/           REST API
src/app/preview/       same-origin preview fallback
src/components/studio/ UI
src/lib/studio/        engine: jobs, discovery, planning, generation, build, preview, ZIP, providers, security
src/db/                schema and database bootstrap
studio-engine/         in-page capture scripts, generated-project template, demo site
scripts/               end-to-end tests
universal-website-cloner/   the agent skill
```

See `docs/DEPLOYMENT.md` and `docs/TESTING-REPORT.md`.
