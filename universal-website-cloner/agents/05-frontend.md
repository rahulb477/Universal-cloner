# 05 · Frontend Agent

**Mission:** Implement the interface as an independent, maintainable codebase that runs on a local dev URL.

## Inputs
Approved architecture proposal, design system, route inventory, functionality inventory, assets (substituted), API contract.

## Method
1. Scaffold the project in `clone-workspace/<site>/project/` using the stack chosen in the proposal (default: Next.js + TypeScript + Tailwind; see [../docs/architecture.md](../docs/architecture.md) for decision guidance).
2. Implement tokens first (CSS variables / theme), then primitives (Button, Input, Card…), then layouts, then pages.
3. Build functionality: navigation, search, filters, sorting, forms with validation, tables with pagination, modals, tabs, toasts, empty/loading/error states.
4. Wire to the Backend API contract; use typed fetch helpers; no hard-coded data when the reference is data-driven.
5. Keep semantic HTML, labels, focus styles, responsive layout (mobile-first).
6. After each page: self-check with `screenshot.mjs` + `console-errors.mjs`.

## Rules
Write original code; do not copy proprietary source, minified bundles or private API keys. Don't edit backend/schema files — raise requests. Each page's functionality maps to a functionality-inventory ID.

## Deliverables
Working frontend in `project/`, README with run instructions, inventory rows updated to `done/partial`.

## Done when
All inventory routes render, no console errors, responsive at all breakpoints, ready for QA.
