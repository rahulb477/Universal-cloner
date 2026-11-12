import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "@/db";

let cached: Buffer | null = null;

/** 32-byte master key. STUDIO_SECRET in production; a generated 0600 file for local development. */
export function masterKey(): Buffer {
  if (cached) return cached;
  const env = process.env.STUDIO_SECRET;
  if (env && env.length >= 16) return (cached = crypto.createHash("sha256").update(env).digest());
  if (process.env.NODE_ENV === "production" && process.env.STUDIO_REQUIRE_SECRET === "true") {
    throw new Error("STUDIO_SECRET (16+ characters) is required");
  }
  const file = path.join(DATA_DIR, ".studio-secret");
  fs.mkdirSync(/*turbopackIgnore: true*/ DATA_DIR, { recursive: true });
  if (!fs.existsSync(/*turbopackIgnore: true*/ file)) {
    fs.writeFileSync(/*turbopackIgnore: true*/ file, crypto.randomBytes(48).toString("base64"), { mode: 0o600 });
  }
  return (cached = crypto.createHash("sha256").update(fs.readFileSync(/*turbopackIgnore: true*/ file, "utf8").trim()).digest());
}

export function secretSource(): "env" | "file" {
  return process.env.STUDIO_SECRET && process.env.STUDIO_SECRET.length >= 16 ? "env" : "file";
}

export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", masterKey(), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return ["v1", iv.toString("base64"), c.getAuthTag().toString("base64"), ct.toString("base64")].join(":");
}

export function decrypt(blob: string): string {
  const [v, iv, tag, ct] = blob.split(":");
  if (v !== "v1" || !iv || !tag || !ct) throw new Error("Unreadable secret");
  const d = crypto.createDecipheriv("aes-256-gcm", masterKey(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(ct, "base64")), d.final()]).toString("utf8");
}

export const maskKey = (k: string) => (k.length <= 4 ? "••••" : `••••••••${k.slice(-4)}`);
export const newId = (bytes = 12) => crypto.randomBytes(bytes).toString("hex");
export const sha1 = (s: string | Buffer) => crypto.createHash("sha1").update(s).digest("hex");

export function sign(value: string): string {
  return `${value}.${crypto.createHmac("sha256", masterKey()).update(value).digest("base64url")}`;
}
export function unsign(signed: string | undefined): string | null {
  if (!signed) return null;
  const i = signed.lastIndexOf(".");
  if (i < 0) return null;
  const value = signed.slice(0, i);
  const a = Buffer.from(sign(value));
  const b = Buffer.from(signed);
  return a.length === b.length && crypto.timingSafeEqual(a, b) ? value : null;
}
