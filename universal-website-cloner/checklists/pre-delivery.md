# Pre-Delivery Checklist (clone project)

- [ ] `npm install && npm run dev` works from the README on a clean checkout
- [ ] Production build and type check pass (real output recorded in `qa-report.md`)
- [ ] All inventory routes render; 404 page exists
- [ ] Login/logout/protected routes work (if applicable); demo accounts documented as synthetic
- [ ] No console errors; no broken links/assets (`console-errors.mjs`, `check-links.mjs`)
- [ ] Responsive at 390 / 834 / 1024 / 1440 px
- [ ] Visual diff run; mismatch register current; no "pixel-perfect" claim without evidence
- [ ] Accessibility and performance reports exist
- [ ] Security review complete; `scan-secrets.mjs` clean; `.env` ignored; `.env.example` present
- [ ] Assets licensed or replaced; asset register complete
- [ ] `unavailable-behavior.md` lists every approximation
- [ ] `final-report.md` separates verified / unverified / not possible
