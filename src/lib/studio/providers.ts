import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { providers, type ProviderRow } from "@/db/schema";
import { decrypt, encrypt, maskKey, newId } from "./crypto";
import { assertPublicUrl } from "./ssrf";
import { getSettings } from "./store";

export const PROVIDER_KINDS = {
  anthropic: { name: "Anthropic Claude", endpoint: "https://api.anthropic.com", endpointEditable: false, discovery: true, keyUrl: "https://console.anthropic.com/settings/keys" },
  gemini: { name: "Google Gemini", endpoint: "https://generativelanguage.googleapis.com/v1beta", endpointEditable: false, discovery: true, keyUrl: "https://aistudio.google.com/apikey" },
  openai: { name: "OpenAI", endpoint: "https://api.openai.com/v1", endpointEditable: false, discovery: true, keyUrl: "https://platform.openai.com/api-keys" },
  openrouter: { name: "OpenRouter", endpoint: "https://openrouter.ai/api/v1", endpointEditable: false, discovery: true, keyUrl: "https://openrouter.ai/keys" },
  custom: { name: "OpenAI-compatible endpoint", endpoint: "", endpointEditable: true, discovery: true, keyUrl: "" },
} as const;
export type ProviderKind = keyof typeof PROVIDER_KINDS;
export const isKind = (k: unknown): k is ProviderKind => typeof k === "string" && k in PROVIDER_KINDS;

type Usage = { requests?: number; inputTokens?: number; outputTokens?: number; errors?: number; lastUsedAt?: string };

/** The only provider shape that ever leaves the server. It never contains the key. */
export function publicProvider(p: ProviderRow) {
  return {
    id: p.id, kind: p.kind, kindName: PROVIDER_KINDS[p.kind as ProviderKind]?.name ?? p.kind, label: p.label,
    endpoint: p.endpoint || PROVIDER_KINDS[p.kind as ProviderKind]?.endpoint || "",
    model: p.model, models: p.models as string[], hasKey: !!p.keyEnc, keyHint: p.keyHint, isDefault: p.isDefault,
    status: p.status, lastTestedAt: p.lastTestedAt, lastError: p.lastError, usage: p.usage as Usage, updatedAt: p.updatedAt,
  };
}

export async function listProviders() {
  const db = await getDb();
  return (await db.select().from(providers)).sort((a, b) => +a.createdAt - +b.createdAt);
}
export async function getProvider(id: string) {
  const db = await getDb();
  const [row] = await db.select().from(providers).where(eq(providers.id, id));
  return row ?? null;
}
export async function defaultProvider() {
  const all = await listProviders();
  return all.find((p) => p.isDefault && p.status === "connected") ?? null;
}

async function checkEndpoint(raw: string): Promise<string> {
  const trimmed = raw.trim().replace(/\/+$/, "");
  let u: URL;
  try {
    u = new URL(trimmed);
  } catch {
    throw new Error("The API endpoint must be a full URL, for example https://api.example.com/v1");
  }
  if (process.env.STUDIO_ALLOW_LOCAL_AI === "true") {
    if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("The API endpoint must use http or https.");
    return trimmed;
  }
  if (u.protocol !== "https:") throw new Error("The API endpoint must use https. (Set STUDIO_ALLOW_LOCAL_AI=true to allow local http endpoints such as Ollama.)");
  await assertPublicUrl(trimmed);
  return trimmed;
}

