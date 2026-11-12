# Category Playbooks

Extra things to check after identifying the category. Always combine with the master workflow.

| Category | Extra discovery | Extra implementation | Extra tests |
|----------|-----------------|----------------------|-------------|
| SaaS / landing | pricing tables, plan toggles, signup flow, docs, changelog | marketing sections, pricing toggle, mock signup | CTA links, form validation |
| E-commerce | catalogue, filters/sort, PDP variants, cart, checkout steps, shipping/tax rules | product/variant/cart/order tables, mock payment | add→cart→checkout flow, stock edge cases |
| Admin dashboard | roles, tables (sort/filter/export), charts, settings, audit log | RBAC, CRUD, chart data from seeds | role matrix, pagination, empty states |
| POS | product grid, barcode/search, cart, discounts, receipts, shifts | sales/inventory/shift models, receipt view | sale flow, refunds, offline behaviour if seen |
| ERP / CRM | modules, record views, pipelines/kanban, reports, imports | entities + relations, kanban drag, filters | cross-module links, permissions |
| Marketplace | seller/buyer portals, listings, search facets, messaging, reviews | multi-role auth, listing CRUD, orders | role isolation tests |
| Booking | availability calendar, slots, pricing, confirmation | availability engine, booking model | double-booking, timezone tests |
| Education | course catalogue, lessons, progress, quizzes, certificates | progress tracking, quiz scoring | enrolment, progress persistence |
| Blog / content | taxonomy, pagination, RSS, search, comments | content model/MDX, tag pages | pagination, SEO tags |
| Portfolio | project pages, galleries, contact form | gallery + lightbox, mock mailer | image perf, a11y of galleries |
| Portals (customer/seller/rider/admin) | one pass **per role**, cross-role visibility | role guards, per-role nav/layout | access isolation, deep-link redirects |

## SEO & meta (all public sites)
Capture `<title>`, meta description, canonical, OpenGraph/Twitter tags, robots meta, structured data types (observed only) and replicate where appropriate.

## i18n / currency
If language/region/currency switchers exist, capture each variant's route pattern and text direction (RTL).
