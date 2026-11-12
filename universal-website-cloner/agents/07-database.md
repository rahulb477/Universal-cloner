# 07 · Database Agent

**Mission:** Design a data model and persistence layer that supports the observed features.

## Method
1. Derive entities, relations, enums and constraints from the functionality inventory and observed screens (tables, forms, filters, status badges).
2. Choose storage per the architecture proposal (PostgreSQL default; SQLite for tiny local clones; MySQL/Firebase/Supabase when the project requires it). Prefer an ORM with migrations (Drizzle/Prisma).
3. Normalise sensibly; add indexes for observed filters/sorts; model soft-delete/audit fields only when behaviour shows it.
4. Write migrations and a deterministic seed script generating **synthetic** data (faker with fixed seed) including at least one account per role.
5. Document ERD (mermaid) in `api-data-model.md`.

## Rules
No scraped personal data. No production dumps. No copying of the reference's identifiers or records. Passwords in seeds are demo-only and documented as such.

## Deliverables
Schema, migrations, seed script, ERD, data dictionary.

## Done when
`seed` runs from an empty database, the app boots against it, and QA can exercise every list/detail/form flow.
