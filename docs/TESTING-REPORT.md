# Testing report

Date: 2026-11-12 · Node v22.22.3 · Linux x64, 2 CPUs, 3.9 GB RAM · Chromium 153 (bundled build)

## Summary

| Suite | Command | Result |
| --- | --- | --- |
| Type check | `npm run typecheck` | pass, 0 errors |
| Lint | `npm run lint` | pass, 0 errors, 0 warnings |
| Production build | `npm run build` | pass (2 Turbopack tracing notices about dynamic file access, expected for a self-hosted server) |
| Engine end-to-end | `npm run test:e2e` | **47/47** |
| UI end-to-end (real browser, production server) | `npm run test:ui` | **32/32** |

Both end-to-end suites run the complete workflow against the bundled demo website "Harbor & Pine"
(`studio-engine/demo-site/`, 11 routes including a signed-in area, tabs, accordion, dialog, mobile menu,
contact form, newsletter, search and login). It is served on a loopback port that is explicitly allow-listed for the test.

## What was not tested

Read this before relying on the numbers above.

- **No real AI provider was called.** This environment has no provider keys and no access to their APIs.
  Provider handling (key storage, masking, 401 handling, model discovery, planning, file edits, usage counters)
  was exercised against a local mock that speaks the OpenAI-compatible protocol. The Anthropic, Gemini, OpenAI and
  OpenRouter adapters are implemented but **have not been run against the real services**. Use *Test Connection* after adding a key.
- **No third-party website was cloned.** The sandbox has no general internet access. Results on real sites will vary
  with how much of their behaviour lives in JavaScript; see "Limits" in the README.
- **PostgreSQL via `DATABASE_URL` was not run** (no server available). All tests used the embedded PGlite database, which runs the same SQL through the same Drizzle schema.
- **Docker, macOS, Windows** and browsers installed via Playwright or `CHROMIUM_EXECUTABLE_PATH` were not tested; only the bundled Linux x64 Chromium.
- No load, concurrency or long-running soak tests. Jobs run one at a time by design.
- The visual comparison (0% average, 0.2% worst route) is against a simple, mostly static demo site and should not be read as a general fidelity figure.

## Requested workflow coverage

| Requested test | Covered by |
| --- | --- |
| 1 Provider configuration | Engine 2–6, UI 4–8 |
| 2 API key validation | Engine 3, 5, 6 (real HTTP test call, 401 path), UI 5–6 |
| 3 URL submission | Engine 7–15 (SSRF), UI 9–12 |
| 4 Route discovery | Engine "routes discovered automatically", "protected route identified" |
| 5 Screenshot capture | Engine "screenshots captured for desktop, tablet and mobile" |
| 6 Project generation | Engine "generated project structure", "one shared header", "CSS url() rewritten" |
| 7 Dependency installation | Engine "job succeeded with all 13 steps", "unzipped project installs, builds, tests and runs" |
| 8 Build | Engine "build succeeded, tests passed" |
| 9 Preview launch | Engine "preview URL serves the real generated site", UI 15 |
| 10 Preview URL access | Engine "wrong preview token is rejected", UI 17, 25 |
| 11 Navigation inside preview | Engine "navigation inside the preview", UI 15 |
| 12 Responsive preview | Engine "responsive preview: mobile menu", UI 16 |
| 13 ZIP generation | Engine "ZIP exists, integrity verified, essential files present, no secrets" |
| 14 ZIP download | UI 23 (downloaded through the browser, opened, scanned) |
| 15 Project persistence | Engine "project metadata persists", UI 24 |
| 16 Error recovery | Engine build error → fix → resume, cancel → restart, unreachable target; UI 22 |

## Engine end-to-end (47/47)

