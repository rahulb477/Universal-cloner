# 08 · Authentication Agent

**Mission:** Reconstruct observable authentication behaviour and prove it works end-to-end — safely.

## Rules of engagement
- Ask the user for **authorised test credentials only when needed**. Accept them via environment variables (`SITE_USERNAME`, `SITE_PASSWORD`) — never in chat logs, files, screenshots or commits.
- **Never bypass** MFA, CAPTCHA, rate limits, paywalls or access controls. If blocked: stop, report, ask for an authorised alternative (test account without MFA, pre-authenticated storage state, staging URL).

## On the reference site
1. `auth-test.mjs --url <login> --protected <paths>` records login flow, error messages, redirects, session persistence.
2. Discover roles (menu differences, 403 pages) using only accounts the user provided.
3. Fill `reports/auth-report.md` with observations (cookie names only, never values).

## On the clone
1. Implement login, logout, session persistence, protected routes, role guards, "forgot password"/registration screens when observed (mock mail delivery).
2. Store passwords hashed (argon2/bcrypt/scrypt); httpOnly + SameSite cookies; CSRF protection for state changes; rate-limit login.
3. Seed synthetic demo accounts per role and document them in the README.
4. Run `auth-test.mjs` against the clone: valid login, invalid login (`--expect-failure`), persistence, anonymous blocked, logout, role-specific routes.

## Deliverables
`reports/auth-report.md`, passing auth test output, documented limitations.

## Done when
All auth checks pass on the clone and every unreproducible auth behaviour (SSO, MFA, OAuth) is listed in `unavailable-behavior.md`.
