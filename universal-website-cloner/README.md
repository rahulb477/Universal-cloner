# Universal Website Cloner

A reusable **AI-agent skill** plus **automation toolkit**. Give it to a compatible AI coding agent, point it at a website you are authorised to inspect, and the agent will discover the whole site, understand its design and behaviour, rebuild an **independent** working version locally, and verify the result with screenshots and tests.

- Skill instructions: [SKILL.md](SKILL.md) · Universal prompt: [PROMPT-START-HERE.md](PROMPT-START-HERE.md)
- Install: [INSTALL.md](INSTALL.md) · Release: see [VERSION.md](VERSION.md) and [CHANGELOG.md](CHANGELOG.md)

## What is inside
| Folder | Contents |
|--------|----------|
| [agents/](agents/README.md) | 15 role definitions (Orchestrator … Final Review) and coordination rules |
| [workflows/](workflows/README.md) | Master workflow, discovery, visual, functional, auth, QA, refinement, category playbooks, fallbacks |
| [scripts/](scripts) | 20 Node.js/Playwright tools: crawl, screenshots, diff, tokens, assets, interactions, auth test, links, console, a11y, perf, regression, secret scan, state, validate, package |
| [templates/](templates) | 16 report templates scaffolded per project |
| [mcp/](mcp/README.md) | MCP strategy, catalog, verification protocol, example config |
| [integrations/](integrations/README.md) | Claude Code, Codex, Cursor, Copilot, opencode, Gemini CLI, hosted builders |
| [checklists/](checklists/pre-delivery.md) | Discovery, accessibility, delivery, release checklists |
| [testing/](testing/README.md) | Fixture website + end-to-end self-test of every script |
| [docs/](docs/architecture.md) | Architecture, setup, troubleshooting, security, version history, limitations, verification report |
| [examples/](examples/README.md) | Worked example session |

## Quick start
```bash
cd universal-website-cloner
npm run setup            # installs Playwright + Chromium (Linux may need: npx playwright install-deps chromium)
npm run check-env        # what works on this machine
npm run selftest         # proves the scripts work against the bundled fixture site
```
Then tell your AI: *"Read universal-website-cloner/SKILL.md and start."* It will ask for the URL and login needs.

## One-liners
```bash
node scripts/pipeline.mjs --url https://example.com                   # evidence for the reference
node scripts/pipeline.mjs --url http://localhost:3000 --mode clone    # audit the clone
node scripts/visual-diff.mjs --reference <ref-shots> --candidate <clone-shots> --out diff-out
```

## Principles
Discovery before coding · authorised use only · no bypassing protections · no credential exposure · independent implementation · evidence over assertion · honest limitations ([docs/limitations.md](docs/limitations.md)).

## Legal note
You are responsible for having the right to inspect and reproduce a site. The skill is designed for migrations, prototyping, learning, accessibility/QA of your own properties and similar authorised work — not for phishing, impersonation, or copying others' protected content. See [docs/security.md](docs/security.md).
