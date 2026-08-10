/**
 * API tester core — validates and builds a fetch request from a form
 * (method, URL, headers, body) and formats the response readout. The
 * actual fetch runs in the popup with the extension's <all_urls> host
 * permission; everything here is pure and testable.
 */

export type ApiMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD";

export const API_METHODS: ApiMethod[] = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"];

export interface ApiRequestSpec {
  method: ApiMethod;
  url: string;
  headersText: string;
  bodyText: string;
}

export type ApiRequestBuild =
  | { ok: true; url: string; init: RequestInit }
  | { ok: false; error: string };

/** Parses "Name: value" lines into a headers record (first wins). */
export function parseHeaderLines(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const idx = trimmed.indexOf(":");
    if (idx <= 0) continue;
    const name = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (name && out[name.toLowerCase()] === undefined) out[name.toLowerCase()] = value;
  }
  return out;
}

export function buildApiRequest(spec: ApiRequestSpec): ApiRequestBuild {
  let url: URL;
  try {
    url = new URL(spec.url.trim());
  } catch {
    return { ok: false, error: "That's not a valid URL — include the scheme (e.g. https://api.example.com/…)." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "Only http(s) URLs are supported." };
  }
  const headers = parseHeaderLines(spec.headersText);
  const init: RequestInit = { method: spec.method, headers };
  const body = spec.bodyText.trim();
  if (spec.method !== "GET" && spec.method !== "HEAD" && body) {
    if (!headers["content-type"] && (body.startsWith("{") || body.startsWith("["))) {
      headers["content-type"] = "application/json";
    }
    init.body = body;
  } else if (body) {
    return { ok: false, error: "GET/HEAD requests can't carry a body — use POST, PUT, PATCH or DELETE." };
  }
  if (body && body.startsWith("{") || body.startsWith("[")) {
    try {
      JSON.parse(body);
    } catch {
      return { ok: false, error: "The body looks like JSON but doesn't parse — fix the syntax first." };
    }
  }
  return { ok: true, url: url.toString(), init };
}

/** Formats the response readout (status, timing, body). */
export function formatApiResponse(
  status: number,
  statusText: string,
  durationMs: number,
  bodyText: string
): string {
  const ok = status >= 200 && status < 300;
  const head = `${status} ${statusText || (ok ? "OK" : "Error")} · ${durationMs} ms`;
  const preview = bodyText.trim() || "(empty body)";
  const truncated = preview.length > 2000 ? `${preview.slice(0, 2000)}\n… (truncated)` : preview;
  return `${head}\n\n${truncated}`;
}
