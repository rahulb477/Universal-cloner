# Visual Reconstruction Workflow

1. **Tokens first.** Turn `design-tokens.md` into CSS variables / Tailwind theme. Substitute unlicensed fonts (record in asset register).
2. **Primitives → layout → pages.** Build buttons, inputs, cards, tables, nav, sidebar, modals; then page shells; then pages.
3. **Responsive.** Implement the observed breakpoints (crawl/tokens list them) — verify at 390, 834, 1024, 1440 px.
4. **States.** Hover, focus-visible, active, disabled, loading (skeleton/spinner), empty, error, success.
5. **Motion.** Follow [../agents/10-animation.md](../agents/10-animation.md); respect reduced motion.
6. **Compare loop** (repeat per page):
   ```bash
   node scripts/screenshot.mjs --url <clone> --label clone --viewports desktop,mobile --freeze-animations
   node scripts/screenshot.mjs --url <ref>   --label reference --viewports desktop,mobile --freeze-animations
   node scripts/visual-diff.mjs --reference <ref>/reference --candidate <clone>/clone --out <out> --max-mismatch 5
   ```
   Open the `*.diff.png` files; log findings in the mismatch register; fix; re-run.
7. **Dynamic content.** Diff noise comes from dates, ads, carousels, random content. Freeze with seeded data, hide with a `--freeze-animations` style, or record as accepted differences.
8. **Claim discipline.** Write "worst mismatch X% on route/viewport" — not "pixel-perfect" — unless the report shows ≤ the agreed threshold everywhere *and* diff images were reviewed.

## Typical mismatch causes
Font substitution · line-height rounding · scrollbar width · image intrinsic sizes · sticky headers in full-page captures · lazy images not loaded (use auto-scroll) · different data length · animation mid-frame.

## Assets & components (V9)
Run [../agents/09-asset.md](../agents/09-asset.md) in parallel: inventory, licence decision, substitution, optimisation, component documentation.
