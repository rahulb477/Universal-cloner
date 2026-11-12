import { boolean, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

// Tracks clone projects the user is running with the Universal Website Cloner skill.
// Mirrors the skill's phase model (see universal-website-cloner/scripts/state.mjs).
export const cloneProjects = pgTable("clone_projects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  targetUrl: text("target_url").notNull(),
  category: text("category").notNull().default("web app"),
  authRequired: boolean("auth_required").notNull().default(false),
  authorised: boolean("authorised").notNull().default(false),
  phase: text("phase").notNull().default("startup"),
  status: text("status").notNull().default("pending"),
  worstMismatchPercent: integer("worst_mismatch_percent"),
  notes: text("notes").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type CloneProject = typeof cloneProjects.$inferSelect;
