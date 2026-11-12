import fs from "node:fs";
import path from "node:path";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { BOOTSTRAP_SQL } from "./schema";

export type Db = NodePgDatabase;
export type DbInfo = { engine: "postgresql" | "pglite"; location: string };

const g = globalThis as typeof globalThis & { __uwcDb?: Promise<{ db: Db; info: DbInfo }> };

export const DATA_DIR = path.resolve(process.env.STUDIO_DATA_DIR || path.join(process.cwd(), "data"));

async function open(): Promise<{ db: Db; info: DbInfo }> {
  const url = process.env.DATABASE_URL;
  if (url) {
    const { Pool } = await import("pg");
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const pool = new Pool({ connectionString: url, max: 5 });
    for (const stmt of BOOTSTRAP_SQL.split(";").map((s) => s.trim()).filter(Boolean)) await pool.query(stmt);
    return { db: drizzle(pool), info: { engine: "postgresql", location: url.replace(/\/\/[^@]*@/, "//***@") } };
  }
  // No DATABASE_URL: use embedded PostgreSQL (PGlite) persisted on disk, so the studio works with zero setup.
  const dir = path.join(DATA_DIR, "pglite");
  fs.mkdirSync(/*turbopackIgnore: true*/ dir, { recursive: true });
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const client = new PGlite(dir);
  await client.exec(BOOTSTRAP_SQL);
  return { db: drizzle(client) as unknown as Db, info: { engine: "pglite", location: dir } };
}

export function getDb(): Promise<Db> {
  if (!g.__uwcDb) g.__uwcDb = open();
  return g.__uwcDb.then((x) => x.db);
}

export async function getDbInfo(): Promise<DbInfo> {
  await getDb();
  return (await g.__uwcDb!).info;
}
