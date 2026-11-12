import fs from "node:fs";
import path from "node:path";
import { newId } from "./crypto";
import { loadAnalysis, loadModels, type Analysis, type PageModel } from "./discover";
import type { Plan } from "./plan";
import { analysisDir, siteDir, writeJson, type ProjectOptions } from "./store";

const TEMPLATE = path.join(process.cwd(), "studio-engine", "site-template");
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const attrs = (o: Record<string, string>) => Object.entries(o).filter(([k]) => /^[a-zA-Z_:][\w:.-]*$/.test(k)).map(([k, v]) => ` ${k}="${esc(v)}"`).join("");
const write = (file: string, content: string) => {
  fs.mkdirSync(/*turbopackIgnore: true*/ path.dirname(file), { recursive: true });
  fs.writeFileSync(/*turbopackIgnore: true*/ file, content);
};

export type Features = { backend: boolean; database: boolean; auth: boolean; animations: boolean; responsive: boolean };
export type GenerateResult = { files: number; pages: number; components: string[]; features: Features; external: string[]; previewAccount: { identifier: string; password: string } | null };

function rgbParts(c: string): [number, number, number] | null {
  const m = c.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
  return m ? [+m[1], +m[2], +m[3]] : null;
}
const saturation = (c: string) => {
  const p = rgbParts(c);
  return p ? Math.max(...p) - Math.min(...p) : 0;
};

function tokensCss(a: Analysis): string {
  const d = a.design as Record<string, unknown>;
  const list = (k: string) => ((d[k] as { value: string }[]) || []).map((x) => x.value);
  const body = (d.body as Record<string, string>) || {};
  const palette = [...new Set([...list("backgrounds"), ...list("colors")])];
  const accent = [...palette].sort((x, y) => saturation(y) - saturation(x))[0];
  const lines = [
    `  --uwc-text: ${body.color || list("colors")[0] || "#111"};`,
    `  --uwc-surface: ${body.background && body.background !== "rgba(0, 0, 0, 0)" ? body.background : "#fff"};`,
    `  --uwc-accent: ${accent && saturation(accent) > 40 ? accent : body.color || "#2456d6"};`,
    `  --uwc-font: ${body.fontFamily || "system-ui, sans-serif"};`,
    `  --uwc-radius: ${list("radii")[0]?.split(" ")[0] || "6px"};`,
    ...palette.slice(0, 10).map((c, i) => `  --uwc-color-${i + 1}: ${c};`),
  ];
  return `/* Design tokens measured on ${a.origin} (computed styles, weighted by usage).\n   The captured stylesheets do not depend on these; they theme the UI added by the runtime and document the palette. */\n:root {\n${lines.join("\n")}\n}\n`;
}

function fallback404(hasHeader: boolean, hasFooter: boolean): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Page not found</title>
<link rel="stylesheet" href="{{root}}styles/tokens.css">
<!-- @styles -->
</head>
<body>
${hasHeader ? "<!-- @include components/header.html -->" : ""}
<main style="max-width:720px;margin:12vh auto;padding:0 24px;font-family:var(--uwc-font);color:var(--uwc-text)">
  <p style="letter-spacing:.08em;text-transform:uppercase;font-size:.8rem;opacity:.7">Error 404</p>
  <h1>This page is not part of the site</h1>
  <p>The address you opened does not exist here. It may be a page of the original website that was not included when this copy was made.</p>
  <p><a href="{{root}}" style="color:var(--uwc-accent)">Go to the start page</a></p>
