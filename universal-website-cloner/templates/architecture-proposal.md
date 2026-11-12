# Architecture Proposal — {{TARGET_URL}}

Status: awaiting user approval · Author: Orchestrator Agent. **Do not implement before this is approved (or the user said "go with your recommendation").**

## 1. Recommended stack (with reasons)
| Layer | Choice | Why | Alternatives considered |
|-------|--------|-----|-------------------------|
| Frontend | | | |
| Styling | | | |
| Backend / API | | | |
| Database | | | |
| Auth | | | |
| Testing | Playwright + scripts in this skill | | |

## 2. Project layout
```
project/
  …
```

## 3. Route map (from route-inventory.md)
_Public vs protected; layouts; dynamic segments._

## 4. Data model (summary; details in `api-data-model.md`)
_Entities and relationships; seed data strategy (synthetic, never scraped private data)._

## 5. API surface
| Method | Path | Purpose | Auth | Replaces observed behaviour |
|--------|------|---------|------|------------------------------|

## 6. Authentication & roles
_Session strategy, password hashing, role guard, seeded demo accounts (synthetic), logout._

## 7. Behaviour that cannot be reproduced
_Link to `unavailable-behavior.md` (payments, third-party integrations, private APIs, MFA, CAPTCHA…)._

## 8. Delivery plan & agent assignments
| Step | Agent | Deliverable | Depends on |
|------|-------|-------------|------------|

## 9. Run instructions (preview)
```
npm install && npm run dev   # http://localhost:3000
```