| # | Check | Result | Evidence |
| --- | --- | --- | --- |
| 1 | database boots without DATABASE_URL (embedded PGlite) | PASS | pglite |
| 2 | provider saved; key is encrypted at rest and masked | PASS | ••••••••0000 |
| 3 | wrong key is rejected by a real connection test | PASS | HTTP 401 from provider. The API key was rejected. Incorrect  |
| 4 | creating an AI project is refused while no provider is connected | PASS |  |
| 5 | correct key: models are discovered, model must be chosen | PASS |  |
| 6 | model selected → connected and default | PASS |  |
| 7 | blocked: http://127.0.0.1:1/ | PASS |  |
| 8 | blocked: http://localhost/ | PASS |  |
| 9 | blocked: http://169.254.169.254/latest/meta-data | PASS |  |
| 10 | blocked: http://10.0.0.5/ | PASS |  |
| 11 | blocked: file:///etc/passwd | PASS |  |
| 12 | blocked: http://[::1]/ | PASS |  |
| 13 | blocked: http://user:pw@example.com/ | PASS |  |
| 14 | authorisation confirmation is required | PASS |  |
| 15 | quick analysis of the target (Analyze website) | PASS | "Cabins by the water · Harbor & Pine", 8 routes, browser bundled (@sparticuz/chromium) |
| 16 | job succeeded with all 13 steps done | PASS |  |
| 17 | routes discovered automatically (links + sitemap + authenticated area) | PASS | 11 discovered, 10 cloned |
| 18 | protected route identified; logout skipped as unsafe | PASS |  |
| 19 | screenshots captured for desktop, tablet and mobile | PASS | 50 files |
| 20 | no write request reached the reference site during analysis | PASS |  |
| 21 | test-account password wiped after discovery | PASS |  |
| 22 | AI provider was called for the architecture plan; usage recorded | PASS |  |
| 23 | generated project structure (pages, components, backend, database, docs) | PASS |  |
| 24 | one shared header across all pages (active state normalised) | PASS |  |
| 25 | CSS url() and @import rewritten to local files | PASS |  |
| 26 | build succeeded, tests passed, visual comparison recorded | PASS | 10/10 routes, avg mismatch 0%, worst 0.2%, 8 tests |
| 27 | preview URL serves the real generated site | PASS |  |
| 28 | wrong preview token is rejected | PASS |  |
| 29 | navigation inside the preview (relative links under the path prefix) | PASS |  |
| 30 | recorded tabs, accordion and dialog work without the original JavaScript | PASS |  |
| 31 | responsive preview: mobile menu toggle recorded at the mobile viewport | PASS |  |
| 32 | contact form posts to the clone's own backend and is validated | PASS |  |
| 33 | search returns results from the clone's search API | PASS |  |
| 34 | authentication: protected page redirects, wrong password fails, sign-in works, sign-out works | PASS |  |
| 35 | unknown route shows the captured 404 page with working styles | PASS |  |
| 36 | no uncaught JavaScript errors in the preview | PASS |  |
| 37 | preview process is isolated (cannot read outside its project) | PASS | ERR_ACCESS_DENIED,ERR_ACCESS_DENIED,env-clean |
| 38 | ZIP exists, integrity verified, essential files present, no secrets | PASS | 44 entries, sha256 ae0c50051ca8… |
| 39 | the unzipped project installs, builds, tests and runs on its own | PASS |  |
| 40 | AI-assisted file edit + rebuild reaches the live preview | PASS |  |
| 41 | build error is reported with the real compiler message; project marked failed | PASS | Build failed (exit 1): error: src/pages/login.html: include not found: component |
| 42 | recovery: fix the file, resume → ready again | PASS |  |
| 43 | re-running discovery with sign-in requires the password again | PASS |  |
| 44 | built-in planning project (no AI) + cancellation mid-run | PASS | cancelled → restarted → ready → deleted |
| 45 | unreachable target fails cleanly at the right step | PASS | Could not open http://127.0.0.1:<port>/: page.goto: net::ERR_CONNECTION |
| 46 | preview stop → gateway reports it; restart on demand | PASS |  |
| 47 | project metadata persists in the database across a reload | PASS |  |

