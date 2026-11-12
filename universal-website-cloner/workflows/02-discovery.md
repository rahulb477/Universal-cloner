# Discovery Workflow

```bash
S=universal-website-cloner/scripts; URL=https://target.example
node $S/crawl.mjs --url $URL --max-pages 60 --max-depth 4        # routes, sitemap, nav, framework hints
node $S/screenshot.mjs --url $URL --viewports desktop,laptop,tablet,mobile --label reference
node $S/extract-design-tokens.mjs --url $URL --max-routes 8
node $S/extract-assets.mjs --url $URL                              # inventory only
node $S/discover-interactions.mjs --url $URL --shots
node $S/console-errors.mjs --url $URL --viewports desktop         # baseline reference health
# or all at once:  node $S/pipeline.mjs --url $URL --mode reference
```

## Manual passes (Browser Agent)
- Open every nav menu, dropdown, mega-menu; capture hover/open states.
- Inspect footer, cookie banners, language/region/currency switchers, breadcrumbs.
- Try search (with results and with an empty result), filters, sorting, pagination.
- Trigger validation errors on forms (never submit real data), 404 page, empty states.
- Resize the viewport slowly to find breakpoints where layout changes.
- Note loading patterns (skeleton/spinner), toasts, modals, tabs, accordions, carousels.

## Authenticated discovery
Follow [05-authentication.md](05-authentication.md) to get a storage state, then re-run the crawl/screenshot/interaction scripts with `--storage-state .auth/<host>.storage-state.json`, once per role.

## Large sites
Prioritise by user value: sample representative pages per template (one product, one category, one article). Document sampling and the crawl-limit note emitted by `crawl.mjs`.

## Output checklist
Use [../checklists/discovery-completeness.md](../checklists/discovery-completeness.md). Fill discovery report, route inventory and functionality inventory.