</main>
${hasFooter ? "<!-- @include components/footer.html -->" : ""}
</body>
</html>
`;
}

export function generateProject(projectId: string, project: { name: string; targetUrl: string; description: string }, options: ProjectOptions, plan: Plan): GenerateResult {
  const analysis = loadAnalysis(projectId);
  const models = loadModels(projectId);
  if (!analysis || !models.length) throw new Error("The analysis for this project is missing. Run the clone again from discovery.");
  const out = siteDir(projectId);
  const aDir = analysisDir(projectId);
  fs.rmSync(/*turbopackIgnore: true*/ out, { recursive: true, force: true });
  fs.cpSync(/*turbopackIgnore: true*/ TEMPLATE, out, { recursive: true });
  fs.renameSync(/*turbopackIgnore: true*/ path.join(out, "gitignore"), path.join(out, ".gitignore"));
  fs.cpSync(/*turbopackIgnore: true*/ path.join(aDir, "styles"), path.join(out, "src", "styles"), { recursive: true });
  fs.mkdirSync(/*turbopackIgnore: true*/ path.join(out, "public", "assets"), { recursive: true });
  fs.cpSync(/*turbopackIgnore: true*/ path.join(aDir, "assets"), path.join(out, "public", "assets"), { recursive: true });
  write(path.join(out, "src", "styles", "tokens.css"), tokensCss(analysis));

  const hasLoginForm = analysis.forms.some((f) => f.kind === "login" || f.kind === "register");
  const features: Features = {
    backend: options.backend, database: options.backend && options.database,
    auth: options.backend && options.authentication && hasLoginForm,
    animations: options.animations, responsive: options.responsive,
  };

  /* ---- shared components: the most common variant becomes the component, rarer ones get a suffix ---- */
  const componentFiles: string[] = [];
  const variantName = new Map<string, string>();
  const compKey = (kind: string, html: string) => `${kind}\n${html.replace(/ data-uwc-active-(class|on)="[^"]*"/g, "")}`;
  for (const kind of ["header", "footer"]) {
    // Variants that differ only in the recorded "current page" marker are the same component.
    const groups = new Map<string, { html: string; n: number }>();
    for (const m of models) {
      const html = m.components[kind];
      if (!html) continue;
      const cur = groups.get(compKey(kind, html));
      if (cur) { cur.n++; if (html.length > cur.html.length) cur.html = html; }
      else groups.set(compKey(kind, html), { html, n: 1 });
    }
    [...groups.entries()].sort((x, y) => y[1].n - x[1].n).forEach(([key, { html, n }], i) => {
      const name = i === 0 ? kind : `${kind}-${i + 1}`;
      variantName.set(key, name);
      componentFiles.push(`${name}.html`);
      write(path.join(out, "src", "components", `${name}.html`), `<!-- Shared ${kind}${i ? ` (variant ${i + 1})` : ""}: used on ${n} page(s). {{root}} is replaced with the relative path to the site root at build time. -->\n${html}\n`);
    });
  }

  /* ---- pages ---- */
  const pages = models.filter((m) => !m.isErrorPage).sort((x, y) => (x.route === analysis.startRoute ? -1 : y.route === analysis.startRoute ? 1 : x.route.localeCompare(y.route)));
  const errModel = models.find((m) => m.isErrorPage);
  const pageSource = (m: PageModel) => {
    const body = m.body.replace(/<!--@component:(\w+)-->/g, (_, kind) => {
      const name = m.components[kind] ? variantName.get(compKey(kind, m.components[kind])) : undefined;
      return name ? `<!-- @include components/${name}.html -->` : "";
    });
    return `<!doctype html>
<html${attrs(m.htmlAttrs)}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="${esc(m.viewport || "width=device-width, initial-scale=1")}">
<title>${esc(m.title)}</title>
${m.description ? `<meta name="description" content="${esc(m.description)}">\n` : ""}<link rel="stylesheet" href="{{root}}styles/tokens.css">
${m.headParts.join("\n")}
</head>
<body${attrs(m.bodyAttrs)}>
${body}
</body>
</html>
`;
  };
  for (const m of pages) write(path.join(out, "src", "pages", m.file), pageSource(m));
  const firstStyles = (pages[0]?.headParts || []).filter((h) => /rel="stylesheet"/.test(h)).join("\n");
  const errFile = pages.some((p) => p.file === "404.html") ? "_not-found.html" : "404.html";
  write(path.join(out, "src", "pages", errFile), errModel ? pageSource({ ...errModel, file: errFile }) : fallback404(componentFiles.includes("header.html"), componentFiles.includes("footer.html")).replace("<!-- @styles -->", firstStyles));

  const loginPage = pages.find((p) => p.route === analysis.login.loginRoute) ?? pages.find((p) => p.forms.some((f) => f.kind === "login"));
  const protectedRoutes = features.auth ? pages.filter((p) => p.protected && p.route !== loginPage?.route) : [];
  const site = {
    name: project.name, sourceUrl: analysis.targetUrl, generatedAt: new Date().toISOString(), generator: "Universal Website Cloner Studio",
    startRoute: analysis.startRoute, loginRoute: features.auth ? (loginPage?.route ?? null) : null,
    afterLoginRoute: protectedRoutes[0]?.route ?? analysis.startRoute, features,
    routes: [
      ...pages.map((p) => ({ route: p.route, file: p.file, title: p.title, protected: protectedRoutes.includes(p) })),
      { route: "/__not-found__", file: errFile, title: errModel?.title || "Page not found", protected: false, errorPage: true },
    ],
  };
  writeJson(path.join(out, "src", "data", "site.json"), site);
  writeJson(path.join(out, "src", "data", "forms.json"), Object.fromEntries(analysis.forms.map((f) => [f.id, { id: f.id, kind: f.kind, originalMethod: f.method, originalAction: f.actionPath, submitLabel: f.submitLabel, usedOn: f.routes, fields: f.fields.filter((x) => !x.hidden || x.name) }])));
  writeJson(path.join(out, "src", "data", "interactions.json"), Object.fromEntries(pages.filter((p) => p.interactions.length).map((p) => [p.route, p.interactions])));

  /* ---- manifest, environment, docs ---- */
  const slug = project.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50) || "cloned-site";
  writeJson(path.join(out, "package.json"), {
    name: slug, version: "1.0.0", private: true, type: "module",
    description: `Independent reconstruction of ${analysis.origin}`,
    engines: { node: ">=22.5" },
    scripts: { build: "node scripts/build.mjs", start: "node server/index.mjs", dev: "node scripts/build.mjs && node server/index.mjs", test: "node tests/smoke.test.mjs" },
    dependencies: {},
  });
  write(path.join(out, ".env.example"), `# Copy to .env and adjust. Never commit .env.
PORT=3000
HOST=0.0.0.0

# SQLite database file (created on first start). Use :memory: for a throw-away database.
DATABASE_FILE=data/site.sqlite

# How long a sign-in lasts, in hours.
SESSION_HOURS=168

# "server": protected pages redirect to the login page unless a session cookie is present (recommended).
# "client": the browser runtime performs the check (needed only when the site is embedded in a cross-site iframe).
PROTECT_PAGES=server

# Set to false to stop new visitors from creating accounts.
ALLOW_REGISTRATION=true

# Optional account created on start-up. Leave empty in production.
DEMO_USER_EMAIL=
DEMO_USER_PASSWORD=

# Required to read stored form submissions: GET /api/forms/<id>/submissions with header x-admin-token.
ADMIN_TOKEN=
`);

  const external: string[] = [];
  if (features.auth) external.push("Accounts start empty: register through the cloned sign-up/login form or set DEMO_USER_EMAIL and DEMO_USER_PASSWORD. Accounts from the original website are not copied.");
  if (analysis.forms.some((f) => !["login", "register", "search"].includes(f.kind)) && features.backend) external.push("Form submissions are stored in the local database only. Connect e-mail/CRM delivery yourself and set ADMIN_TOKEN to read submissions.");
  if (analysis.capture.iframesKept.length) external.push(`${analysis.capture.iframesKept.length} third-party embed(s) still load from their original hosts and need network access.`);
  if (analysis.assets.failed.length) external.push(`${analysis.assets.failed.length} asset(s) could not be downloaded and still point at their original URLs (see docs/LIMITATIONS.md).`);
  if (analysis.api.filter((x) => x.sameOrigin).length) external.push(`${analysis.api.filter((x) => x.sameOrigin).length} API call(s) of the original site were observed; their server logic is not reproduced (see docs/FUNCTIONALITY.md).`);
  if (!features.backend) external.push("Generated without backend services: forms are not submitted and search runs in the browser.");

  const table = (head: string[], rows: string[][]) => `| ${head.join(" | ")} |\n| ${head.map(() => "---").join(" | ")} |\n${rows.map((r) => `| ${r.map((c) => String(c).replace(/\|/g, "\\|").replace(/\n/g, " ")).join(" | ")} |`).join("\n")}\n`;
  const docs = path.join(out, "docs");
  write(path.join(docs, "ARCHITECTURE.md"), `# Architecture

Plan source: **${plan.source === "ai" ? `AI provider — ${plan.provider?.label} (${plan.provider?.model})` : "built-in heuristics (no AI provider was used)"}**

${plan.summary}

- **Site category:** ${plan.siteCategory}
- **Recommended front-end framework:** ${plan.frontend.framework}
  - ${plan.frontend.rationale}
- **Backend needed:** ${plan.backend.needed ? "yes" : "no"}${plan.backend.services.length ? ` — ${plan.backend.services.join(", ")}` : ""}
- **Database needed:** ${plan.database.needed ? "yes" : "no"}${plan.database.entities.length ? ` — ${plan.database.entities.join(", ")}` : ""}
- **Authentication:** ${plan.auth.needed ? "yes" : "no"} — ${plan.auth.strategy}
- **Assets:** ${plan.assets.strategy}

## What this export implements

The reconstruction engine always emits the same dependable target, whatever framework the plan recommends:
framework-free multi-page HTML composed at build time from \`src/pages\` and \`src/components\`, the captured stylesheets,
a small browser runtime (\`src/scripts/site.js\`) and a dependency-free Node.js server (\`server/index.mjs\`).
Treat the framework recommendation above as the suggested path if you later port the project.

| Feature | In this export |
| --- | --- |
| Backend services (search, forms API) | ${features.backend ? "enabled" : "disabled"} |
| Database (SQLite via node:sqlite) | ${features.database ? "enabled" : "disabled — in-memory storage"} |
| Authentication | ${features.auth ? "enabled" : hasLoginForm ? "disabled by project options" : "not generated — no login form found"} |
| Animations and transitions | ${features.animations ? "kept from the captured CSS" : "disabled"} |
| Responsive layout | ${features.responsive ? "kept from the captured CSS" : "fixed desktop viewport"} |

## Components
${plan.components.length ? plan.components.map((c) => `- **${c.name}** — ${c.purpose}`).join("\n") : "- None identified."}

Extracted shared component files: ${componentFiles.length ? componentFiles.map((c) => `\`src/components/${c}\``).join(", ") : "none"}.