## UI end-to-end (32/32)

Runs `next start` on the production build with `STUDIO_PASSWORD` set and a throw-away data directory, then drives the interface with Playwright.

| # | Check | Result | Evidence |
| --- | --- | --- | --- |
| 1 | API rejects unauthenticated requests when STUDIO_PASSWORD is set | PASS |  |
| 2 | studio redirects to the sign-in screen; wrong password is refused; right one signs in | PASS |  |
| 3 | landing page links to the studio; skill browser and skill ZIP still work | PASS | skill ZIP served |
| 4 | empty state says no provider is configured (overview + providers page) | PASS |  |
| 5 | wrong key: Save & Test Connection reports the provider's real rejection, never 'connected' | PASS |  |
| 6 | correct key: models discovered, model chosen, then Connected + Default | PASS |  |
| 7 | the key never reaches the browser (page, API responses) and is masked | PASS |  |
| 8 | API Configuration page: default connection, usage counters, parameters save | PASS |  |
| 9 | SSRF: a private address is refused by Analyze Website with a clear message | PASS |  |
| 10 | Analyze Website shows the real page (title, screenshot, linked routes) | PASS |  |
| 11 | Start Cloning is blocked until authorisation is confirmed; login fields validate | PASS |  |
| 12 | Start Cloning creates the project and opens the builder workspace | PASS |  |
| 13 | no preview address exists while the job is running | PASS |  |
| 14 | progress comes from real job steps and reaches 13/13 → Ready | PASS | observed step counts 1, 2, 3, 4, 5, 8, 11, 13 in 101s |
| 15 | live preview shows the real generated site at /preview/<token>/ and navigation works inside it | PASS | http://127.0.0.1:<port>/preview/4a7fe9e3…/ |
| 16 | device sizes: tablet 820px, mobile 390px, desktop; fullscreen and refresh | PASS |  |
| 17 | open in new tab + copy preview URL point at the served preview | PASS |  |
| 18 | file explorer lists pages, components, backend, database; a file opens in the editor | PASS |  |
| 19 | AI edit proposes a change (not saved), Save & rebuild runs a real job and the preview updates | PASS |  |
| 20 | build logs tab streams the job log | PASS |  |
| 21 | analysis tab: route map, forms, interactions, AI plan, verification | PASS |  |
| 22 | build error is shown (no preview URL, no ZIP), then fixed and rebuilt | PASS |  |
| 23 | export tab + Download ZIP: verified archive with source, backend, docs and no secrets | PASS | 44 files, 45503 bytes |
| 24 | My Projects persists across a reload and shows status, routes, build, preview and ZIP | PASS |  |
| 25 | Live Previews: stop → address disappears and stops serving; start → serving again | PASS |  |
| 26 | Clone History lists every job with its real step states | PASS | 4 jobs |
| 27 | Settings save, are clamped by the server and persist | PASS |  |
| 28 | theme toggle switches dark/light and is remembered | PASS |  |
| 29 | responsive: at 390px the sidebar becomes a working menu and the workspace has pane tabs | PASS |  |
| 30 | delete project removes it, its preview and its files | PASS |  |
| 31 | sign out ends the session | PASS |  |
| 32 | no uncaught JavaScript errors in the studio UI | PASS |  |

## Defects found and fixed during testing

- Header/footer were emitted as a separate component per page because element ids were assigned by a per-page counter. Ids are now structural hashes.
- The generated smoke test mis-counted tests because it read the site manifest inside `before()`.
- The ZIP excluded `src/data/` (an over-broad directory filter), which made the exported project unbuildable.
- A Chromium launch immediately after another browser closed could fail once; the launch is now retried, and the test-account password is kept until no automatic retry remains (previously the retry failed with "password already wiped").
- Port 4190 was used for the preview listener in tests; Node's `fetch` refuses that port. The default is 4100.