export async function saveProvider(input: { id?: string; kind?: unknown; label?: unknown; endpoint?: unknown; model?: unknown; apiKey?: unknown }) {
  const db = await getDb();
  const existing = input.id ? await getProvider(input.id) : null;
  if (input.id && !existing) throw new Error("Provider not found");
  const kind = existing ? (existing.kind as ProviderKind) : input.kind;
  if (!isKind(kind)) throw new Error("Choose a provider");
  const meta = PROVIDER_KINDS[kind];
  const endpoint = meta.endpointEditable ? await checkEndpoint(String(input.endpoint ?? existing?.endpoint ?? "")) : "";
  const apiKey = typeof input.apiKey === "string" ? input.apiKey.trim() : "";
  if (!existing && !apiKey && kind !== "custom") throw new Error("An API key is required");
  if (apiKey && (apiKey.length < 8 || apiKey.length > 500 || /\s/.test(apiKey))) throw new Error("That does not look like a valid API key");
  const model = typeof input.model === "string" ? input.model.trim().slice(0, 200) : (existing?.model ?? "");
  const label = (typeof input.label === "string" && input.label.trim() ? input.label.trim() : (existing?.label ?? meta.name)).slice(0, 80);
  // Any change to key, endpoint or model invalidates the previous connection test.
  const changed = !existing || !!apiKey || endpoint !== existing.endpoint || model !== existing.model;
  const values = {
    label, endpoint, model,
    ...(apiKey ? { keyEnc: encrypt(apiKey), keyHint: maskKey(apiKey) } : {}),
    ...(changed ? { status: "untested", lastError: null } : {}),
    updatedAt: new Date(),
  };
  if (existing) {
    await db.update(providers).set(values).where(eq(providers.id, existing.id));
    return (await getProvider(existing.id))!;
  }
  const id = newId(8);
  await db.insert(providers).values({ id, kind, ...values });
  return (await getProvider(id))!;
}

export async function deleteProvider(id: string) {
  const db = await getDb();
  await db.delete(providers).where(eq(providers.id, id));
}

export async function setDefaultProvider(id: string) {
  const p = await getProvider(id);
  if (!p) throw new Error("Provider not found");
  if (p.status !== "connected") throw new Error("Test the connection successfully before making this the default provider.");
  const db = await getDb();
  await db.update(providers).set({ isDefault: false });
  await db.update(providers).set({ isDefault: true }).where(eq(providers.id, id));
}

/* ---------- HTTP plumbing (server side only) ---------- */
class ProviderError extends Error {
  constructor(message: string, public status = 0) {
    super(message);
  }
}

const base = (p: ProviderRow) => (p.endpoint || PROVIDER_KINDS[p.kind as ProviderKind].endpoint).replace(/\/+$/, "");
const keyOf = (p: ProviderRow) => (p.keyEnc ? decrypt(p.keyEnc) : "");
const redact = (s: string, key: string) => (key ? s.split(key).join("[redacted]") : s).slice(0, 400);

function authHeaders(p: ProviderRow, key: string): Record<string, string> {
  if (p.kind === "anthropic") return { "x-api-key": key, "anthropic-version": "2023-06-01" };
  if (p.kind === "gemini") return { "x-goog-api-key": key };
  return key ? { authorization: `Bearer ${key}` } : {};
}

async function call(p: ProviderRow, path: string, init: { method?: string; body?: unknown; timeoutMs?: number } = {}) {
  const key = keyOf(p);
  let res: Response;
  try {
    res = await fetch(base(p) + path, {
      method: init.method ?? (init.body ? "POST" : "GET"),
      headers: { ...authHeaders(p, key), ...(init.body ? { "content-type": "application/json" } : {}) },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(init.timeoutMs ?? 20000),
      redirect: "error",
    });
  } catch (e) {
    const err = e as Error & { cause?: { code?: string } };
    const why = err.name === "TimeoutError" ? "the request timed out" : (err.cause?.code ?? err.message);
    throw new ProviderError(`Could not reach ${new URL(base(p)).host}: ${redact(String(why), key)}`);
  }
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* non-JSON body */
  }
  if (!res.ok) {
    const j = json as { error?: { message?: string } | string; message?: string } | null;
    const detail = (typeof j?.error === "string" ? j.error : j?.error?.message) ?? j?.message ?? text.slice(0, 200);
    const hint = res.status === 401 || res.status === 403 ? " The API key was rejected." : res.status === 429 ? " Rate limit or quota reached." : "";
    throw new ProviderError(`HTTP ${res.status} from provider.${hint} ${redact(String(detail), key)}`.trim(), res.status);
  }
  return json as Record<string, unknown>;
}