## Pages
${table(["Route", "Purpose"], (plan.pages.length ? plan.pages : pages.map((p) => ({ route: p.route, purpose: p.title }))).map((p) => [p.route, p.purpose]))}
## Testing strategy
${plan.testing.strategy.map((s) => `- ${s}`).join("\n") || "- See docs/TESTING.md"}
${plan.risks.length ? `\n## Risks noted by the planner\n${plan.risks.map((r) => `- ${r}`).join("\n")}\n` : ""}`);

  write(path.join(docs, "ROUTES.md"), `# Routes

Reference: ${analysis.targetUrl} — analysed ${analysis.analysedAt}

## Cloned
${table(["Route", "Source file", "Title", "Protected"], pages.map((p) => [p.route, `src/pages/${p.file}`, p.title, protectedRoutes.includes(p) ? "yes" : "no"]))}
## Discovered but not cloned
${analysis.routes.filter((r) => r.state === "skipped").length ? table(["Route", "Reason"], analysis.routes.filter((r) => r.state === "skipped").map((r) => [r.route, r.reason || ""])) : "None.\n"}
Links to routes that were not cloned resolve to the not-found page (\`src/pages/${errFile}\`).
`);

  const replayable = analysis.interactions.filter((i) => i.replayable);
  const notReplayable = analysis.interactions.filter((i) => !i.replayable);
  write(path.join(docs, "FUNCTIONALITY.md"), `# Functionality inventory

## Forms
${analysis.forms.length ? table(["Form id", "Kind", "Fields", "Used on", "Behaviour in this project"], analysis.forms.map((f) => [f.id, f.kind, f.fields.filter((x) => !x.hidden).map((x) => `${x.name || "(unnamed)"}:${x.type}${x.required ? "*" : ""}`).join(", "), f.routes.join(", "),
    !features.backend ? "shows a notice (no backend)" : f.kind === "search" ? "GET /api/search, results shown under the form" : (f.kind === "login" || f.kind === "register") && features.auth ? `POST /api/auth/${f.kind}` : `POST /api/forms/${f.id} (validated, stored)`])) : "No forms were found.\n"}
The original site's form handlers were never called during analysis, so success and error messages are this project's own wording.

## Recorded interactions (replayed by src/scripts/site.js)
${replayable.length ? table(["Route", "Control", "Type", "Viewport"], replayable.map((i) => [i.route, i.label, i.kind, i.viewport])) : "None recorded.\n"}
Each control was clicked once in the reference site with all write requests blocked; the attribute changes it caused are stored in \`src/data/interactions.json\`.

## Observed but not reproduced
${notReplayable.length ? table(["Route", "Control", "Why"], notReplayable.map((i) => [i.route, i.label, i.note || ""])) : "Nothing in this category.\n"}
## API calls made by the original site
${analysis.api.length ? table(["Method", "URL", "Status", "Type", "Seen on"], analysis.api.slice(0, 80).map((x) => [x.method, x.url, String(x.status), x.type, x.route])) : "No XHR/fetch calls were observed.\n"}
These endpoints belong to the original service. Their server-side logic cannot be observed from a browser and is not reproduced.
`);

  const d = analysis.design as Record<string, unknown>;
  const dl = (k: string) => ((d[k] as { value: string; weight: number }[]) || []).map((x) => `- \`${x.value}\``).join("\n") || "- none";
  write(path.join(docs, "DESIGN-TOKENS.md"), `# Design tokens

Measured from computed styles on ${pages.length} page(s). The same values are available as CSS variables in \`src/styles/tokens.css\`.

## Text colours\n${dl("colors")}\n\n## Surface colours\n${dl("backgrounds")}\n\n## Font families\n${dl("fonts")}\n\n## Font sizes\n${dl("fontSizes")}\n\n## Corner radii\n${dl("radii")}\n\n## Shadows\n${dl("shadows")}

## Body text
\`\`\`json
${JSON.stringify(d.body ?? {}, null, 2)}
\`\`\`

## CSS custom properties declared on :root
${Object.keys((d.cssVariables as object) || {}).length ? "```css\n:root {\n" + Object.entries(d.cssVariables as Record<string, string>).map(([k, v]) => `  ${k}: ${v};`).join("\n") + "\n}\n```" : "None declared."}

## Repeating structures
${((d.repeatingComponents as { signature: string; count: number }[]) || []).map((r) => `- \`${r.signature}\` × ${r.count}`).join("\n") || "- none detected"}
`);

  write(path.join(docs, "LIMITATIONS.md"), `# Limitations and items needing attention

