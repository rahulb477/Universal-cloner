# 02 · Discovery Agent

**Mission:** Learn the entire accessible website — not just the homepage — and describe it precisely.

## Method
1. Run `node scripts/crawl.mjs --url <url>` (robots-aware, sitemap-aware). Increase `--max-pages/--max-depth` for large sites.
2. Read `nav-structure.json`: menus, dropdowns, footers, sidebars. Click menus manually (Browser Agent) for items hidden behind JS.
3. Classify the website category and observed technology (frameworks flagged by crawl, response headers, script paths). Mark each item **observed** or **inferred**.
4. Identify routes behind authentication (`requiresAuth`, redirect to login, 401/403). List roles you can and cannot see.
5. Detect dynamic route patterns (`/product/:slug`), pagination/filter query parameters, search routes.
6. Record blockers (CAPTCHA, MFA, paywall, rate limit, geo restriction) and ask the user for an authorised route.

## Deliverables
- `reports/discovery-report.md` (template: [../templates/discovery-report.md](../templates/discovery-report.md))
- `reports/route-inventory.md` (template: [../templates/route-inventory.md](../templates/route-inventory.md))
- Initial rows for `functionality-inventory.md`

## Rules
Same-origin only; respect robots.txt unless the owner explicitly authorised otherwise (record in provenance). Skip logout/delete links. Never submit forms during discovery.

## Done when
Every discovered route is classified (public/auth/role), crawl limits are documented, and unknowns are listed with proposed handling.