async function discoverModels(p: ProviderRow): Promise<string[]> {
  if (p.kind === "anthropic") {
    const j = await call(p, "/v1/models?limit=1000");
    return ((j.data as { id: string }[]) || []).map((m) => m.id);
  }
  if (p.kind === "gemini") {
    const j = await call(p, "/models?pageSize=1000");
    return ((j.models as { name: string; supportedGenerationMethods?: string[] }[]) || [])
      .filter((m) => !m.supportedGenerationMethods || m.supportedGenerationMethods.includes("generateContent"))
      .map((m) => m.name.replace(/^models\//, ""));
  }
  if (p.kind === "openrouter") await call(p, "/key"); // the model list is public, so validate the key explicitly
  const j = await call(p, "/models");
  const ids = ((j.data as { id: string }[]) || []).map((m) => m.id);
  return p.kind === "openai" ? ids.filter((id) => !/embedding|whisper|tts|dall-e|moderation|audio|image|realtime|transcribe|sora/i.test(id)) : ids;
}

export type ChatResult = { text: string; inputTokens: number; outputTokens: number };

async function rawChat(p: ProviderRow, o: { system: string; user: string; maxTokens: number; temperature: number; timeoutMs: number }): Promise<ChatResult> {
  if (!p.model) throw new ProviderError("No model is selected for this provider.");
  if (p.kind === "anthropic") {
    const j = await call(p, "/v1/messages", { timeoutMs: o.timeoutMs, body: { model: p.model, max_tokens: o.maxTokens, temperature: o.temperature, system: o.system, messages: [{ role: "user", content: o.user }] } });
    const u = (j.usage as { input_tokens?: number; output_tokens?: number }) || {};
    return { text: ((j.content as { type: string; text?: string }[]) || []).map((c) => c.text || "").join(""), inputTokens: u.input_tokens || 0, outputTokens: u.output_tokens || 0 };
  }
  if (p.kind === "gemini") {
    const j = await call(p, `/models/${encodeURIComponent(p.model)}:generateContent`, {
      timeoutMs: o.timeoutMs,
      body: { systemInstruction: { parts: [{ text: o.system }] }, contents: [{ role: "user", parts: [{ text: o.user }] }], generationConfig: { temperature: o.temperature, maxOutputTokens: o.maxTokens } },
    });
    const cand = ((j.candidates as { content?: { parts?: { text?: string }[] } }[]) || [])[0];
    const u = (j.usageMetadata as { promptTokenCount?: number; candidatesTokenCount?: number }) || {};
    return { text: (cand?.content?.parts || []).map((x) => x.text || "").join(""), inputTokens: u.promptTokenCount || 0, outputTokens: u.candidatesTokenCount || 0 };
  }
  const messages = [{ role: "system", content: o.system }, { role: "user", content: o.user }];
  // Chat-completions dialects differ (max_tokens vs max_completion_tokens, fixed temperature). Fall back progressively.
  const variants: Record<string, unknown>[] = [
    { model: p.model, messages, temperature: o.temperature, [p.kind === "openai" ? "max_completion_tokens" : "max_tokens"]: o.maxTokens },
    { model: p.model, messages, [p.kind === "openai" ? "max_completion_tokens" : "max_tokens"]: o.maxTokens },
    { model: p.model, messages },
  ];
  let last: unknown;
  for (const body of variants) {
    try {
      const j = await call(p, "/chat/completions", { timeoutMs: o.timeoutMs, body });
      const msg = ((j.choices as { message?: { content?: string } }[]) || [])[0]?.message;
      const u = (j.usage as { prompt_tokens?: number; completion_tokens?: number }) || {};
      return { text: msg?.content || "", inputTokens: u.prompt_tokens || 0, outputTokens: u.completion_tokens || 0 };
    } catch (e) {
      last = e;
      if (!(e instanceof ProviderError) || e.status !== 400) throw e;
    }
  }
  throw last;
}

async function recordUsage(p: ProviderRow, r: ChatResult | null, error?: string) {
  const db = await getDb();
  const fresh = await getProvider(p.id);
  if (!fresh) return;
  const u = (fresh.usage as Usage) || {};
  const usage: Usage = {
    requests: (u.requests || 0) + 1, inputTokens: (u.inputTokens || 0) + (r?.inputTokens || 0),
    outputTokens: (u.outputTokens || 0) + (r?.outputTokens || 0), errors: (u.errors || 0) + (error ? 1 : 0), lastUsedAt: new Date().toISOString(),
  };
  await db.update(providers).set({ usage, ...(error ? { lastError: error } : {}) }).where(eq(providers.id, p.id));
}

/** Server-side completion. Usage and errors are recorded against the provider. */
export async function chat(providerId: string, o: { system: string; user: string; maxTokens?: number }): Promise<ChatResult> {
  const p = await getProvider(providerId);
  if (!p) throw new Error("The AI provider for this project no longer exists.");
  const s = await getSettings();
  try {
    const r = await rawChat(p, { system: o.system, user: o.user, maxTokens: o.maxTokens ?? s.aiMaxTokens, temperature: s.aiTemperature, timeoutMs: s.aiTimeoutSec * 1000 });
    if (!r.text.trim()) throw new ProviderError("The provider returned an empty response.");
    await recordUsage(p, r);
    return r;
  } catch (e) {
    await recordUsage(p, null, (e as Error).message);
    throw e;
  }
}

/** Real connection test: authenticates, discovers models and, when a model is chosen, runs a one-line completion. */
export async function testProvider(id: string) {
  const p = await getProvider(id);
  if (!p) throw new Error("Provider not found");
  const db = await getDb();
  const done = async (patch: Partial<ProviderRow>) => {
    await db.update(providers).set({ ...patch, lastTestedAt: new Date(), updatedAt: new Date() }).where(eq(providers.id, id));
    return (await getProvider(id))!;
  };
  if (!p.keyEnc && p.kind !== "custom") return done({ status: "failed", lastError: "No API key saved." });
  let models: string[] = [];
  let discoveryNote = "";
  try {
    models = (await discoverModels(p)).sort();
  } catch (e) {
    const err = e as ProviderError;
    // A custom endpoint may not implement /models; fall through to the completion test if a model was typed in.
    if (!(p.kind === "custom" && p.model && err.status !== 401 && err.status !== 403)) {
      return done({ status: "failed", lastError: err.message, isDefault: false });
    }
    discoveryNote = "Model discovery is not available on this endpoint.";
  }
  const patch: Partial<ProviderRow> = { models };
  if (!p.model) {
    return done({ ...patch, status: "needs_model", lastError: models.length ? "Key accepted. Choose a model, save and test again." : `${discoveryNote} Enter a model id, save and test again.`.trim() });
  }
  try {
    const r = await rawChat(p, { system: "You are a connection test.", user: "Reply with the single word: OK", maxTokens: 16, temperature: 0, timeoutMs: 30000 });
    await recordUsage(p, r);
    const anyDefault = (await listProviders()).some((x) => x.isDefault && x.id !== id && x.status === "connected");
    return done({ ...patch, status: "connected", lastError: null, ...(anyDefault ? {} : { isDefault: true }) });
  } catch (e) {
    return done({ ...patch, status: "failed", lastError: `Model "${p.model}": ${(e as Error).message}`, isDefault: false });
  }
}

/** Every stored secret in plaintext, for the pre-export leak scan only. Never sent anywhere. */
export async function allSecretsForScan(): Promise<string[]> {
  return (await listProviders()).map((p) => (p.keyEnc ? keyOf(p) : "")).filter((k) => k.length >= 8);
}