This project was produced from what a browser can observe. Be aware of the following:

- **Original JavaScript is not included.** ${analysis.capture.scriptsRemoved} script tag(s) were removed. Behaviour is re-created by \`src/scripts/site.js\` for forms, search, sign-in and the recorded toggles, tabs and dialogs only. Carousels, client-side filtering, infinite scroll and similar script-driven features are not reproduced.
- **Server-side logic and data are not copied.** Accounts, orders, search ranking, e-mail delivery and any private data stay on the original service.
- **Dynamic content is a snapshot** of what was rendered on ${analysis.analysedAt.slice(0, 10)}.
${analysis.capture.canvasesConverted ? `- ${analysis.capture.canvasesConverted} canvas element(s) were converted to static images.\n` : ""}${analysis.capture.canvasesLost ? `- ${analysis.capture.canvasesLost} canvas element(s) could not be read and are empty.\n` : ""}${analysis.capture.shadowRoots ? `- ${analysis.capture.shadowRoots} element(s) use shadow DOM; their internal markup is not captured.\n` : ""}${analysis.capture.iframesRemoved ? `- ${analysis.capture.iframesRemoved} same-origin frame/object element(s) were removed.\n` : ""}${analysis.capture.iframesKept.length ? `- Third-party embeds kept as remote iframes:\n${analysis.capture.iframesKept.map((u) => `  - ${u}`).join("\n")}\n` : ""}${analysis.blockedRequests ? `- ${analysis.blockedRequests} request(s) to private or internal addresses were blocked during analysis.\n` : ""}${analysis.notes.map((n) => `- ${n}\n`).join("")}
## Assets that could not be downloaded
${analysis.assets.failed.length ? table(["URL", "Reason"], analysis.assets.failed.map((f) => [f.url, f.reason])) : "All referenced assets were saved locally.\n"}
## Console errors seen on the original site
${analysis.consoleErrors.length ? analysis.consoleErrors.slice(0, 30).map((c) => `- \`${c.route}\`: ${c.message.replace(/\n/g, " ")}`).join("\n") : "None."}

