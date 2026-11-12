import type { Analysis, PageModel } from "./discover";
import { chat } from "./providers";
import type { ProjectOptions } from "./store";

export type Plan = {
  source: "ai" | "heuristic";
  provider?: { label: string; model: string };
  summary: string;
  siteCategory: string;
  frontend: { framework: string; rationale: string };
  components: { name: string; purpose: string }[];
  backend: { needed: boolean; services: string[] };
  database: { needed: boolean; entities: string[] };
  auth: { needed: boolean; strategy: string };
  assets: { strategy: string };
  pages: { route: string; purpose: string }[];
  testing: { strategy: string[] };
  risks: string[];
};

/** Compact, structured description of the reference site. This is the only thing sent to the AI provider. */
export function buildBrief(a: Analysis, models: PageModel[], options: ProjectOptions) {
  const design = a.design as Record<string, { value: string }[] | unknown>;
  const vals = (k: string, n: number) => ((design[k] as { value: string }[]) || []).slice(0, n).map((x) => x.value);
  return {
    target: a.origin,
    requested: { backend: options.backend, database: options.database, authentication: options.authentication, animations: options.animations, responsive: options.responsive, devices: options.devices },
    pages: models.filter((m) => !m.isErrorPage).slice(0, 40).map((m) => ({
      route: m.route, title: m.title.slice(0, 100), headings: m.headings.slice(0, 6).map((h) => h.text), forms: m.forms.map((f) => `${f.kind}(${f.fields.filter((x) => !x.hidden).map((x) => x.name || x.type).join(",")})`),
      interactions: m.interactions.filter((i) => i.changes.length).map((i) => `${i.kind}:${i.label}`).slice(0, 8), protected: m.protected, textLength: m.text.length,
      sharedComponents: Object.keys(m.components),
    })),
    routesNotCloned: a.routes.filter((r) => r.state === "skipped").slice(0, 30).map((r) => `${r.route} (${r.reason})`),
    design: { textColours: vals("colors", 5), surfaceColours: vals("backgrounds", 5), fonts: vals("fonts", 3), landmarks: design.landmarks, repeatingComponents: design.repeatingComponents },
    observedApiCalls: a.api.slice(0, 25).map((x) => `${x.method} ${x.url.replace(a.origin, "")} -> ${x.status} ${x.type}`),
    login: a.login,
    capture: a.capture,
  };
}

export function heuristicPlan(a: Analysis, models: PageModel[], options: ProjectOptions): Plan {
  const forms = a.forms;
  const hasAuth = forms.some((f) => f.kind === "login" || f.kind === "register");
  const dataForms = forms.filter((f) => !["login", "register", "search"].includes(f.kind));
  const apiHeavy = a.api.filter((x) => x.sameOrigin).length >= 5;
  const pages = models.filter((m) => !m.isErrorPage);
  const category = hasAuth && apiHeavy ? "web application" : hasAuth ? "site with member area" : pages.length <= 2 ? "landing page" : dataForms.length ? "marketing site with forms" : "content site";
  const comps = new Set<string>();
  for (const m of pages) for (const k of Object.keys(m.components)) comps.add(k);
  return {
    source: "heuristic",
    summary: `${pages.length} page(s) captured from ${a.origin}. Classified as a ${category} from the forms, API calls and routes that were observed.`,
    siteCategory: category,
    frontend: {
      framework: apiHeavy ? "Next.js (React) for a production rewrite; this export is framework-free multi-page HTML" : "Framework-free multi-page HTML with a small runtime (this export); Astro or Next.js if it grows",
      rationale: apiHeavy ? `${a.api.filter((x) => x.sameOrigin).length} same-origin API calls were observed, which suggests client-rendered data views.` : "Pages are mostly static content, so server-rendered HTML with progressive enhancement reproduces them faithfully.",
    },
    components: [...comps].map((c) => ({ name: c, purpose: `Shared site ${c}, included on every page that uses it` })),
    backend: { needed: dataForms.length > 0 || hasAuth || forms.some((f) => f.kind === "search"), services: [...(dataForms.length ? ["form submission API"] : []), ...(forms.some((f) => f.kind === "search") ? ["search API"] : []), ...(hasAuth ? ["authentication API"] : []), "health check"] },
    database: { needed: dataForms.length > 0 || hasAuth, entities: [...(dataForms.length ? ["submissions"] : []), ...(hasAuth ? ["users", "sessions"] : [])] },
    auth: { needed: hasAuth, strategy: hasAuth ? "Password accounts hashed with scrypt; opaque session tokens stored hashed with an expiry" : "No login form was found on the captured pages" },
    assets: { strategy: `Images, fonts and stylesheets are downloaded and served locally (${a.assets.downloaded} saved); cross-origin embeds stay remote.` },
    pages: pages.map((m) => ({ route: m.route, purpose: m.headings[0]?.text || m.title || "Page" })),
    testing: { strategy: ["HTTP smoke test of every route", "Local asset existence check", "API tests for search, forms and accounts", "Screenshot comparison against the reference at the desktop viewport"] },
    risks: [],
  };
}

