/**
 * UF NaviGator Toolkit client (OpenAI-compatible).
 *
 * The API key lives ONLY in this browser's localStorage. It is never written into
 * mosaics, gallery entries, exports, CSV manifests, URLs, logs or error messages.
 */

/** Upstream NaviGator Toolkit (OpenAI-compatible) base URL. */
export const NAVIGATOR_UPSTREAM_URL = "https://api.ai.it.ufl.edu/v1";

/**
 * Requests go through a same-origin proxy route because the NaviGator API does
 * not return CORS headers — a direct browser fetch always fails.
 */
export const NAVIGATOR_BASE_URL = "/api/navigator";

const NAVIGATOR_API_KEY = "cosmic-collage.navigator.api-key";
const NAVIGATOR_MODEL = "cosmic-collage.navigator.model";
const NAVIGATOR_CONSENT = "cosmic-collage.navigator.consent.v1";

/** Models we prefer for multimodal structural comparison, best first. */
export const PREFERRED_MODELS = [
  "gpt-4o",
  "gpt-4.1",
  "gpt-4o-mini",
  "gpt-4.1-mini",
  "llama-4-maverick",
  "llama-3.2-90b-vision-instruct",
  "llava",
];

const VISION_HINTS = ["gpt-4o", "gpt-4.1", "gpt-5", "vision", "llava", "maverick", "scout", "pixtral", "gemma-3"];

function isBrowser() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function getNavigatorApiKey(): string | null {
  if (!isBrowser()) return null;
  const v = window.localStorage.getItem(NAVIGATOR_API_KEY);
  return v && v.trim() ? v.trim() : null;
}

export function setNavigatorApiKey(key: string) {
  if (!isBrowser()) return;
  window.localStorage.setItem(NAVIGATOR_API_KEY, key.trim());
}

export function clearNavigatorApiKey() {
  if (!isBrowser()) return;
  window.localStorage.removeItem(NAVIGATOR_API_KEY);
}

export function getNavigatorModel(): string {
  if (!isBrowser()) return "auto";
  return window.localStorage.getItem(NAVIGATOR_MODEL) ?? "auto";
}

export function setNavigatorModel(model: string) {
  if (!isBrowser()) return;
  window.localStorage.setItem(NAVIGATOR_MODEL, model);
}

export function hasNavigatorConsent(): boolean {
  return isBrowser() && window.localStorage.getItem(NAVIGATOR_CONSENT) === "yes";
}

export function grantNavigatorConsent() {
  if (isBrowser()) window.localStorage.setItem(NAVIGATOR_CONSENT, "yes");
}

/* ------------------------------------------------------------------ */
/* errors                                                              */
/* ------------------------------------------------------------------ */

export type NavigatorErrorKind =
  | "no-key"
  | "auth"
  | "rate-limit"
  | "timeout"
  | "network"
  | "unavailable"
  | "model"
  | "invalid-response";

export class NavigatorError extends Error {
  kind: NavigatorErrorKind;
  constructor(kind: NavigatorErrorKind, message: string) {
    // messages are human-readable only; a key is never interpolated into them
    super(message);
    this.name = "NavigatorError";
    this.kind = kind;
  }
}

export function isRetryable(err: unknown): boolean {
  if (!(err instanceof NavigatorError)) return false;
  return err.kind === "rate-limit" || err.kind === "timeout" || err.kind === "network" || err.kind === "unavailable";
}

function errorForStatus(status: number): NavigatorError {
  if (status === 401 || status === 403)
    return new NavigatorError("auth", "NaviGator rejected the API key.");
  if (status === 404) return new NavigatorError("model", "The selected NaviGator model is unavailable.");
  if (status === 429) return new NavigatorError("rate-limit", "NaviGator rate limit reached.");
  if (status >= 500) return new NavigatorError("unavailable", "NaviGator service is unavailable.");
  return new NavigatorError("network", `NaviGator request failed (${status}).`);
}

/* ------------------------------------------------------------------ */
/* requests                                                            */
/* ------------------------------------------------------------------ */

interface RequestOptions {
  method: string;
  body?: string;
  headers?: Record<string, string>;
  timeoutMs?: number | undefined;
  signal?: AbortSignal | null | undefined;
}

async function request(path: string, init: RequestOptions): Promise<unknown> {
  const key = getNavigatorApiKey();
  if (!key) throw new NavigatorError("no-key", "No NaviGator API key is configured in this browser.");

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), init.timeoutMs ?? 90_000);
  const onOuterAbort = () => controller.abort();
  init.signal?.addEventListener("abort", onOuterAbort);

  try {
    const res = await fetch(`${NAVIGATOR_BASE_URL}${path}`, {
      method: init.method,
      ...(init.body === undefined ? {} : { body: init.body }),
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
        ...(init.headers ?? {}),
      },
    });
    if (!res.ok) throw errorForStatus(res.status);
    return (await res.json()) as unknown;
  } catch (err) {
    if (err instanceof NavigatorError) throw err;
    if (init.signal?.aborted) throw new NavigatorError("timeout", "Request cancelled.");
    if (err instanceof DOMException && err.name === "AbortError")
      throw new NavigatorError("timeout", "NaviGator request timed out.");
    throw new NavigatorError("network", "Could not reach NaviGator Toolkit.");
  } finally {
    window.clearTimeout(timeout);
    init.signal?.removeEventListener("abort", onOuterAbort);
  }
}

