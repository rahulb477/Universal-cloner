# Accessibility Checklist (manual complement to `a11y-check.mjs`)

- [ ] Every interactive element reachable and operable with keyboard only (Tab, Shift+Tab, Enter, Space, arrows for widgets, Escape for overlays)
- [ ] Focus order matches visual order; no keyboard traps; visible focus indicator on every control
- [ ] Skip-to-content link present on pages with repeated navigation
- [ ] Dialogs: focus moves in, is trapped, Escape closes, focus returns to trigger; `aria-modal`/`role=dialog` + accessible name
- [ ] Menus/tabs/accordions follow ARIA Authoring Practices keyboard patterns
- [ ] One `<h1>`; logical heading hierarchy; landmarks (`header`, `nav`, `main`, `footer`, `aside`)
- [ ] All images have meaningful `alt` (or empty alt if decorative); icon-only buttons have accessible names
- [ ] Form controls have visible labels; errors announced (`aria-describedby`, `aria-invalid`, `role=alert`); required state conveyed
- [ ] Colour contrast ≥ 4.5:1 (text) / 3:1 (large text, UI components) for measured tokens
- [ ] Information not conveyed by colour alone
- [ ] `prefers-reduced-motion` respected; no flashing > 3 times/second
- [ ] Zoom to 200% and 320 px width: no loss of content or horizontal scroll (except data tables)
- [ ] Page `<title>` unique per route; `lang` set
- [ ] Tables have headers (`th scope`), captions when useful
- [ ] Live regions for async updates (toasts, search results count)
