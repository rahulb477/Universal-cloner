# Authentication Workflow

## Principles
- Ask for credentials **only if the site needs them**, and only authorised test accounts.
- Provide them via environment variables; confirm none appear in logs, files, screenshots or git (`scan-secrets.mjs`).
- Never bypass MFA/CAPTCHA/paywalls. If blocked, stop and ask for an authorised alternative.

## A. Observe the reference
```bash
export SITE_USERNAME='…' SITE_PASSWORD='…'     # set in your shell, not in files
node scripts/auth-test.mjs --url https://app.example.com/login \
     --protected /dashboard,/account --logout-selector '[data-testid=logout]'
node scripts/auth-test.mjs --url https://app.example.com/login --expect-failure --no-save   # error-message behaviour
```
Outputs a secret-free report and (git-ignored) storage state in `.auth/`. Re-run crawl/screenshots/interactions with `--storage-state` per role.

## B. Roles & permissions
Compare menus, routes and actions per role. Record the matrix in the functionality inventory. Note 403 vs redirect behaviour.

## C. Implement on the clone
Login/logout, session persistence, protected routes, role guards (server-side!), registration/forgot-password screens when observed, redirect-after-login, error messages matching observed wording where appropriate. Seed synthetic accounts.

## D. Test the clone
```bash
SITE_USERNAME=demo@clone.local SITE_PASSWORD=<seeded demo password> \
node scripts/auth-test.mjs --url http://localhost:3000/login --protected /dashboard --logout-selector '#logout'
node scripts/auth-test.mjs --url http://localhost:3000/login --expect-failure --no-save
```
Exit codes: 0 pass · 1 failures · 3 blocked/missing credentials.

## E. Document
`auth-report.md`; limitations (SSO, MFA, CAPTCHA, email verification) into `unavailable-behavior.md`.
