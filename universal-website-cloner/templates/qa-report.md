# QA Report — {{TARGET_URL}}

Commands run and their real outcome. Do not record a result you did not observe.

| Check | Command | Result | Date | Notes |
|-------|---------|--------|------|-------|
| Build | `npm run build` | | | |
| Type check | `npx tsc --noEmit` | | | |
| Crawl clone routes | `node scripts/crawl.mjs --url <clone>` | | | |
| Links & assets | `node scripts/check-links.mjs --url <clone>` | | | |
| Console errors | `node scripts/console-errors.mjs --url <clone>` | | | |
| Interactions | `node scripts/discover-interactions.mjs --url <clone>` | | | |
| Auth flow | `node scripts/auth-test.mjs --url <clone>/login …` | | | |
| Visual diff | `node scripts/visual-diff.mjs …` | | | |
| Regression | `node scripts/regression.mjs --url <clone>` | | | |

## Functional test matrix
| Functionality ID | Test steps | Expected | Actual | Pass/Fail |
|------------------|-----------|----------|--------|-----------|

## Defects
| ID | Severity | Description | Owner agent | Status |
|----|----------|-------------|-------------|--------|

## Not executed (and why)
_…_
