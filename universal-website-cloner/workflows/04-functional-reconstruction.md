# Functional (and Backend/Database) Reconstruction

Not a screenshot copy: every observable behaviour needs a working implementation or a documented gap.

## Steps
1. **Functionality inventory** → assign IDs (F-001…). Mark which need a server.
2. **Observe network *shape*** (Browser Agent): which user actions trigger which request patterns, pagination style (`page`, `cursor`), filter parameters, response fields. Record shapes — not secrets, tokens, or real user data.
3. **Design your own API contract** (`api-data-model.md`). Never call, proxy or replay the reference's private endpoints; never reuse tokens/cookies/keys.
4. **Data model** (Database Agent): entities, relations, enums, indexes; synthetic seeds with at least one user per role.
5. **Implement** server logic with validation and role guards; mock third-party services (payment, email, maps) with labelled adapters.
6. **Frontend wiring**: forms (validation parity — min/max/pattern/required messages), search/filter/sort, CRUD, cart/checkout (mock payment), uploads (type/size limits, local storage), notifications, settings, profiles, dashboards (charts from seeded data).
7. **States:** loading/empty/error/success for every data fetch.
8. **Test** each functionality ID (QA Agent).

## Backend technology decision
| Situation | Suggested |
|-----------|-----------|
| Content site, few forms | Static/SSG + serverless route handlers |
| App with accounts + CRUD | Next.js route handlers + PostgreSQL + Drizzle/Prisma |
| Real-time / chat | WebSocket/SSE service or Supabase/Firebase realtime |
| Small offline demo | SQLite |
| User requires Firebase/Supabase | Use it — and keep keys in `.env` |

## Unreproducible behaviour
Payments, MFA, SSO with third-party IdPs, proprietary recommendations/ML, email/SMS delivery, external inventory. Provide mock adapters and list in `unavailable-behavior.md`.