const SYSTEM = `You are a senior web architect. You receive a structured analysis of a website that the user is authorised to reproduce.
Respond with ONE JSON object and nothing else (no prose, no code fences) using exactly these keys:
{"summary": string, "siteCategory": string, "frontend": {"framework": string, "rationale": string}, "components": [{"name": string, "purpose": string}],
"backend": {"needed": boolean, "services": [string]}, "database": {"needed": boolean, "entities": [string]}, "auth": {"needed": boolean, "strategy": string},
"assets": {"strategy": string}, "pages": [{"route": string, "purpose": string}], "testing": {"strategy": [string]}, "risks": [string]}
Base every statement on the analysis. Do not invent routes or features that are not in it. Keep each string under 240 characters.`;

function parsePlan(text: string): Omit<Plan, "source"> {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("The AI response did not contain a JSON object.");
  const j = JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  const str = (v: unknown, d = "") => (typeof v === "string" ? v.slice(0, 600) : d);
  const arr = (v: unknown) => (Array.isArray(v) ? v : []);
  const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
  if (!j.frontend || !j.summary) throw new Error("The AI response is missing required keys (summary, frontend).");
  return {
    summary: str(j.summary), siteCategory: str(j.siteCategory, "website"),
    frontend: { framework: str(obj(j.frontend).framework), rationale: str(obj(j.frontend).rationale) },
    components: arr(j.components).slice(0, 30).map((c) => ({ name: str(obj(c).name), purpose: str(obj(c).purpose) })).filter((c) => c.name),
    backend: { needed: obj(j.backend).needed === true, services: arr(obj(j.backend).services).map((s) => str(s)).filter(Boolean).slice(0, 20) },
    database: { needed: obj(j.database).needed === true, entities: arr(obj(j.database).entities).map((s) => str(s)).filter(Boolean).slice(0, 20) },
    auth: { needed: obj(j.auth).needed === true, strategy: str(obj(j.auth).strategy) },
    assets: { strategy: str(obj(j.assets).strategy) },
    pages: arr(j.pages).slice(0, 60).map((p) => ({ route: str(obj(p).route), purpose: str(obj(p).purpose) })).filter((p) => p.route),
    testing: { strategy: arr(obj(j.testing).strategy).map((s) => str(s)).filter(Boolean).slice(0, 12) },
    risks: arr(j.risks).map((s) => str(s)).filter(Boolean).slice(0, 12),
  };
}

export async function aiPlan(provider: { id: string; label: string; model: string }, brief: unknown, log: (m: string, l?: "info" | "warn") => void): Promise<Plan> {
  const user = `Website analysis (JSON):\n${JSON.stringify(brief)}`;
  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const r = await chat(provider.id, { system: SYSTEM, user: attempt === 1 ? user : `${user}\n\nYour previous reply could not be parsed (${lastErr?.message}). Reply with the JSON object only.` });
    log(`AI response received from ${provider.label} (${provider.model}): ${r.inputTokens} input / ${r.outputTokens} output tokens`);
    try {
      return { source: "ai", provider: { label: provider.label, model: provider.model }, ...parsePlan(r.text) };
    } catch (e) {
      lastErr = e as Error;
      log(`Could not parse the AI response (attempt ${attempt}): ${lastErr.message}`, "warn");
    }
  }
  throw new Error(`The AI provider did not return a usable architecture plan: ${lastErr?.message}`);
}

const EDIT_SYSTEM = `You edit one source file of a small Node.js website project. Apply the user's instruction to the file.
Return ONLY the complete new file content: no explanations and no markdown code fences. Preserve everything the instruction does not ask to change.`;

/** AI-assisted edit of a single project file. Returns the proposed new content. */
export async function aiEditFile(providerId: string, file: string, content: string, instruction: string): Promise<string> {
  const r = await chat(providerId, { system: EDIT_SYSTEM, user: `File: ${file}\nInstruction: ${instruction}\n\n----- CURRENT CONTENT -----\n${content}`, maxTokens: Math.min(32000, Math.max(2000, Math.ceil(content.length / 2.5) + 1500)) });
  let out = r.text;
  const fence = out.match(/^\s*```[\w-]*\n([\s\S]*?)\n```\s*$/);
  if (fence) out = fence[1];
  if (!out.trim()) throw new Error("The AI provider returned an empty file.");
  return out;
}
