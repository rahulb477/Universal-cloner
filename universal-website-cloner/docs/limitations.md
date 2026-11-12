# Known Limitations

Be honest with users about these.

## Reconstruction limits
- **Server-side logic is inferred**, not copied. Pricing rules, recommendation engines, search ranking, fraud checks and similar are approximated or mocked.
- **Third-party services** (payments, email/SMS, maps, chat, analytics, SSO) are replaced by labelled mocks.
- **Authentication**: MFA, CAPTCHA, SSO via external IdPs and email verification can't be reproduced or bypassed; the clone gets its own local auth.
- **Role coverage** is limited to roles the user supplies accounts for.
- **Dynamic/personalised content** (A/B tests, geo, time-based banners) varies between captures and causes diff noise.
- **Licensed assets** (fonts, photography, brand marks) are substituted unless the user holds rights.
- **Pixel-perfect** output is not guaranteed; the skill reports measured mismatch, not perfection.

## Tooling limits
- Crawler follows `<a href>` links and sitemap entries; routes reachable only via JS-driven navigation, forms or deep state may be missed — manual discovery is part of the workflow.
- Crawl is bounded (`--max-pages`, `--max-depth`) and reports unvisited URLs.
- `discover-interactions.mjs` probes only safe controls; behaviour behind destructive actions needs explicit authorisation or user description.
- `a11y-check` and axe-core detect only a portion of accessibility issues; manual checks are required.
- `perf-audit` is single-machine lab data (no throttling profiles); not a Lighthouse replacement.
- `visual-diff` is pixel-based: it can't tell semantic equivalence and is sensitive to font rendering/anti-aliasing.
- Shadow DOM/iframes: interaction and token scripts inspect the top-level document only.
- Canvas/WebGL/video content is not reproduced from captures.
- Only Chromium is automated by default; cross-browser checks are not included.

## Environment limits
- Linux needs system libraries for Chromium (admin rights).
- Hosted builders cannot run scripts or MCP; reduced mode only.
- MCP configuration snippets and host paths reflect commonly documented conventions and were **not executed against live hosts** during development. See [verification-report.md](verification-report.md).
- MCP servers were not connected during development; none are verified here.

## Legal limits
The skill cannot grant rights. The user is responsible for authorisation. See [security.md](security.md).
