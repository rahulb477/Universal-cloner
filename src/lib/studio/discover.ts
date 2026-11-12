import fs from "node:fs";
import path from "node:path";
import type { Browser, BrowserContext, Page, Response as PwResponse } from "playwright-core";
import { launchBrowser, type BrowserInfo } from "./browser";
import { sha1 } from "./crypto";
import { UserError } from "./jobs";
import { allowListed, assertPublicUrl, isPublicUrl } from "./ssrf";
import { analysisDir, readJson, writeJson, type ProjectAuth, type ProjectOptions, type StudioSettings } from "./store";

const ENGINE_DIR = path.join(process.cwd(), "studio-engine");
const inpage = (name: string) => fs.readFileSync(/*turbopackIgnore: true*/ path.join(ENGINE_DIR, "inpage", `${name}.js`), "utf8");

export const VIEWPORTS = { desktop: { width: 1440, height: 900 }, tablet: { width: 820, height: 1180 }, mobile: { width: 390, height: 844 } } as const;
export type Device = keyof typeof VIEWPORTS;

const NON_PAGE = /\.(pdf|zip|png|jpe?g|gif|svg|webp|avif|ico|css|js|mjs|json|xml|txt|mp4|webm|mp3|wav|woff2?|ttf|otf|eot|gz|tgz|dmg|exe|csv|docx?|xlsx?|pptx?|rss|atom)$/i;
const UNSAFE_ROUTE = /(^|\/)(log-?out|sign-?out|logoff|signoff|delete|remove|destroy|unsubscribe|deactivate)(\/|$|\.)/i;
const USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36 UniversalWebsiteClonerStudio/1.0";

