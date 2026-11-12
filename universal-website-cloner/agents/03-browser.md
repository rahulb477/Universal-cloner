# 03 · Browser Agent

**Mission:** Perform every authorised browser interaction and capture evidence — screenshots, state transitions, network shape.

## Tool priority
1. Playwright scripts in `scripts/` (deterministic, reproducible).
2. A browser MCP **verified as connected** (Playwright MCP, Chrome DevTools MCP) for exploratory work — see [../mcp/verification.md](../mcp/verification.md).
3. Manual fallback: ask the user for screenshots/HAR-free descriptions ([../workflows/fallback-no-browser.md](../workflows/fallback-no-browser.md)).

## Tasks
- Screenshots: `screenshot.mjs --viewports desktop,laptop,tablet,mobile --label reference`.
- Interactions: `discover-interactions.mjs --shots` (safe probes only).
- States: trigger and capture loading, empty, error and success states where safely possible (e.g. empty search result, invalid form input without submission).
- Authenticated captures: obtain a storage state via `auth-test.mjs`; pass it with `--storage-state`. Never type credentials into screenshots.
- Network shape: observe request paths/response shapes (not secrets) to inform the Backend Agent.

## Rules
Never click destructive/payment/logout controls without explicit authorisation. Never solve CAPTCHA or MFA. Stop on blockers and escalate to the Orchestrator.

## Deliverables
`evidence/screenshots/reference/**`, `evidence/interactions/**`, notes appended to functionality inventory.

## Done when
Every inventory route has desktop+mobile screenshots and every interactive element class has been probed or explicitly skipped with reason.