export interface NavigatorModel {
  id: string;
  visionLikely: boolean;
}

export async function listModels(signal?: AbortSignal | null): Promise<NavigatorModel[]> {
  const json = (await request("/models", { method: "GET", timeoutMs: 20_000, signal })) as {
    data?: Array<{ id?: unknown }>;
  };
  const ids = (json.data ?? [])
    .map((m) => (typeof m.id === "string" ? m.id : null))
    .filter((v): v is string => !!v);
  return ids
    .map((id) => ({ id, visionLikely: VISION_HINTS.some((h) => id.toLowerCase().includes(h)) }))
    .sort((a, b) => Number(b.visionLikely) - Number(a.visionLikely) || a.id.localeCompare(b.id));
}

/** Test the stored key. Returns the model list on success. */
export async function testConnection(signal?: AbortSignal | null) {
  const models = await listModels(signal);
  return { ok: true as const, models };
}

let resolvedAutoModel: string | null = null;

/** Resolve the model to use: an explicit choice, or the best available vision model. */
export async function resolveModel(signal?: AbortSignal | null): Promise<string> {
  const chosen = getNavigatorModel();
  if (chosen && chosen !== "auto") return chosen;
  if (resolvedAutoModel) return resolvedAutoModel;
  const models = await listModels(signal);
  const ids = models.map((m) => m.id);
  const preferred =
    PREFERRED_MODELS.find((p) => ids.includes(p)) ??
    PREFERRED_MODELS.map((p) => ids.find((id) => id.includes(p))).find((v): v is string => !!v) ??
    models.find((m) => m.visionLikely)?.id ??
    ids[0];
  if (!preferred) throw new NavigatorError("model", "No NaviGator models are available for this key.");
  resolvedAutoModel = preferred;
  return preferred;
}

export function forgetResolvedModel() {
  resolvedAutoModel = null;
}

export interface VisionRequest {
  system: string;
  prompt: string;
  /** JPEG data URLs of reduced-resolution analysis images. */
  images: string[];
  signal?: AbortSignal | null;
  timeoutMs?: number;
  maxTokens?: number;
}

/** Multimodal chat request returning parsed JSON from the model's reply. */
export async function visionJson<T>(req: VisionRequest, parse: (value: unknown) => T): Promise<T> {
  const model = await resolveModel(req.signal);
  const json = (await request("/chat/completions", {
    method: "POST",
    signal: req.signal,
    timeoutMs: req.timeoutMs ?? 90_000,
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: req.maxTokens ?? 900,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: req.system },
        {
          role: "user",
          content: [
            { type: "text", text: req.prompt },
            ...req.images.map((url) => ({ type: "image_url", image_url: { url } })),
          ],
        },
      ],
    }),
  })) as { choices?: Array<{ message?: { content?: unknown } }> };

  const content = json.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim())
    throw new NavigatorError("invalid-response", "NaviGator returned an empty response.");

  const raw = extractJson(content);
  if (raw === null) throw new NavigatorError("invalid-response", "NaviGator did not return JSON.");
  try {
    return parse(raw);
  } catch {
    throw new NavigatorError("invalid-response", "NaviGator returned JSON in an unexpected shape.");
  }
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced?.[1] ?? text).trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(body.slice(start, end + 1)) as unknown;
  } catch {
    return null;
  }
}

/** A small concurrency-limited queue with exponential backoff for transient errors. */
export async function runQueue<I, O>(
  items: I[],
  worker: (item: I, index: number) => Promise<O>,
  opts: { concurrency?: number; retries?: number; signal?: AbortSignal | null } = {},
): Promise<Array<O | null>> {
  const concurrency = Math.max(1, opts.concurrency ?? 2);
  const retries = opts.retries ?? 2;
  const out = new Array<O | null>(items.length).fill(null);
  let cursor = 0;

  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    for (;;) {
      if (opts.signal?.aborted) return;
      const i = cursor++;
      if (i >= items.length) return;
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          out[i] = await worker(items[i]!, i);
          break;
        } catch (err) {
          if (opts.signal?.aborted) return;
          // never retry authentication problems
          if (!isRetryable(err) || attempt === retries) break;
          await new Promise((r) => setTimeout(r, 600 * 2 ** attempt + Math.random() * 250));
        }
      }
    }
  });

  await Promise.all(runners);
  return out;
}
