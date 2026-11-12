# Setup Guide

See [../INSTALL.md](../INSTALL.md) for the quick path. This page covers details.

## Playwright & Chromium
```bash
npm run setup                 # = npm install && npx playwright install chromium
npx playwright install-deps chromium    # Linux system libraries (requires sudo/root)
node scripts/check-env.mjs    # confirms a real browser launch
```
Use `--headed` on any script to watch the browser. Proxy: set `HTTPS_PROXY`/`HTTP_PROXY`. Self-signed local HTTPS: `--ignore-https-errors`.

## Optional: axe-core
Installed as an optional dependency by `npm install`; `a11y-check.mjs` uses it automatically. Disable with `--no-axe`.

## Evidence locations
Default output: `clone-workspace/<host-slug>/evidence/<kind>/`. Override with `--out DIR`. Scripts reuse `evidence/crawl/routes.json` automatically so you only crawl once.

## Authenticated sessions
```bash
SITE_USERNAME=… SITE_PASSWORD=… node scripts/auth-test.mjs --url https://app.example.com/login --protected /dashboard
# creates .auth/<host>.storage-state.json (chmod 600, git-ignored)
node scripts/screenshot.mjs --url https://app.example.com --storage-state .auth/app-example-com.storage-state.json
```
Sessions expire; re-run `auth-test.mjs` when they do. Delete `.auth/` when finished.

## Typical full run
```bash
npm run init -- --url https://target.example --auth unknown
npm run pipeline -- --url https://target.example --mode reference
# … implement the clone in clone-workspace/<slug>/project …
npm run pipeline -- --url http://localhost:3000 --mode clone
node scripts/visual-diff.mjs --reference clone-workspace/<slug>/evidence/screenshots/reference \
                             --candidate clone-workspace/<slug>/evidence/screenshots/clone --out clone-workspace/<slug>/evidence/visual-diff
npm run regression -- --url http://localhost:3000 --update
```
Screenshot sets for diffing must use the same routes and viewports (`--routes`, `--viewports`) so file names line up. Note: reference and clone are on different hosts, so each lands in a different host-slug folder by default; use `--out` to put both in one folder when diffing.

## CI usage
All audit scripts exit non-zero on findings, so they can gate a pipeline: `node scripts/console-errors.mjs --url $URL && node scripts/check-links.mjs --url $URL`.
