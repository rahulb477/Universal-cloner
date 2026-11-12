# Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `Playwright is not installed` | dependencies missing | `npm run setup` in the skill root |
| `Could not launch Chromium: Target page, context or browser has been closed` (Linux) | missing system libs (`libnss3`, `libatk`, …) | `npx playwright install-deps chromium` (admin rights) or run in Docker `mcr.microsoft.com/playwright` image |
| `Executable doesn't exist` | browser not downloaded | `npx playwright install chromium` |
| Crawl finds only 1 page | SPA renders nav late, or robots disallows, or links are buttons | raise waits, crawl authenticated, add routes with `--routes`, check `routes.json → skipped`; use manual discovery |
| Many routes `skipped: robots.txt` | site disallows crawling | respect it; ask the owner; `--ignore-robots` only with explicit written authorisation (it is recorded) |
| Pages redirect to login | auth needed | `workflows/05-authentication.md`, then `--storage-state` |
| `auth-test` exit 3 | credentials missing or CAPTCHA/MFA detected | set env vars; for CAPTCHA/MFA ask the user for an authorised alternative — the tool will not bypass |
| `auth-test` logs in but "login succeeds" fails | success heuristic is "password field gone" | pass `--success-url` / `--success-selector` |
| Visual diff huge on every page | different viewport/fonts/scrollbars/animations | same `--viewports`; use `--freeze-animations`; check fonts; review diff PNGs |
| Diff reports `missing-in-candidate` | route/file names differ | capture both with identical `--routes`; file names derive from the path |
| Lazy images blank in screenshots | not scrolled | default auto-scroll handles most; for custom loaders increase waits or use `--viewport-only` |
| `perf-audit` exits 1 | budget exceeded | read the report; adjust budgets with `--budget-lcp/--budget-cls` only with justification |
| `a11y-check` reports contrast errors | axe found real contrast issues | fix tokens; verify against measured colours |
| `validate-repo` fails on markdown link | moved/renamed file | fix the relative link |
| `package-zip` "No zip tool" | no `zip`, `python3` | install one, or zip manually excluding `node_modules`, `clone-workspace`, `.auth` |
| MCP server configured but unusable | not started / wrong config / missing env | [../mcp/verification.md](../mcp/verification.md); fall back to scripts |
| Selftest SKIPs | no working Chromium | fix browser first (see above) |

## Getting more diagnostic output
Run any script with `--headed`, and inspect JSON reports in `clone-workspace/<slug>/evidence/`. Node errors from unexpected exceptions include a stack; expected failures print `ERROR:` messages.
