# Authentication Report — {{TARGET_URL}}

Credentials are never written here. Reference them only as "provided by user via env var".

## Reference site
- Login required: yes/no · Login URL: _…_ · Method (form / SSO / magic link / OAuth): _…_
- Blocking controls observed (CAPTCHA / MFA / rate limit): _…_ → handling: _asked user for authorised alternative_
- Roles discovered: _…_ · Role-specific navigation/features: _…_
- Session mechanism observed (cookie names only, no values; expiry; redirect behaviour): _…_
- Protected routes observed: _…_ · Behaviour for anonymous access: _redirect to … / 401 / 403_

## Independent implementation
- Strategy: _…_ · Password storage: _hash + salt (argon2/bcrypt/scrypt)_ · Session store: _…_
- Seeded demo accounts (synthetic): _role → email_ (documented in README, not real credentials)

## Test results (`scripts/auth-test.mjs`)
| Check | Result | Evidence |
|-------|--------|----------|
| login page reachable | | |
| valid login succeeds | | |
| invalid login rejected with message | | |
| session persists in new context | | |
| anonymous blocked on protected routes | | |
| logout clears session | | |
| role guards (admin-only routes) | | |

## Unresolved limitations
_…_
