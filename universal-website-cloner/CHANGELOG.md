# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/). Versioning: semver for the release; capability levels (V#) tracked in [docs/version-history.md](docs/version-history.md).

## [1.0.0] — first consolidated release (capability level V12)

### Added — V1 core
- `SKILL.md` with front matter, hard rules, startup protocol; `PROMPT-START-HERE.md` universal prompt.
- 16 report templates, `init-project.mjs` workspace scaffolder, `check-env.mjs` capability check.
### Added — V2 discovery & visual comparison
- `crawl.mjs` (robots/sitemap aware), `screenshot.mjs` (4 viewports), `visual-diff.mjs`.
### Added — V3 interactions
- `discover-interactions.mjs` with safe probing and risky-control skipping.
### Added — V4 backend/database reconstruction
- Backend and Database agents, `api-data-model` template, functional reconstruction workflow.
### Added — V5 authentication
- `auth-test.mjs` (login, negative test, persistence, protected routes, logout, CAPTCHA/MFA stop), Authentication agent and workflow.
### Added — V6 UI/UX & motion
- `extract-design-tokens.mjs`, Animation and UI/UX agents, animation spec template.
### Added — V7 MCP & hosts
- MCP principles/catalog/verification protocol, `mcp-check.mjs`, integrations for 7 host types.
### Added — V8 QA
- `check-links.mjs`, `console-errors.mjs`, `a11y-check.mjs` (+ optional axe-core), `perf-audit.mjs`, `regression.mjs`, `pipeline.mjs`, QA/A11y/Perf agents, checklists.
### Added — V9 assets
- `extract-assets.mjs` (inventory-first, opt-in download), Asset agent, asset register.
### Added — V10 orchestration
- 15 agent definitions with coordination rules; refinement-loop workflow; Final Review agent.
### Added — V11 compliance guardrails
- `scan-secrets.mjs`, log redaction in `lib/common.mjs`, robots.txt enforcement, provenance log, security docs.
### Added — V12 resumable state
- `state.mjs` phase/state/hand-off log.
### Added — repository quality
- `validate-repo.mjs`, `package-zip.mjs`, fixture website and `testing/selftest.mjs`, verification report.
