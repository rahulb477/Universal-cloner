# Version History

All capability levels below were designed and implemented together and shipped in **release 1.0.0**. They are milestones, not copies. "Verified" refers to [verification-report.md](verification-report.md).

| Level | Theme | Missing capability it fills | Key artefacts | Verification |
|-------|-------|-----------------------------|---------------|--------------|
| V1 | Core inspection & reconstruction | A structured, repeatable intake → discovery → build → report loop | `SKILL.md`, `PROMPT-START-HERE.md`, workflows 00–04, 16 templates, `init-project`, `check-env` | selftest: init-project; validate-repo |
| V2 | Multi-route, screenshots, responsive, visual diff | Homepage-only inspection; no evidence of visual parity | `crawl`, `screenshot`, `visual-diff` | selftest: crawl (routes, sitemap, robots, auth redirect), screenshot, visual-diff |
| V3 | Interaction discovery & state testing | Unknown behaviour behind buttons, tabs, dialogs, forms | `discover-interactions` | selftest: discover-interactions |
| V4 | Backend/API/database | Static copies with no functional parity | agents 06/07, `api-data-model`, workflow 04 | documentation-level (no script); applied per project |
| V5 | Authentication & roles | Login-gated sites and role-specific views | `auth-test`, agent 08, workflow 05 | selftest: 4 auth tests (missing creds, valid, wrong creds, leak check) |
| V6 | Advanced UI/UX, motion | Subjective styling; unmeasured transitions | `extract-design-tokens`, agents 04/10, `animation-spec` | selftest: tokens |
| V7 | MCP & host compatibility | Dependence on one host; unverifiable tool claims | `mcp/`, `integrations/`, `mcp-check` | selftest: mcp-check; **MCP servers not connected in dev environment** |
| V8 | Automated QA/regression/a11y/perf | Manual, unrepeatable quality checks | `check-links`, `console-errors`, `a11y-check`, `perf-audit`, `regression`, `pipeline` | selftest: each script, including negative cases |
| V9 | Assets & components | Unlicensed asset reuse; missing fonts/icons analysis | `extract-assets`, agent 09, `asset-register` | selftest: extract-assets |
| V10 | Multi-agent orchestration & self-review | Conflicting work, unreviewed claims | `agents/`, workflow 07, Final Review | validate-repo (agent roster) |
| V11 | Compliance & provenance guardrails | Credential leaks, impolite crawling, unclear authorisation | `scan-secrets`, `redact()`, robots enforcement, `provenance.md` | selftest: scan-secrets ×2, crawl robots test, auth leak check |
| V12 | Resumable state & hand-off | Lost context across sessions/hosts | `state`, workspace layout | selftest: init-project + state |

## Considered but not added (no real capability yet)
- Built-in video/frame recording for animation timing (Playwright supports it; needs a dependable cross-host workflow).
- Lighthouse integration (heavy dependency; `perf-audit` + Chrome DevTools MCP cover most needs).
- Automatic code generation from DOM (high risk of copying proprietary markup; contradicts independent-implementation rule).

See [../CHANGELOG.md](../CHANGELOG.md).
