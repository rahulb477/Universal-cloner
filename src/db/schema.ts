import { boolean, integer, jsonb, pgTable, real, serial, text, timestamp } from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true });

/** A clone project: one reference website and the independent project generated from it. */
export const projects = pgTable("studio_projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  targetUrl: text("target_url").notNull(),
  status: text("status").notNull().default("pending"),
  buildStatus: text("build_status").notNull().default("none"),
  options: jsonb("options").notNull().default({}),
  auth: jsonb("auth").notNull().default({}),
  /** AES-256-GCM encrypted test-account password. Wiped as soon as discovery finishes. */
  passwordEnc: text("password_enc"),
  providerId: text("provider_id"),
  routesDiscovered: integer("routes_discovered").notNull().default(0),
  pagesCloned: integer("pages_cloned").notNull().default(0),
  previewToken: text("preview_token").notNull(),
  zip: jsonb("zip"),
  verification: jsonb("verification"),
  mismatchPercent: real("mismatch_percent"),
  error: text("error"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/** Background job. State lives here, never in a browser request. */
export const jobs = pgTable("studio_jobs", {
  id: text("id").primaryKey(),
  projectId: text("project_id").notNull(),
  type: text("type").notNull(),
  status: text("status").notNull().default("queued"),
  fromStage: text("from_stage").notNull().default("discovery"),
  steps: jsonb("steps").notNull().default([]),
  attempt: integer("attempt").notNull().default(1),
  cancelRequested: boolean("cancel_requested").notNull().default(false),
  error: text("error"),
  createdAt: ts("created_at").notNull().defaultNow(),
  startedAt: ts("started_at"),
  finishedAt: ts("finished_at"),
});

/** AI provider configuration. The API key is stored encrypted and never returned to clients. */
export const providers = pgTable("studio_providers", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull(),
  label: text("label").notNull(),
  endpoint: text("endpoint").notNull().default(""),
  model: text("model").notNull().default(""),
  models: jsonb("models").notNull().default([]),
  keyEnc: text("key_enc"),
  keyHint: text("key_hint").notNull().default(""),
  isDefault: boolean("is_default").notNull().default(false),
  status: text("status").notNull().default("untested"),
  lastTestedAt: ts("last_tested_at"),
  lastError: text("last_error"),
  usage: jsonb("usage").notNull().default({}),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const settings = pgTable("studio_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
});

export const activity = pgTable("studio_activity", {
  id: serial("id").primaryKey(),
  projectId: text("project_id"),
  kind: text("kind").notNull(),
  message: text("message").notNull(),
  createdAt: ts("created_at").notNull().defaultNow(),
});

export type ProjectRow = typeof projects.$inferSelect;
export type JobRow = typeof jobs.$inferSelect;
export type ProviderRow = typeof providers.$inferSelect;

/** Idempotent bootstrap. Runs at start-up on both PostgreSQL and the embedded PGlite engine. */
export const BOOTSTRAP_SQL = `
CREATE TABLE IF NOT EXISTS studio_projects (
  id text PRIMARY KEY, name text NOT NULL, description text NOT NULL DEFAULT '', target_url text NOT NULL,
  status text NOT NULL DEFAULT 'pending', build_status text NOT NULL DEFAULT 'none',
  options jsonb NOT NULL DEFAULT '{}', auth jsonb NOT NULL DEFAULT '{}', password_enc text, provider_id text,
  routes_discovered integer NOT NULL DEFAULT 0, pages_cloned integer NOT NULL DEFAULT 0,
  preview_token text NOT NULL, zip jsonb, verification jsonb, mismatch_percent real, error text,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS studio_jobs (
  id text PRIMARY KEY, project_id text NOT NULL, type text NOT NULL, status text NOT NULL DEFAULT 'queued',
  from_stage text NOT NULL DEFAULT 'discovery', steps jsonb NOT NULL DEFAULT '[]', attempt integer NOT NULL DEFAULT 1,
  cancel_requested boolean NOT NULL DEFAULT false, error text,
  created_at timestamptz NOT NULL DEFAULT now(), started_at timestamptz, finished_at timestamptz);
CREATE INDEX IF NOT EXISTS studio_jobs_project_idx ON studio_jobs (project_id, created_at);
CREATE TABLE IF NOT EXISTS studio_providers (
  id text PRIMARY KEY, kind text NOT NULL, label text NOT NULL, endpoint text NOT NULL DEFAULT '', model text NOT NULL DEFAULT '',
  models jsonb NOT NULL DEFAULT '[]', key_enc text, key_hint text NOT NULL DEFAULT '', is_default boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'untested', last_tested_at timestamptz, last_error text, usage jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS studio_settings (key text PRIMARY KEY, value jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS studio_activity (
  id serial PRIMARY KEY, project_id text, kind text NOT NULL, message text NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
`;
