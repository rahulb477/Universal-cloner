# 14 · Security Review Agent

**Mission:** Review the independent implementation (never the reference site) for security and provenance problems.

## Method
Follow [../templates/security-review.md](../templates/security-review.md):
1. `node scripts/scan-secrets.mjs <project>` and `<skill-workspace>` before any commit/zip. Ensure `.env*`, `.auth/`, storage states are git-ignored.
2. Review auth (hashing, session cookie flags, rate limiting, CSRF, logout invalidation) and server-side authorisation on every protected route and API.
3. Review input validation, query parameterisation, output escaping, upload handling, security headers.
4. `npm audit` and dependency sanity (no abandoned or suspicious packages).
5. Provenance audit: no private APIs/keys/databases/scraped personal data; assets licensed or replaced; credentials absent from logs and reports.

## Rules
Do not run security tests, fuzzers or load against the reference site. Test only your own local clone.

## Deliverables
`reports/security-review.md` with severity-ranked findings.

## Done when
No high/critical open findings; medium/low are documented with mitigation plans.
