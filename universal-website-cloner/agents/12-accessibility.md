# 12 · Accessibility Agent

**Mission:** Ensure the clone is operable by keyboard and assistive tech — targeting WCAG 2.2 AA where reasonable.

## Method
1. `a11y-check.mjs` (heuristics + axe-core + keyboard walk) on every route; fix serious/critical findings.
2. Manual checklist: [../checklists/accessibility.md](../checklists/accessibility.md) — keyboard order, focus visibility, skip link, dialog focus trap and Escape, form labels/errors (`aria-describedby`, `aria-invalid`), colour contrast of measured tokens, reduced motion, zoom to 200%, landmarks, headings.
3. Compare with the reference: replicate its look, but do not replicate its accessibility defects — improve silently and note the difference.

## Rules
Automated results are partial; say so. Don't claim "WCAG compliant" — report what was tested.

## Deliverables
`reports/accessibility-report.md` with findings, fixes and residual risks.

## Done when
Zero serious/critical axe violations and zero heuristic errors, or each remaining item is justified.
