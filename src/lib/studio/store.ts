import fs from "node:fs";
import path from "node:path";
import { desc, eq } from "drizzle-orm";
import { DATA_DIR, getDb } from "@/db";
import { activity, jobs, projects, settings, type JobRow, type ProjectRow } from "@/db/schema";

export const PROJECT_STATUSES = ["pending", "analyzing", "discovery_complete", "generating", "building", "ready", "failed"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export type ProjectOptions = {
  scope: "entire" | "selected";
  selectedPaths: string[];
  maxPages: number;
  devices: { desktop: boolean; tablet: boolean; mobile: boolean };
  frontend: boolean;
  backend: boolean;
  database: boolean;
  authentication: boolean;
  animations: boolean;
  responsive: boolean;
  useAi: boolean;
};

export type ProjectAuth = { required: boolean; loginUrl: string; username: string; notes: string };

export const DEFAULT_OPTIONS: ProjectOptions = {
  scope: "entire", selectedPaths: [], maxPages: 12,
  devices: { desktop: true, tablet: true, mobile: true },
  frontend: true, backend: true, database: true, authentication: true, animations: true, responsive: true, useAi: true,
};

export type StudioSettings = {
  maxPages: number; maxDepth: number; navTimeoutMs: number; respectRobots: boolean;
  previewIdleMinutes: number; maxPreviews: number; buildTimeoutSec: number; memoryMb: number;
  aiTemperature: number; aiMaxTokens: number; aiTimeoutSec: number; jobRetries: number;
};

export const DEFAULT_SETTINGS: StudioSettings = {
  maxPages: 12, maxDepth: 3, navTimeoutMs: 25000, respectRobots: true,
  previewIdleMinutes: 60, maxPreviews: 4, buildTimeoutSec: 120, memoryMb: 256,
  aiTemperature: 0.2, aiMaxTokens: 4000, aiTimeoutSec: 90, jobRetries: 1,
};

const LIMITS: Record<keyof StudioSettings, [number, number] | null> = {
  maxPages: [1, 60], maxDepth: [1, 6], navTimeoutMs: [5000, 60000], respectRobots: null,
  previewIdleMinutes: [1, 1440], maxPreviews: [1, 12], buildTimeoutSec: [20, 600], memoryMb: [128, 2048],
  aiTemperature: [0, 1], aiMaxTokens: [500, 32000], aiTimeoutSec: [10, 600], jobRetries: [0, 3],
};

export async function getSettings(): Promise<StudioSettings> {
  const db = await getDb();
  const [row] = await db.select().from(settings).where(eq(settings.key, "studio"));
  return { ...DEFAULT_SETTINGS, ...((row?.value as Partial<StudioSettings>) || {}) };
}

export async function saveSettings(patch: Record<string, unknown>): Promise<StudioSettings> {
  const cur = await getSettings();
  const next = { ...cur } as Record<string, unknown>;
  for (const k of Object.keys(DEFAULT_SETTINGS) as (keyof StudioSettings)[]) {
    if (!(k in patch)) continue;
    const lim = LIMITS[k];
    if (lim === null) next[k] = patch[k] === true;
    else {
      const n = Number(patch[k]);
      if (!Number.isFinite(n)) throw new Error(`${k} must be a number`);
      next[k] = Math.min(lim[1], Math.max(lim[0], n));
    }
  }
  const db = await getDb();
  await db.insert(settings).values({ key: "studio", value: next }).onConflictDoUpdate({ target: settings.key, set: { value: next } });
  return next as StudioSettings;
}

/* ---------- paths ---------- */
const ID_RE = /^[a-f0-9]{16,64}$/;
export const validId = (id: string) => ID_RE.test(id);
export function projectDir(id: string): string {
  if (!validId(id)) throw new Error("Invalid project id");
  return path.join(DATA_DIR, "projects", id);
}
export const siteDir = (id: string) => path.join(projectDir(id), "site");
export const analysisDir = (id: string) => path.join(projectDir(id), "analysis");
export const logsDir = (id: string) => path.join(projectDir(id), "logs");
export const exportsDir = (id: string) => path.join(projectDir(id), "exports");

/** Resolve a user-supplied relative path inside a base directory; null when it escapes. */
export function safeJoin(base: string, rel: string): string | null {
  const clean = rel.replace(/\\/g, "/").replace(/^\/+/, "");
  if (clean.includes("\0")) return null;
  const abs = path.resolve(base, clean);
  if (abs !== base && !abs.startsWith(base + path.sep)) return null;
  try {
    const real = fs.realpathSync(/*turbopackIgnore: true*/ abs);
    const realBase = fs.realpathSync(/*turbopackIgnore: true*/ base);
    if (real !== realBase && !real.startsWith(realBase + path.sep)) return null;
  } catch {
    /* does not exist yet: the lexical check above is sufficient */
  }
  return abs;
}

/* ---------- projects ---------- */
export async function getProject(id: string): Promise<ProjectRow | null> {
  if (!validId(id)) return null;
  const db = await getDb();
  const [row] = await db.select().from(projects).where(eq(projects.id, id));
  return row ?? null;
}
export async function getProjectByToken(token: string): Promise<ProjectRow | null> {
  if (!validId(token)) return null;
  const db = await getDb();
  const [row] = await db.select().from(projects).where(eq(projects.previewToken, token));
  return row ?? null;
}
export async function listProjects(): Promise<ProjectRow[]> {
  const db = await getDb();
  return db.select().from(projects).orderBy(desc(projects.createdAt));
}
export async function updateProject(id: string, patch: Partial<ProjectRow>): Promise<void> {
  const db = await getDb();
  await db.update(projects).set({ ...patch, updatedAt: new Date() }).where(eq(projects.id, id));
}
export async function latestJob(projectId: string): Promise<JobRow | null> {
  const db = await getDb();
  const [row] = await db.select().from(jobs).where(eq(jobs.projectId, projectId)).orderBy(desc(jobs.createdAt)).limit(1);
  return row ?? null;
}
export async function logActivity(kind: string, message: string, projectId?: string | null) {
  const db = await getDb();
  await db.insert(activity).values({ kind, message, projectId: projectId ?? null });
}

export function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(/*turbopackIgnore: true*/ file, "utf8")) as T;
  } catch {
    return fallback;
  }
}
export function writeJson(file: string, value: unknown) {
  fs.mkdirSync(/*turbopackIgnore: true*/ path.dirname(file), { recursive: true });
  fs.writeFileSync(/*turbopackIgnore: true*/ file, JSON.stringify(value, null, 2));
}
