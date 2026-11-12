# Agent Architecture

The cloner is operated by 15 specialised roles. They are **roles, not processes**: a host with sub-agent support (Claude Code, Codex, Copilot agent mode…) can run them as separate sub-agents; a single-agent host plays each role in turn, following the same deliverable contracts.

| # | Agent | Definition | Owns (primary deliverable) |
|---|-------|------------|----------------------------|
| 1 | Orchestrator | [01-orchestrator.md](01-orchestrator.md) | `state.json`, phase gates, architecture proposal |
| 2 | Discovery | [02-discovery.md](02-discovery.md) | `discovery-report.md`, `route-inventory.md` |
| 3 | Browser | [03-browser.md](03-browser.md) | evidence folder (screenshots, interaction inventory) |
| 4 | UI/UX | [04-ui-ux.md](04-ui-ux.md) | `design-system.md`, `visual-mismatch-register.md` |
| 5 | Frontend | [05-frontend.md](05-frontend.md) | UI code in `project/` |
| 6 | Backend | [06-backend.md](06-backend.md) | API/business logic, `api-data-model.md` (API half) |
| 7 | Database | [07-database.md](07-database.md) | schema, seeds, `api-data-model.md` (data half) |
| 8 | Authentication | [08-authentication.md](08-authentication.md) | `auth-report.md`, working login |
| 9 | Asset | [09-asset.md](09-asset.md) | `asset-register.md`, `public/` assets |
| 10 | Animation | [10-animation.md](10-animation.md) | `animation-spec.md`, motion code |
| 11 | QA | [11-qa.md](11-qa.md) | `qa-report.md` |
| 12 | Accessibility | [12-accessibility.md](12-accessibility.md) | `accessibility-report.md` |
| 13 | Performance | [13-performance.md](13-performance.md) | `performance-report.md` |
| 14 | Security Review | [14-security-review.md](14-security-review.md) | `security-review.md` |
| 15 | Final Review | [15-final-review.md](15-final-review.md) | `final-report.md` |

## Coordination rules
1. **Deliverables are the API.** Agents communicate only through files in `clone-workspace/<site>/` (reports, evidence, `state.json`). No agent relies on another's memory.
2. **Single owner per artefact.** Others propose changes by appending to the owner's file under a `## Requests` heading or via `node scripts/state.mjs note --agent <name> --issue "…"`.
3. **Phase gates.** The Orchestrator advances phases only when gate criteria in [../workflows/00-master-workflow.md](../workflows/00-master-workflow.md) are met.
4. **No conflicting implementations.** Frontend owns `project/src/app|components`, Backend owns `project/src/server|api`, Database owns schema/migrations/seeds. Cross-boundary edits go through a request.
5. **Evidence over assertion.** Any claim ("responsive", "accessible", "matches") cites a command output or file in `evidence/`.
6. **Safety is non-delegable.** Every agent obeys [../docs/security.md](../docs/security.md): authorised access only, no bypass of CAPTCHA/MFA/paywalls, no credential exposure, no private API reuse.

## Parallelism map
```
Discovery ─┬─> UI/UX ───────┐
           ├─> Browser ─────┤
           └─> Backend/DB ──┼─> Frontend ─> Animation ─┐
                 Auth ──────┘                          ├─> QA ─┬─> A11y ─┐
                 Asset ────────────────────────────────┘       ├─> Perf ─┼─> Security ─> Final Review
                                                                └─────────┘
```
