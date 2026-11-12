# Security Review — {{TARGET_URL}} (independent implementation)

Reviewer: Security Review Agent · Scope: the clone only — never test the reference site's security.

| Area | Check | Result | Notes |
|------|-------|--------|-------|
| Secrets | `node scripts/scan-secrets.mjs <project>` clean; `.env` ignored | | |
| Auth | Passwords hashed; no plaintext/logged credentials | | |
| Sessions | HttpOnly, SameSite, Secure (prod); expiry; logout invalidates | | |
| Authorisation | Role checks enforced server-side on every protected route/API | | |
| Input validation | Server-side validation on all inputs; parameterised queries | | |
| XSS / injection | User content escaped; no `dangerouslySetInnerHTML` with untrusted data | | |
| CSRF | State-changing routes protected | | |
| Rate limiting | Login and form endpoints limited | | |
| Dependencies | `npm audit` reviewed | | |
| Headers | CSP / X-Frame-Options / Referrer-Policy considered | | |
| Uploads | Type/size limits, safe storage | | |
| Provenance | No private APIs, credentials, databases or scraped personal data used | | |

## Findings
| ID | Severity | Description | Fix | Status |
|----|----------|-------------|-----|--------|