export function normRoute(u: URL): string {
  let p = u.pathname.replace(/\/{2,}/g, "/");
  p = p.replace(/\/index\.html?$/i, "/");
  if (p.length > 1) p = p.replace(/\/+$/, "");
  return p || "/";
}
/** Route -> relative output file, e.g. "/" -> index.html, "/docs/intro" -> docs/intro.html */
export function routeFile(route: string): string {
  if (route === "/") return "index.html";
  const safe = route.slice(1).split("/").map((s) => {
    let d = s;
    try { d = decodeURIComponent(s); } catch { /* keep raw */ }
    return d.replace(/[^a-zA-Z0-9._-]/g, "_") || "_";
  }).join("/");
  return /\.html?$/i.test(safe) ? safe : `${safe}.html`;
}
export const routeSlug = (route: string) => routeFile(route).replace(/\.html?$/i, "").replace(/\//g, "__");

export type CrawlPage = {
  route: string; url: string; status: number; title: string; h1: string; depth: number; source: string;
  hasLoginForm: boolean; protected?: boolean; screenshots: Partial<Record<Device, string>>; reference?: string; isErrorPage?: boolean;
};
export type RouteRecord = { route: string; state: "cloned" | "skipped"; reason?: string; status?: number };
export type Recipe = {
  trigger: string; kind: "toggle" | "tab"; group: string | null; label: string; viewport: Device;
  changes: { id: string; attr: string; before: string | null; after: string | null; dialog?: boolean }[];
};
export type FormSpec = { id: string; kind: string; method: string; actionPath: string; submitLabel: string; fields: { name: string; type: string; required: boolean; label: string; hidden: boolean; options?: string[] }[] };
export type PageModel = {
  route: string; file: string; title: string; description: string; viewport: string;
  htmlAttrs: Record<string, string>; bodyAttrs: Record<string, string>;
  headParts: string[]; body: string; components: Record<string, string>;
  forms: FormSpec[]; interactions: Recipe[]; text: string; headings: { level: number; text: string }[]; buttons: string[];
  protected: boolean; isErrorPage: boolean;
};
export type Analysis = {
  targetUrl: string; origin: string; startRoute: string; analysedAt: string; browser: BrowserInfo;
  pages: CrawlPage[]; routes: RouteRecord[];
  login: { used: boolean; loginRoute: string | null; succeeded: boolean };
  design: Record<string, unknown>; designByRoute: Record<string, unknown>;
  forms: (FormSpec & { routes: string[] })[];
  interactions: { route: string; label: string; kind: string; viewport: string; replayable: boolean; note?: string }[];
  api: { method: string; url: string; status: number; type: string; route: string; sameOrigin: boolean }[];
  consoleErrors: { route: string; message: string }[];
  assets: { downloaded: number; bytes: number; failed: { url: string; reason: string }[] };
  capture: { scriptsRemoved: number; iframesKept: string[]; iframesRemoved: number; canvasesConverted: number; canvasesLost: number; shadowRoots: number };
  blockedRequests: number; errorPageCaptured: boolean; notes: string[];
};

type Snapshot = {
  url: string; title: string; description: string; viewport: string; htmlAttrs: Record<string, string>; bodyAttrs: Record<string, string>;
  headParts: string[]; bodyHtml: string; components: Record<string, string>;
  styles: { id: number; kind: string; href?: string; base: string; media: string; css: string | null; rules?: string | null; disabled?: boolean }[];
  tokens: { url: string; kind: "link" | "asset" }[]; forms: FormSpec[];
  report: Analysis["capture"] & { blobUrls: number }; text: string; headings: { level: number; text: string }[]; buttons: string[];
};

const EXT_BY_TYPE: Record<string, string> = {
  "image/png": ".png", "image/jpeg": ".jpg", "image/gif": ".gif", "image/webp": ".webp", "image/avif": ".avif", "image/svg+xml": ".svg",
  "image/x-icon": ".ico", "image/vnd.microsoft.icon": ".ico", "font/woff2": ".woff2", "font/woff": ".woff", "font/ttf": ".ttf", "font/otf": ".otf",
  "application/font-woff2": ".woff2", "application/font-woff": ".woff", "video/mp4": ".mp4", "video/webm": ".webm", "audio/mpeg": ".mp3",
  "text/css": ".css", "application/pdf": ".pdf",
};
const MAX_ASSET = 12 * 1024 * 1024;
const MAX_TOTAL = 250 * 1024 * 1024;
const escAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

export class Discovery {
  browser!: Browser;
  context!: BrowserContext;
  page!: Page;
  info!: BrowserInfo;
  origin: string;
  start: URL;
  dir: string;
  pages: CrawlPage[] = [];
  routes = new Map<string, RouteRecord>();
  api: Analysis["api"] = [];
  consoleErrors: Analysis["consoleErrors"] = [];
  blocked = 0;
  readOnly = false;
  currentRoute = "/";
  notes: string[] = [];
  login = { used: false, loginRoute: null as string | null, succeeded: false };
  designByRoute: Record<string, Record<string, unknown>> = {};
  errorPageCaptured = false;
  private netCache = new Map<string, { file: string; type: string }>();
  private pending = new Set<Promise<void>>();
  private assetNames = new Map<string, string | null>();
  private styleNames = new Map<string, string | null>();
  private assetBytes = 0;
  private assetFailed: { url: string; reason: string }[] = [];
  private disallow: string[] = [];

  constructor(
    private targetUrl: string, private options: ProjectOptions, private auth: ProjectAuth, private password: string | null,
    private settings: StudioSettings, projectId: string, private log: (m: string, l?: "info" | "warn" | "error") => void, private signal: AbortSignal,
  ) {
    this.start = new URL(targetUrl);
    this.origin = this.start.origin;
    this.dir = analysisDir(projectId);
  }

  private check() {
    if (this.signal.aborted) throw new Error("Cancelled by user");
  }

  async validate(): Promise<string> {
    await assertPublicUrl(this.targetUrl);
    return allowListed(this.start) ? `${this.start.host} is an explicitly allow-listed local test target` : `${this.start.host} resolves to a public address`;
  }

  async launch(): Promise<string> {
    fs.rmSync(/*turbopackIgnore: true*/ this.dir, { recursive: true, force: true });
    for (const d of ["cache", "screenshots", "model", "assets", "styles"]) fs.mkdirSync(/*turbopackIgnore: true*/ path.join(this.dir, d), { recursive: true });
    const { browser, info } = await launchBrowser();
    this.browser = browser;
    this.info = info;
    this.signal.addEventListener("abort", () => void browser.close().catch(() => {}), { once: true });
    this.context = await browser.newContext({ viewport: VIEWPORTS.desktop, userAgent: USER_AGENT, ignoreHTTPSErrors: false, serviceWorkers: "block", acceptDownloads: false });
    this.context.setDefaultTimeout(this.settings.navTimeoutMs);
    // Every request the browser makes is checked: no private/internal addresses, and no writes while probing.
    await this.context.route("**/*", async (route) => {
      const req = route.request();
      const url = req.url();
      if (/^(data|blob|about):/i.test(url)) return route.continue();
      if (!(await isPublicUrl(url))) {
        this.blocked++;
        return route.abort("blockedbyclient");
      }
      if (this.readOnly && !["GET", "HEAD", "OPTIONS"].includes(req.method())) return route.abort("blockedbyclient");
      return route.continue();
    });
    this.context.on("response", (res) => this.onResponse(res));
    this.context.on("console", (msg) => {
      if (msg.type() === "error" && this.consoleErrors.length < 100) this.consoleErrors.push({ route: this.currentRoute, message: msg.text().slice(0, 300) });
    });
    this.page = await this.context.newPage();
    this.page.on("dialog", (d) => void d.dismiss().catch(() => {}));
    let detail = `Chromium ${info.version} via ${info.source}`;
    if (this.auth.required) detail += ` · ${await this.signIn()}`;
    return detail;
  }

  private onResponse(res: PwResponse) {
    const req = res.request();
    const type = req.resourceType();
    const url = res.url();
    if (type === "xhr" || type === "fetch") {
      if (this.api.length < 300 && !this.api.some((a) => a.url === url.split("?")[0] && a.method === req.method())) {
        let same = false;
        try { same = new URL(url).origin === this.origin; } catch { /* ignore */ }
        this.api.push({ method: req.method(), url: url.split("?")[0].slice(0, 300), status: res.status(), type: (res.headers()["content-type"] || "").split(";")[0], route: this.currentRoute, sameOrigin: same });
      }
      return;
    }
    if (!["stylesheet", "image", "font", "media"].includes(type) || res.status() !== 200 || this.netCache.has(url) || !/^https?:/.test(url)) return;
    const p = (async () => {
      try {
        const len = Number(res.headers()["content-length"] || 0);
        if (len > MAX_ASSET) return;
        const body = await res.body();
        if (body.length > MAX_ASSET) return;
        const file = path.join(this.dir, "cache", sha1(url));
        fs.writeFileSync(/*turbopackIgnore: true*/ file, body);
        this.netCache.set(url, { file, type: (res.headers()["content-type"] || "").split(";")[0].trim().toLowerCase() });
      } catch {
        /* body unavailable (redirect, aborted) */
      }
    })();
    this.pending.add(p);
    void p.finally(() => this.pending.delete(p));
  }

  /** Sign in with the user-supplied test account. Never attempts to defeat CAPTCHA, MFA or lockouts. */
  private async signIn(): Promise<string> {
    if (!this.auth.username || !this.password) throw new UserError("Login is enabled but the test account username or password is missing.");
    this.login.used = true;
    const page = this.page;
    let loginUrl = this.auth.loginUrl ? new URL(this.auth.loginUrl, this.origin).href : this.targetUrl;
    if (new URL(loginUrl).origin !== this.origin) throw new UserError("The login page must be on the same origin as the target website.");
    await page.goto(loginUrl, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => {});
    if (!(await page.locator("input[type=password]").first().isVisible().catch(() => false))) {
      const link = page.locator("a", { hasText: /^\s*(log ?in|sign ?in|account)\s*$/i }).first();
      if (await link.isVisible().catch(() => false)) {
        await link.click();
        await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
        loginUrl = page.url();
      }
    }
    const pw = page.locator("input[type=password]").first();
    if (!(await pw.isVisible().catch(() => false))) throw new UserError("No login form with a password field was found. Provide the exact login page URL.");
    if (await page.locator('iframe[src*="captcha" i], .g-recaptcha, .h-captcha, [class*="turnstile" i]').first().isVisible().catch(() => false)) {
      throw new UserError("The login page is protected by a CAPTCHA. The studio does not bypass CAPTCHA; use a test environment without it.");
    }
    const form = page.locator("form").filter({ has: pw }).first();
    const scope = (await form.count()) ? form : page.locator("body");
    const user = scope.locator('input[type=email], input[autocomplete=username], input[name*="user" i], input[name*="email" i], input[name*="login" i], input[type=text]').first();
    await user.fill(this.auth.username);
    await pw.fill(this.password);
    await Promise.all([page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {}), pw.press("Enter")]);
    await page.waitForTimeout(800);
    const still = await page.locator("input[type=password]").first().isVisible().catch(() => false);
    if (still) throw new UserError("Sign-in did not succeed with the supplied test account (the password field is still shown). MFA and CAPTCHA are never bypassed.");
    this.login.loginRoute = normRoute(new URL(loginUrl));
    this.login.succeeded = true;
    this.log(`Signed in with the supplied test account; landed on ${normRoute(new URL(page.url()))}`);
    return "signed in with the test account";
  }

  private async goto(url: string, wait = true): Promise<PwResponse | null> {
    this.check();
    this.currentRoute = normRoute(new URL(url));
    let res: PwResponse | null = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        res = await this.page.goto(url, { waitUntil: "domcontentloaded" });
        break;
      } catch (e) {
        this.check();
        if (attempt === 2) throw e;
        this.log(`Navigation to ${url} failed (${(e as Error).message.split("\n")[0]}); retrying once`, "warn");
      }
    }
    if (wait) await this.settle();
    return res;
  }

  private async settle() {
    const page = this.page;
    await page.waitForLoadState("load", { timeout: 8000 }).catch(() => {});
    await page.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => {});
    // Scroll through the page once so lazy images load and scroll-reveal animations reach their final state.
    await page.evaluate(`(async () => {
      const h = Math.min(document.documentElement.scrollHeight, 20000), step = Math.max(400, innerHeight * 0.8);
      for (let y = 0; y < h; y += step) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); }
      scrollTo(0, 0);
      try { await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]); } catch {}
    })()`).catch(() => {});
    await page.waitForTimeout(250);
  }

  private async loadRobots() {
    if (!this.settings.respectRobots) return;
    try {
      const res = await this.context.request.get(`${this.origin}/robots.txt`, { timeout: 8000, maxRedirects: 0 });
      if (!res.ok()) return;
      let applies = false;
      for (const line of (await res.text()).split("\n")) {
        const [k, ...rest] = line.split(":");
        const v = rest.join(":").trim();
        if (/^user-agent$/i.test(k.trim())) applies = v === "*";
        else if (applies && /^disallow$/i.test(k.trim()) && v) this.disallow.push(v.replace(/\*.*$/, ""));
      }
    } catch {
      /* no robots.txt */
    }
  }
  private robotsBlocked = (route: string) => this.disallow.some((d) => d !== "" && route.startsWith(d));

  private async sitemapRoutes(): Promise<string[]> {
    try {
      const res = await this.context.request.get(`${this.origin}/sitemap.xml`, { timeout: 8000, maxRedirects: 0 });
      if (!res.ok()) return [];
      const out: string[] = [];
      for (const m of (await res.text()).matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
        try {
          const u = new URL(m[1].replace(/&amp;/g, "&"));
          if (u.origin === this.origin && !NON_PAGE.test(u.pathname)) out.push(normRoute(u));
        } catch { /* bad loc */ }
      }
      return out.slice(0, 500);
    } catch {
      return [];
    }
  }

  /** Breadth-first crawl of same-origin links, the sitemap and (when signed in) authenticated navigation. */
  async crawl(setDetail: (d: string) => void): Promise<string> {
    await this.loadRobots();
    const max = Math.min(this.options.maxPages || this.settings.maxPages, 60);
    const startRoute = normRoute(this.start);
    const queue: { route: string; depth: number; source: string }[] = [{ route: startRoute, depth: 0, source: "start URL" }];
    const queued = new Set([startRoute]);
    const note = (route: string, rec: Omit<RouteRecord, "route">) => { if (!this.routes.has(route) || rec.state === "cloned") this.routes.set(route, { route, ...rec }); };
    const selected = this.options.scope === "selected";
    if (selected) {
      for (const raw of this.options.selectedPaths) {
        try {
          const u = new URL(raw, this.origin);
          if (u.origin !== this.origin) continue;
          const r = normRoute(u);
          if (!queued.has(r)) { queued.add(r); queue.push({ route: r, depth: 1, source: "selected by user" }); }
        } catch { /* ignore bad path */ }
      }
    } else {
      for (const r of await this.sitemapRoutes()) if (!queued.has(r)) { queued.add(r); queue.push({ route: r, depth: 1, source: "sitemap.xml" }); }
    }
    if (this.login.succeeded) {
      const landed = normRoute(new URL(this.page.url()));
      if (!queued.has(landed) && !selected) { queued.add(landed); queue.splice(1, 0, { route: landed, depth: 1, source: "post-login landing page" }); }
    }
    while (queue.length) {
      this.check();
      const item = queue.shift()!;
      const { route } = item;
      if (this.pages.length >= max) { note(route, { state: "skipped", reason: `page limit (${max}) reached` }); continue; }
      if (route !== startRoute && this.robotsBlocked(route)) { note(route, { state: "skipped", reason: "disallowed by robots.txt" }); continue; }
      if (UNSAFE_ROUTE.test(route)) { note(route, { state: "skipped", reason: "looks like a sign-out or destructive action; never visited" }); continue; }
      setDetail(`${this.pages.length}/${max} pages · visiting ${route}`);
      let res: PwResponse | null;
      try {
        res = await this.goto(this.origin + route, false);
        await this.page.waitForLoadState("networkidle", { timeout: 3000 }).catch(() => {});
      } catch (e) {
        note(route, { state: "skipped", reason: `navigation failed: ${(e as Error).message.split("\n")[0].slice(0, 120)}` });
        if (route === startRoute) throw new UserError(`Could not open ${this.targetUrl}: ${(e as Error).message.split("\n")[0]}`);
        continue;
      }
      const status = res?.status() ?? 0;
      const finalUrl = new URL(this.page.url());
      const type = res?.headers()["content-type"] || "";
      if (finalUrl.origin !== this.origin) { note(route, { state: "skipped", reason: `redirects to another origin (${finalUrl.host})`, status }); continue; }
      const finalRoute = normRoute(finalUrl);
      if (status >= 400) {
        note(route, { state: "skipped", reason: `HTTP ${status}`, status });
        if (route === startRoute) throw new UserError(`The target URL responded with HTTP ${status}.`);
        continue;
      }
      if (type && !/html/i.test(type)) { note(route, { state: "skipped", reason: `not an HTML page (${type.split(";")[0]})`, status }); continue; }
      if (finalRoute !== route) {
        note(route, { state: "skipped", reason: `redirects to ${finalRoute}`, status });
        if (this.pages.some((p) => p.route === finalRoute)) continue;
        queued.add(finalRoute);
      }
      const data = (await this.page.evaluate(inpage("links"))) as { title: string; h1: string; hasLoginForm: boolean; links: { href: string; text: string; area: string }[] };
      this.pages.push({ route: finalRoute, url: this.origin + finalRoute, status, title: data.title, h1: data.h1, depth: item.depth, source: item.source, hasLoginForm: data.hasLoginForm, screenshots: {} });
      note(finalRoute, { state: "cloned", status });
      this.log(`  ${status} ${finalRoute} — "${data.title.slice(0, 70)}" (${data.links.length} links, found via ${item.source})`);
      for (const l of data.links) {
        let u: URL;
        try { u = new URL(l.href); } catch { continue; }
        if (u.origin !== this.origin || NON_PAGE.test(u.pathname)) continue;
        const r = normRoute(u);
        if (queued.has(r)) continue;
        queued.add(r);
        if (selected) note(r, { state: "skipped", reason: "not in the selected pages" });
        else if (item.depth + 1 > this.settings.maxDepth) note(r, { state: "skipped", reason: `deeper than the crawl depth (${this.settings.maxDepth})` });
        else queue.push({ route: r, depth: item.depth + 1, source: `${l.area} link on ${finalRoute}` });
      }
    }
    if (!this.pages.length) throw new UserError("No pages could be opened on the target website.");
    const skipped = [...this.routes.values()].filter((r) => r.state === "skipped").length;
    return `${this.routes.size} routes discovered · ${this.pages.length} will be cloned · ${skipped} skipped`;
  }

  async screenshots(setDetail: (d: string) => void): Promise<string> {
    const devices = (Object.keys(VIEWPORTS) as Device[]).filter((d) => this.options.devices[d]);
    if (!devices.length) devices.push("desktop");
    let n = 0;
    for (const device of devices) {
      await this.page.setViewportSize(VIEWPORTS[device]);
      for (const p of this.pages) {
        setDetail(`${n}/${devices.length * this.pages.length} · ${device} ${p.route}`);
        try {
          await this.goto(p.url);
          const h = Math.min(await this.page.evaluate("document.documentElement.scrollHeight") as number, 6000);
          const name = `${routeSlug(p.route)}-${device}.jpg`;
          await this.page.screenshot({ path: path.join(this.dir, "screenshots", name), type: "jpeg", quality: 70, fullPage: true, clip: { x: 0, y: 0, width: VIEWPORTS[device].width, height: Math.max(h, 200) }, animations: "disabled" });
          p.screenshots[device] = name;
          n++;
        } catch (e) {
          this.check();
          this.log(`Screenshot failed for ${device} ${p.route}: ${(e as Error).message.split("\n")[0]}`, "warn");
        }
      }
    }
    await this.page.setViewportSize(VIEWPORTS.desktop);
    if (!n) throw new Error("No screenshots could be captured.");
    return `${n} screenshots (${devices.join(", ")})`;
  }

  async design(setDetail: (d: string) => void): Promise<string> {
    for (const [i, p] of this.pages.entries()) {
      setDetail(`${i}/${this.pages.length} · ${p.route}`);
      await this.goto(p.url);
      this.designByRoute[p.route] = (await this.page.evaluate(inpage("design"))) as Record<string, unknown>;
    }
    const d = this.mergedDesign();
    const fonts = (d.fonts as { value: string }[]).slice(0, 3).map((f) => f.value).join(", ");
    return `${(d.colors as unknown[]).length} text colours, ${(d.backgrounds as unknown[]).length} surface colours · fonts: ${fonts || "system"}`;
  }

  private mergedDesign(): Record<string, unknown> {
    const merge = (key: string, n: number) => {
      const acc: Record<string, number> = {};
      for (const d of Object.values(this.designByRoute)) for (const x of (d[key] as { value: string; weight: number }[]) || []) acc[x.value] = (acc[x.value] || 0) + x.weight;
      return Object.entries(acc).sort((a, b) => b[1] - a[1]).slice(0, n).map(([value, weight]) => ({ value, weight }));
    };
    const first = (Object.values(this.designByRoute)[0] || {}) as Record<string, unknown>;
    const vars: Record<string, string> = {};
    for (const d of Object.values(this.designByRoute)) Object.assign(vars, d.cssVariables as Record<string, string>);
    const reps: Record<string, number> = {};
    for (const d of Object.values(this.designByRoute)) for (const r of (d.repeatingComponents as { signature: string; count: number }[]) || []) reps[r.signature] = Math.max(reps[r.signature] || 0, r.count);
    return {
      colors: merge("colors", 8), backgrounds: merge("backgrounds", 8), fonts: merge("fonts", 5), fontSizes: merge("fontSizes", 8), radii: merge("radii", 5), shadows: merge("shadows", 3),
      cssVariables: vars, body: first.body, h1: first.h1, h2: first.h2, landmarks: first.landmarks, logo: first.logo, viewportMeta: first.viewportMeta, iconFonts: first.iconFonts,
      repeatingComponents: Object.entries(reps).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([signature, count]) => ({ signature, count })),
    };
  }

  /** Click one tagged control with writes blocked, record what changed, then put the page back. */
  private async probe(route: string, device: Device, done: Set<string>, recipes: Recipe[], inventory: Analysis["interactions"]) {
    const page = this.page;
    type Cand = { id: string | null; text: string; role: string; visible?: boolean; declared?: boolean; group?: string | null; selected?: boolean; skipped?: string };
    let cands = (await page.evaluate(inpage("stamp"))) as Cand[];
    if (device === "desktop") for (const c of cands) if (!c.id && c.skipped) inventory.push({ route, label: c.text || "(unlabelled control)", kind: "button", viewport: device, replayable: false, note: `not probed: ${c.skipped}` });
    const url = page.url().split("#")[0];
    let budget = 20;
    for (let i = 0; i < cands.length && budget > 0; i++) {
      const c = cands[i];
      if (!c.id || !c.visible || done.has(c.id)) continue;
      this.check();
      done.add(c.id);
      budget--;
      const kind = c.role === "tab" ? "tab" : "toggle";
      const label = c.text || `(unlabelled ${c.role || "control"})`;
      if (kind === "tab" && c.selected) { recipes.push({ trigger: c.id, kind, group: c.group ?? null, label, viewport: device, changes: [] }); continue; }
      const loc = page.locator(`[data-uwc-id="${c.id}"]`).first();
      try {
        await page.evaluate("window.__uwc.start()");
        await loc.click({ timeout: 1200 });
        await page.waitForTimeout(320);
      } catch {
        await page.evaluate("window.__uwc && window.__uwc.obs && window.__uwc.stop()").catch(() => {});
        continue;
      }
      if (page.url().split("#")[0] !== url) {
        inventory.push({ route, label, kind: "button", viewport: device, replayable: false, note: `navigates to ${normRoute(new URL(page.url()))}` });
        await page.goto(url, { waitUntil: "domcontentloaded" }).catch(() => {});
        await this.settle();
        await page.evaluate(inpage("observe"));
        cands = (await page.evaluate(inpage("stamp"))) as Cand[];
        continue;
      }
      const r = (await page.evaluate("window.__uwc.stop()")) as { changes: Recipe["changes"]; added: number };
      if (r.changes.length && r.changes.length <= 40) {
        recipes.push({ trigger: c.id, kind, group: c.group ?? null, label, viewport: device, changes: r.changes });
        inventory.push({ route, label, kind: kind === "tab" ? "tab" : r.changes.some((x) => x.dialog) ? "dialog" : "toggle", viewport: device, replayable: true });
      } else if (c.declared || r.added > 0) {
        inventory.push({ route, label, kind, viewport: device, replayable: false, note: r.changes.length > 40 ? "changes too many elements to replay safely" : r.added > 0 ? "inserts new content with JavaScript; cannot be replayed from attributes" : "no observable DOM change (writes are blocked while probing)" });
      }
      // Return to the initial state: natural second click (or the originally selected tab), then enforce.
      const dialog = r.changes.some((x) => x.dialog);
      if (r.changes.length && !dialog) {
        if (kind === "toggle") await loc.click({ timeout: 800 }).catch(() => {});
        else {
          const sel = cands.find((x) => x.role === "tab" && x.selected && x.group === c.group);
          if (sel?.id) await page.locator(`[data-uwc-id="${sel.id}"]`).first().click({ timeout: 800 }).catch(() => {});
        }
        await page.waitForTimeout(200);
      }
      if (r.changes.length) await page.evaluate(`window.__uwc.restore(${JSON.stringify(r.changes)})`);
    }
  }

  async functionality(setDetail: (d: string) => void): Promise<string> {
    const snaps = new Map<string, { snap: Snapshot; recipes: Recipe[] }>();
    const inventory: Analysis["interactions"] = [];
    const capture: Analysis["capture"] = { scriptsRemoved: 0, iframesKept: [], iframesRemoved: 0, canvasesConverted: 0, canvasesLost: 0, shadowRoots: 0 };

    // Which routes need a session? Ask again without cookies; nothing is bypassed.
    if (this.login.succeeded) {
      const anon = await this.browser.newContext({ userAgent: USER_AGENT });
      for (const p of this.pages) {
        try {
          const res = await anon.request.get(p.url, { maxRedirects: 0, timeout: 10000 });
          p.protected = res.status() === 401 || res.status() === 403 || (res.status() >= 300 && res.status() < 400);
        } catch {
          p.protected = false;
        }
      }
      await anon.close();
      this.log(`Protected routes: ${this.pages.filter((p) => p.protected).map((p) => p.route).join(", ") || "none"}`);
    }

    // Error state: what does the site show for an unknown URL?
    const targets: (CrawlPage & { probe404?: boolean })[] = [...this.pages];
    targets.push({ route: "/404", url: `${this.origin}/__uwc-missing-${Date.now().toString(36)}`, status: 404, title: "", h1: "", depth: 0, source: "error-state probe", hasLoginForm: false, screenshots: {}, probe404: true });

    for (const [i, p] of targets.entries()) {
      setDetail(`${i}/${this.pages.length} · ${p.route}`);
      const page = this.page;
      try {
        const res = await this.goto(p.url);
        if (p.probe404) {
          const html = /html/i.test(res?.headers()["content-type"] || "");
          if (res?.status() !== 404 || !html || this.pages.some((x) => x.route === "/404")) {
            this.notes.push(res?.status() === 404 ? "The 404 response is not an HTML page; the clone uses a generated not-found page." : `Unknown URLs return HTTP ${res?.status() ?? "?"} instead of 404; the clone uses a generated not-found page.`);
            continue;
          }
          this.currentRoute = "/404";
        }
        const recipes: Recipe[] = [];
        {
          await page.evaluate(inpage("observe"));
          this.readOnly = true;
          const done = new Set<string>();
          try {
            await this.probe(p.route, "desktop", done, recipes, inventory);
            if (this.options.devices.mobile && this.options.responsive) {
              await page.setViewportSize(VIEWPORTS.mobile);
              await page.waitForTimeout(350);
              await this.probe(p.route, "mobile", done, recipes, inventory);
              await page.setViewportSize(VIEWPORTS.desktop);
              await page.waitForTimeout(350);
            }
          } finally {
            this.readOnly = false;
          }
          await page.evaluate("scrollTo(0,0)");
          if (!p.probe404) {
            const ref = `${routeSlug(p.route)}-reference.png`;
            await page.screenshot({ path: path.join(this.dir, "screenshots", ref), type: "png", animations: "disabled" });
            p.reference = ref;
          }
        }
        const snap = (await page.evaluate(inpage("snapshot"))) as Snapshot;
        snaps.set(p.route, { snap, recipes });
        for (const k of ["scriptsRemoved", "iframesRemoved", "canvasesConverted", "canvasesLost", "shadowRoots"] as const) capture[k] += snap.report[k];
        capture.iframesKept.push(...snap.report.iframesKept);
        if (p.probe404) this.errorPageCaptured = true;
        this.log(`  ${p.route}: ${snap.forms.length} forms, ${recipes.filter((r) => r.changes.length).length} replayable interactions, ${snap.styles.length} stylesheets, ${snap.tokens.length} URLs`);
      } catch (e) {
        this.check();
        if (p.probe404) continue;
        this.log(`Snapshot failed for ${p.route}: ${(e as Error).message.split("\n")[0]}`, "error");
        this.routes.set(p.route, { route: p.route, state: "skipped", reason: "snapshot failed during functional analysis" });
      }
    }
    this.pages = this.pages.filter((p) => snaps.has(p.route));
    if (!this.pages.length) throw new Error("No page could be captured for reconstruction.");
    await Promise.allSettled([...this.pending]);

    /* ---- materialise: turn snapshots into self-contained page models with local assets and styles ---- */
    const cloned = new Set(this.pages.map((p) => p.route));
    const forms = new Map<string, FormSpec & { routes: string[] }>();
    let n = 0;
    for (const [route, { snap, recipes }] of snaps) {
      this.check();
      setDetail(`localising assets · ${++n}/${snaps.size} · ${route}`);
      const map: string[] = [];
      for (const [i, t] of snap.tokens.entries()) map[i] = t.kind === "link" ? await this.linkHref(t.url, cloned) : await this.assetHref(t.url, "{{root}}assets/");
      const styleHref: (string | null)[] = [];
      const extraHead: string[] = [];
      for (const s of snap.styles) {
        if (s.disabled) { styleHref[s.id] = null; continue; }
        let css = s.css;
        if (s.kind === "link" && s.href) css = this.cachedText(s.href) ?? (await this.fetchText(s.href)) ?? s.rules ?? null;
        const name = css && css.trim() ? await this.styleFile(css, s.base, s.kind === "link" && s.href ? path.basename(new URL(s.href).pathname) : s.kind) : null;
        styleHref[s.id] = name;
        if (s.kind === "adopted" && name) extraHead.push(`<link rel="stylesheet" href="{{root}}styles/${name}">`);
      }
      const resolve = (html: string) => html
        .replace(/<link rel="stylesheet" href="__UWCSTYLE_(\d+)__"[^>]*>/g, (m, id) => (styleHref[+id] ? m.replace(`__UWCSTYLE_${id}__`, `{{root}}styles/${styleHref[+id]}`) : ""))
        .replace(/__UWC_(\d+)__/g, (_, i) => escAttr(map[+i] ?? "#"));
      const components: Record<string, string> = {};
      for (const [k, v] of Object.entries(snap.components)) components[k] = resolve(v);
      const model: PageModel = {
        route, file: routeFile(route), title: snap.title, description: snap.description, viewport: snap.viewport,
        htmlAttrs: snap.htmlAttrs, bodyAttrs: snap.bodyAttrs, headParts: [...snap.headParts.map(resolve), ...extraHead].filter(Boolean),
        body: resolve(snap.bodyHtml), components, forms: snap.forms, interactions: recipes.filter((r) => r.changes.length || r.kind === "tab"),
        text: snap.text, headings: snap.headings, buttons: snap.buttons,
        protected: !!this.pages.find((p) => p.route === route)?.protected, isErrorPage: route === "/404" && !cloned.has("/404"),
      };
      writeJson(path.join(this.dir, "model", `${routeSlug(route)}.json`), model);
      for (const f of snap.forms) {
        const cur = forms.get(f.id);
        if (cur) cur.routes.push(route);
        else forms.set(f.id, { ...f, routes: [route] });
      }
    }

    const analysis: Analysis = {
      targetUrl: this.targetUrl, origin: this.origin, startRoute: this.pages[0].route, analysedAt: new Date().toISOString(), browser: this.info,
      pages: this.pages, routes: [...this.routes.values()].sort((a, b) => a.route.localeCompare(b.route)),
      login: this.login, design: this.mergedDesign(), designByRoute: this.designByRoute, forms: [...forms.values()], interactions: inventory,
      api: this.api, consoleErrors: this.consoleErrors,
      assets: { downloaded: [...this.assetNames.values()].filter(Boolean).length, bytes: this.assetBytes, failed: this.assetFailed.slice(0, 100) },
      capture: { ...capture, iframesKept: [...new Set(capture.iframesKept)] }, blockedRequests: this.blocked, errorPageCaptured: this.errorPageCaptured, notes: this.notes,
    };
    writeJson(path.join(this.dir, "analysis.json"), analysis);
    fs.rmSync(/*turbopackIgnore: true*/ path.join(this.dir, "cache"), { recursive: true, force: true });
    const replay = inventory.filter((x) => x.replayable).length;
    return `${forms.size} forms · ${replay} replayable interactions · ${this.api.length} API calls observed · ${analysis.assets.downloaded} assets saved`;
  }

  private cachedText(url: string): string | null {
    const hit = this.netCache.get(url);
    if (!hit) return null;
    try { return fs.readFileSync(/*turbopackIgnore: true*/ hit.file, "utf8"); } catch { return null; }
  }

  /** Server-side fetch with every redirect hop re-validated against the SSRF rules. */
  private async fetchGuarded(url: string): Promise<{ body: Buffer; type: string } | { error: string }> {
    let cur = url;
    for (let hop = 0; hop < 4; hop++) {
      if (!(await isPublicUrl(cur))) return { error: "blocked address" };
      try {
        const res = await this.context.request.get(cur, { maxRedirects: 0, timeout: 15000, headers: { referer: this.origin + "/" } });
        const st = res.status();
        if (st >= 300 && st < 400 && res.headers().location) { cur = new URL(res.headers().location, cur).href; continue; }
        if (st !== 200) return { error: `HTTP ${st}` };
        if (Number(res.headers()["content-length"] || 0) > MAX_ASSET) return { error: "larger than the per-file limit" };
        const body = await res.body();
        if (body.length > MAX_ASSET) return { error: "larger than the per-file limit" };
        return { body, type: (res.headers()["content-type"] || "").split(";")[0].trim().toLowerCase() };
      } catch (e) {
        return { error: (e as Error).message.split("\n")[0].slice(0, 100) };
      }
    }
    return { error: "too many redirects" };
  }
  private async fetchText(url: string): Promise<string | null> {
    const r = await this.fetchGuarded(url);
    return "body" in r ? r.body.toString("utf8") : null;
  }

  /** Save one remote asset locally and return its file name (null when unavailable). */
  private async asset(url: string): Promise<string | null> {
    const key = url.split("#")[0];
    if (this.assetNames.has(key)) return this.assetNames.get(key)!;
    this.assetNames.set(key, null);
    let body: Buffer | null = null;
    let type = "";
    const hit = this.netCache.get(key);
    if (hit) {
      try { body = fs.readFileSync(/*turbopackIgnore: true*/ hit.file); type = hit.type; } catch { /* fall through */ }
    }
    if (!body) {
      const r = await this.fetchGuarded(key);
      if ("error" in r) { this.assetFailed.push({ url: key.slice(0, 300), reason: r.error }); return null; }
      body = r.body;
      type = r.type;
    }
    if (/html/.test(type)) { this.assetFailed.push({ url: key.slice(0, 300), reason: "returned an HTML page, not an asset" }); return null; }
    if (this.assetBytes + body.length > MAX_TOTAL) { this.assetFailed.push({ url: key.slice(0, 300), reason: "total asset budget reached" }); return null; }
    const u = new URL(key);
    const baseName = decodeURIComponent(path.basename(u.pathname) || "asset").replace(/[^a-zA-Z0-9._-]/g, "_");
    let ext = path.extname(baseName).toLowerCase();
    if (!ext || ext.length > 6) ext = EXT_BY_TYPE[type] || ".bin";
    const stem = (path.extname(baseName) ? baseName.slice(0, -path.extname(baseName).length) : baseName).slice(0, 40) || "asset";
    const name = `${stem}-${sha1(key).slice(0, 8)}${ext}`;
    fs.writeFileSync(/*turbopackIgnore: true*/ path.join(this.dir, "assets", name), body);
    this.assetBytes += body.length;
    this.assetNames.set(key, name);
    return name;
  }
  private async assetHref(url: string, prefix: string): Promise<string> {
    const name = await this.asset(url);
    const frag = url.includes("#") ? url.slice(url.indexOf("#")) : "";
    return name ? `${prefix}${name}${frag}` : url;
  }

  private async linkHref(url: string, cloned: Set<string>): Promise<string> {
    const u = new URL(url);
    if (u.origin !== this.origin) return url;
    if (NON_PAGE.test(u.pathname)) return this.assetHref(url, "{{root}}assets/");
    const route = normRoute(u);
    void cloned;
    return `{{root}}${route === "/" ? "" : route.slice(1)}${u.search}${u.hash}`;
  }

  /** Rewrite url() and @import in a stylesheet to local files; returns the saved file name. */
  private async styleFile(css: string, base: string, hint: string, depth = 0): Promise<string | null> {
    const key = sha1(base + "\n" + css);
    if (this.styleNames.has(key)) return this.styleNames.get(key)!;
    this.styleNames.set(key, null);
    let out = css.replace(/\/\*# sourceMappingURL=[^*]*\*\//g, "");
    const imports = [...out.matchAll(/@import\s+(?:url\(\s*)?["']?([^"')\s;]+)["']?\s*\)?([^;]*);/g)];
    for (const m of imports) {
      let rep = "";
      try {
        const abs = new URL(m[1], base).href;
        const text = depth < 4 ? (this.cachedText(abs) ?? (await this.fetchText(abs))) : null;
        const name = text ? await this.styleFile(text, abs, path.basename(new URL(abs).pathname), depth + 1) : null;
        if (name) rep = `@import "./${name}"${m[2]};`;
        else this.assetFailed.push({ url: abs.slice(0, 300), reason: "imported stylesheet unavailable" });
      } catch { /* drop unparsable import */ }
      out = out.replace(m[0], () => rep);
    }
    const urls = [...new Set([...out.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)].map((m) => m[2]))];
    const map = new Map<string, string>();
    for (const raw of urls) {
      if (/^(data:|#|about:)/i.test(raw.trim())) continue;
      try {
        const abs = new URL(raw.trim(), base).href;
        if (/^https?:/.test(abs)) map.set(raw, await this.assetHref(abs, "../assets/"));
      } catch { /* leave as written */ }
    }
    out = out.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m, _q, raw) => (map.has(raw) ? `url("${map.get(raw)}")` : m));
    const stem = (hint.replace(/\.css$/i, "").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 30) || "style");
    const name = `${stem}-${sha1(out).slice(0, 8)}.css`;
    fs.writeFileSync(/*turbopackIgnore: true*/ path.join(this.dir, "styles", name), out);
    this.styleNames.set(key, name);
    return name;
  }

  async close() {
    await this.browser?.close().catch(() => {});
  }
}