## Legal
Only reproduce websites you own or are authorised to copy. Logos, text, images and fonts in \`public/assets\` remain the property of their owners; check font and image licences before publishing.
`);

  write(path.join(docs, "TESTING.md"), `# Testing

\`\`\`bash
npm run build
npm test
\`\`\`

\`tests/smoke.test.mjs\` starts the real server on a random port with a temporary database and checks:

1. \`/api/health\` responds and reports every route.
2. Every route returns an HTML document with no unresolved placeholders.
3. Every local stylesheet, script and image referenced by each page exists.
4. Unknown URLs return 404 and trailing slashes redirect.
${features.backend ? "5. Search returns results; form submissions are validated and stored.\n" : ""}${features.auth ? "6. Accounts: register, duplicate rejection, wrong password, sign in, session check, sign out.\n" : ""}
The build itself (\`npm run build\`) fails on missing page sources or components and prints a warning for every link that does not resolve.

Manual checks worth doing after changes: open each route at desktop and mobile widths, try every form, and use the recorded controls listed in docs/FUNCTIONALITY.md.
`);

  write(path.join(docs, "CONFIGURATION.md"), `# Configuration

## Environment variables (.env)
${table(["Variable", "Default", "Purpose"], [
    ["PORT", "3000", "HTTP port"], ["HOST", "0.0.0.0", "Bind address"], ["DATABASE_FILE", "data/site.sqlite", "SQLite file; `:memory:` for a temporary database"],
    ["SESSION_HOURS", "168", "Sign-in lifetime"], ["PROTECT_PAGES", "server", "`server` redirects unauthenticated requests for protected pages; `client` leaves the check to the browser runtime"],
    ["ALLOW_REGISTRATION", "true", "Allow visitors to create accounts"], ["DEMO_USER_EMAIL / DEMO_USER_PASSWORD", "empty", "Optional account created at start-up"], ["ADMIN_TOKEN", "empty", "Enables reading stored form submissions"],
  ])}
## Build-time switches (src/data/site.json → features)
${table(["Key", "Current", "Effect"], [
    ["backend", String(features.backend), "API for search and forms"], ["database", String(features.database), "Persist to SQLite instead of memory"], ["auth", String(features.auth), "Account API, login form wiring, protected pages"],
    ["animations", String(features.animations), "false injects a rule that disables CSS animations and transitions"], ["responsive", String(features.responsive), "false pins the viewport to 1280px"],
  ])}
Change a value, then run \`npm run build\` again.

## Editing content
- Pages: \`src/pages/*.html\` — shared parts are pulled in with \`<!-- @include components/NAME.html -->\`.
- Use \`{{root}}\` wherever a path to the site root is needed (links, assets). It is replaced per page at build time, so the site works at any URL prefix.
- Routes are declared in \`src/data/site.json\`.

## Deploying
Any host that runs Node.js 22.5+: \`npm run build && npm start\`. Put a reverse proxy with HTTPS in front, keep \`data/\` on a persistent volume and leave \`PROTECT_PAGES=server\`.
`);

  write(path.join(out, "README.md"), `# ${project.name}

Independent reconstruction of **${analysis.targetUrl}**, generated by Universal Website Cloner Studio on ${new Date().toISOString().slice(0, 10)}.
${project.description ? `\n${project.description}\n` : ""}
${pages.length} page(s) · ${componentFiles.length} shared component(s) · ${analysis.assets.downloaded} local asset(s) · ${analysis.forms.length} form(s) · ${replayable.length} recorded interaction(s)

## Requirements
- Node.js **22.5 or newer** (uses the built-in \`node:sqlite\`). No other software and no npm packages are needed.

## Install and run
\`\`\`bash
npm install          # nothing to download; creates the lockfile
cp .env.example .env # optional
npm run build        # composes src/ into dist/
npm start            # http://localhost:3000
\`\`\`
\`npm run dev\` builds and starts in one step. \`npm test\` runs the smoke tests (see docs/TESTING.md).

## Project layout
\`\`\`
src/pages/        one HTML source per route
src/components/   shared header/footer, included at build time
src/styles/       captured stylesheets, design tokens, runtime styles
src/scripts/      site.js — browser runtime (forms, search, sign-in, recorded interactions)
src/data/         site.json (routes + feature switches), forms.json, interactions.json
public/assets/    images, fonts and other downloaded files
scripts/build.mjs build step
server/           index.mjs (HTTP server + API), db.mjs (storage)
db/               schema.sql and migrations/
tests/            smoke tests
docs/             architecture, routes, functionality, design tokens, configuration, limitations
\`\`\`

## API
| Endpoint | Purpose |
| --- | --- |
| \`GET /api/health\` | status, route count, enabled features |
${features.backend ? "| `GET /api/search?q=` | full-text search over the public pages |\n| `POST /api/forms/:id` | validate and store a form submission |\n| `GET /api/forms/:id/submissions` | read submissions (needs `ADMIN_TOKEN`) |\n" : ""}${features.auth ? "| `POST /api/auth/register`, `/login`, `/logout`, `GET /api/auth/me` | accounts and sessions |\n" : ""}
## Needs your attention
${external.length ? external.map((e) => `- ${e}`).join("\n") : "- Nothing requires external configuration."}

Read **docs/LIMITATIONS.md** before publishing. Only deploy this if you are authorised to reproduce the original website's content and assets.
`);

  let files = 0;
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(/*turbopackIgnore: true*/ dir, { withFileTypes: true })) e.isDirectory() ? walk(path.join(dir, e.name)) : files++;
  };
  walk(out);
  return {
    files, pages: pages.length, components: componentFiles, features, external,
    previewAccount: features.auth ? { identifier: "preview@clone.test", password: `preview-${newId(5)}` } : null,
  };
}
