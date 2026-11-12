# QA, Accessibility, Performance, Security & Regression

Run against the clone's local URL (start the dev/prod server first).

```bash
node scripts/pipeline.mjs --url http://localhost:3000 --mode clone          # crawl, shots, interactions, console, links, a11y, perf
node scripts/auth-test.mjs --url http://localhost:3000/login --protected /dashboard   # if auth applies
node scripts/visual-diff.mjs --reference <ref-shots> --candidate <clone-shots> --out <dir> --max-mismatch 5
node scripts/regression.mjs --url http://localhost:3000 --update            # store baseline once accepted
node scripts/scan-secrets.mjs <project-dir>
```

| Concern | Agent | Report |
|---------|-------|--------|
| Functional + regression | QA | `qa-report.md` |
| Accessibility | Accessibility | `accessibility-report.md` (+ [../checklists/accessibility.md](../checklists/accessibility.md)) |
| Performance | Performance | `performance-report.md` |
| Security/provenance | Security Review | `security-review.md` |

## Exit-code semantics
Audit scripts return **1 when they find issues** (that is a result, not a crash). Read their reports; fix; re-run until 0 or until residuals are justified in writing.

## Regression policy
After each accepted visual state: `regression.mjs --update`. Later runs fail if any image exceeds `--max-mismatch` (default 1 %). Update baselines deliberately, never to silence failures.
