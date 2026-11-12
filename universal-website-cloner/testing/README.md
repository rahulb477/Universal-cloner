# Testing the Skill

## Self-test
```bash
npm run setup       # once
npm run selftest    # starts testing/fixture-site on a random port and runs every script against it
node testing/selftest.mjs --only "crawl|auth"     # subset (prefix match, '|' separated)
node testing/selftest.mjs --keep                  # keep evidence for inspection
```
The fixture site ([fixture-site/server.mjs](fixture-site/server.mjs)) contains deliberate defects so detectors are proven to detect:
| Fixture feature | Proves |
|-----------------|--------|
| `/missing` broken link | `check-links` reports broken internal links |
| `/buggy` console error + 404 fetch | `console-errors` captures errors |
| `/a11y-bad` (no alt, no label, empty button, skipped heading) | `a11y-check` rules fire; clean pages pass |
| `/private` disallowed in robots.txt | `crawl` respects robots |
| `/sitemap-only` | sitemap discovery |
| `/dashboard` redirect to `/login` | auth-required detection, protected-route test |
| `/login` + cookie session + `/logout` | `auth-test` happy path, negative path, persistence, logout |
| `/ui` tabs, details, dialog, search | `discover-interactions` probes |
| CSS variables, `@media`, `@keyframes` | `extract-design-tokens` |
| `/logo.svg` | `extract-assets` |

Fixture credentials are public and meaningless (`demo@example.test` / value in `server.mjs`).

## Repository validation
```bash
npm run validate    # JSON, syntax, links, versions, agents, secrets
```

## Results
The latest recorded run is in [../docs/verification-report.md](../docs/verification-report.md). Tests that cannot run (no browser) are reported as SKIP, never as PASS.