export const loadAnalysis = (projectId: string) => readJson<Analysis | null>(path.join(analysisDir(projectId), "analysis.json"), null);
export function loadModels(projectId: string): PageModel[] {
  const dir = path.join(analysisDir(projectId), "model");
  if (!fs.existsSync(/*turbopackIgnore: true*/ dir)) return [];
  return fs.readdirSync(/*turbopackIgnore: true*/ dir).filter((f) => f.endsWith(".json")).map((f) => readJson<PageModel>(path.join(dir, f), null as unknown as PageModel)).filter(Boolean);
}

/** Quick, synchronous look at one URL for the "Analyze website" button: no crawl, no clicks. */
export async function quickAnalyze(targetUrl: string) {
  const start = await assertPublicUrl(targetUrl);
  const { browser, info } = await launchBrowser();
  try {
    const context = await browser.newContext({ viewport: VIEWPORTS.desktop, userAgent: USER_AGENT, serviceWorkers: "block" });
    let blocked = 0;
    await context.route("**/*", async (route) => {
      const url = route.request().url();
      if (/^(data|blob|about):/i.test(url) || (await isPublicUrl(url))) return route.continue();
      blocked++;
      return route.abort("blockedbyclient");
    });
    const page = await context.newPage();
    const res = await page.goto(start.href, { waitUntil: "domcontentloaded", timeout: 25000 });
    await page.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => {});
    const final = new URL(page.url());
    const data = (await page.evaluate(inpage("links"))) as { title: string; h1: string; hasLoginForm: boolean; textLength: number; links: { href: string; text: string; area: string }[] };
    const routes = new Map<string, { route: string; text: string; area: string }>();
    for (const l of data.links) {
      try {
        const u = new URL(l.href);
        if (u.origin !== final.origin || NON_PAGE.test(u.pathname) || UNSAFE_ROUTE.test(u.pathname)) continue;
        const r = normRoute(u);
        if (!routes.has(r)) routes.set(r, { route: r, text: l.text, area: l.area });
      } catch { /* skip */ }
    }
    const shot = await page.screenshot({ type: "jpeg", quality: 60 });
    const loginLink = data.links.find((l) => /log ?in|sign ?in/i.test(l.text));
    return {
      finalUrl: final.href, redirected: final.href.replace(/\/$/, "") !== start.href.replace(/\/$/, ""), status: res?.status() ?? 0,
      title: data.title, h1: data.h1, hasLoginForm: data.hasLoginForm, loginLink: loginLink?.href ?? null,
      jsRendered: data.textLength < 200, routes: [...routes.values()].slice(0, 200), externalLinks: data.links.filter((l) => { try { return new URL(l.href).origin !== final.origin; } catch { return false; } }).length,
      blockedRequests: blocked, browser: info, screenshot: `data:image/jpeg;base64,${shot.toString("base64")}`,
    };
  } finally {
    await browser.close().catch(() => {});
  }
}
