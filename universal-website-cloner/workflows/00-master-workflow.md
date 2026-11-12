# Master Workflow

State is tracked with `node scripts/state.mjs` (phases: startup → discovery → architecture → implementation → qa → refinement → final-report). Resume any session with `node scripts/state.mjs next --site <slug>`.

## Phase 1 · Startup — [01-startup-intake.md](01-startup-intake.md)
**Gate:** capability report saved · target URL known · authorisation confirmed · auth requirement known · workspace initialised.

## Phase 2 · Discovery — [02-discovery.md](02-discovery.md)
Agents: Discovery, Browser, UI/UX (parallel).
**Gate:** discovery report + route inventory + functionality inventory v1 + desktop/mobile screenshots of every accessible route + design tokens captured + blockers listed and raised to the user.

## Phase 3 · Architecture
Agent: Orchestrator (with Backend, Database, Frontend input).
Produce `architecture-proposal.md`; present summary to the user; continue on approval or on "go with your recommendation".
**Gate:** proposal exists; stack, data model, auth strategy and unreproducible behaviours are explicit.

## Phase 4 · Implementation — [03](03-visual-reconstruction.md), [04](04-functional-reconstruction.md), [05](05-authentication.md)
Database → Backend/Auth → Frontend → Animation, with Asset in parallel.
**Gate:** project installs and runs from README; every inventory route renders; login works (if applicable).

## Phase 5 · QA — [06-qa-regression.md](06-qa-regression.md)
QA, Accessibility, Performance, Security (parallel).
**Gate:** all four reports exist with real command output.

## Phase 6 · Refinement — [07-refinement-loop.md](07-refinement-loop.md)
Loop until: no open high-severity defects, worst visual mismatch acceptable and documented, remaining gaps recorded.

## Phase 7 · Final report
Final Review Agent writes `final-report.md`. Package/run instructions verified on a clean install.

## Stop-and-ask conditions (any phase)
CAPTCHA · MFA · paywall · access denied · robots/ToS prohibition · request to use private APIs/credentials · unclear authorisation · missing tool that blocks progress.
