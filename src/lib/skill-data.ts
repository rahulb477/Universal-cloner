export const SKILL_VERSION = "1.0.0";
export const SKILL_LEVEL = "V12";

export const PHASES = [
  "startup",
  "discovery",
  "architecture",
  "implementation",
  "qa",
  "refinement",
  "final-report",
] as const;

export const STATUSES = ["pending", "in-progress", "done", "blocked"] as const;

export const CATEGORIES = [
  "SaaS",
  "e-commerce",
  "admin dashboard",
  "POS",
  "ERP",
  "CRM",
  "marketplace",
  "booking",
  "education",
  "blog / content",
  "landing page",
  "portfolio",
  "web app",
  "multi-role portal",
] as const;

export const LEVELS = [
  { v: "V1", title: "Core inspection & reconstruction", text: "Intake → discovery → build → report loop, 16 templates, workspace scaffolding." },
  { v: "V2", title: "Multi-route, screenshots, visual diff", text: "Robots/sitemap-aware crawler, 4-viewport screenshots, pixel diff reports." },
  { v: "V3", title: "Interaction discovery & states", text: "Forms, tabs, dialogs, menus probed safely; risky controls skipped." },
  { v: "V4", title: "Backend, API & database", text: "Independent API contracts and synthetic-data models from observed behaviour." },
  { v: "V5", title: "Authentication & roles", text: "Secret-safe login tester: negative tests, persistence, protected routes, logout." },
  { v: "V6", title: "Advanced UI/UX & motion", text: "Design tokens, transitions, keyframes, breakpoints measured from computed styles." },
  { v: "V7", title: "MCP & host compatibility", text: "Verified-not-assumed MCP protocol, catalog, 7 host integrations." },
  { v: "V8", title: "Automated QA", text: "Links, console, a11y (axe), performance, visual regression, pipeline." },
  { v: "V9", title: "Assets & components", text: "Image/font/icon inventory with licence-first handling." },
  { v: "V10", title: "Multi-agent orchestration", text: "15 roles, deliverable contracts, refinement loop, final review." },
  { v: "V11", title: "Compliance guardrails", text: "Secret scanner, log redaction, robots enforcement, provenance log." },
  { v: "V12", title: "Resumable state & hand-off", text: "JSON phase state so any agent or host can resume." },
];

export const AGENTS = [
  ["Orchestrator", "Controls phases, gates and the architecture proposal"],
  ["Discovery", "Routes, navigation, technology, auth-gated areas"],
  ["Browser", "Authorised interactions, screenshots, state capture"],
  ["UI/UX", "Design system and visual mismatch register"],
  ["Frontend", "Implements the interface"],
  ["Backend", "APIs and business logic"],
  ["Database", "Schema, seeds, persistence"],
  ["Authentication", "Login, sessions, roles — tested end to end"],
  ["Asset", "Images, fonts, icons, licence decisions"],
  ["Animation", "Transitions, motion, reduced-motion support"],
  ["QA", "Functional and regression testing"],
  ["Accessibility", "Keyboard access, axe, manual checklist"],
  ["Performance", "TTFB, LCP, CLS, weight, budgets"],
  ["Security Review", "Reviews the independent implementation"],
  ["Final Review", "Compares with the reference, honest report"],
] as const;

export const SCRIPTS = [
  ["check-env", "Verify Node, Playwright, Chromium, credential var names"],
  ["mcp-check", "List configured MCP servers (configured ≠ connected)"],
  ["init-project", "Scaffold workspace, reports and state"],
  ["state", "Resumable phase state and hand-off log"],
  ["crawl", "Robots/sitemap-aware route discovery"],
  ["screenshot", "Desktop/laptop/tablet/mobile captures"],
  ["visual-diff", "pixelmatch diff images and thresholds"],
  ["regression", "Baseline-vs-current visual regression"],
  ["extract-design-tokens", "Colours, type, spacing, breakpoints, keyframes"],
  ["extract-assets", "Asset inventory, opt-in download"],
  ["discover-interactions", "Forms, tabs, dialogs, safe state probes"],
  ["auth-test", "Login/logout/session tests, never bypasses CAPTCHA/MFA"],
  ["check-links", "Broken links, images, scripts, anchors"],
  ["console-errors", "Console, page errors, failed requests"],
  ["a11y-check", "Heuristics + axe-core + keyboard walk"],
  ["perf-audit", "Core Web Vitals-style lab metrics"],
  ["pipeline", "Runs the audit scripts in sequence"],
  ["scan-secrets", "Detect leaked credentials and sessions"],
  ["validate-repo", "Validate the skill repository"],
  ["package-zip", "Build the distributable ZIP + SHA-256"],
] as const;

export const STARTER_PROMPT_PATH = "universal-website-cloner/PROMPT-START-HERE.md";
