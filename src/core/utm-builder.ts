/**
 * UTM link builder — append Google Analytics campaign parameters to any
 * URL. Pure URL math: existing query params are preserved, existing utm_*
 * params are replaced, and the result is validated.
 */

export interface UtmFields {
  source: string;
  medium: string;
  campaign: string;
  term?: string;
  content?: string;
}

export const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"] as const;

export function validateBaseUrl(raw: string): { ok: true; url: URL } | { ok: false; error: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: "Paste a URL first." };
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { ok: false, error: "Only http/https URLs can carry UTM params." };
    }
    return { ok: true, url };
  } catch {
    return { ok: false, error: "That doesn't look like a valid URL — include the https:// part." };
  }
}

/** Builds the query params, dropping empty fields. */
export function utmParams(fields: UtmFields): Record<string, string> {
  const params: Record<string, string> = {};
  const entries: Array<[string, string | undefined]> = [
    ["utm_source", fields.source.trim()],
    ["utm_medium", fields.medium.trim()],
    ["utm_campaign", fields.campaign.trim()],
    ["utm_term", fields.term?.trim()],
    ["utm_content", fields.content?.trim()]
  ];
  for (const [key, value] of entries) {
    if (value) params[key] = value;
  }
  return params;
}

export function requiredFieldsMissing(fields: UtmFields): string | null {
  if (!fields.source.trim()) return "utm_source is required.";
  if (!fields.medium.trim()) return "utm_medium is required.";
  if (!fields.campaign.trim()) return "utm_campaign is required.";
  return null;
}

/** Appends the UTM params to a validated base URL, replacing old utm_*. */
export function buildUtmUrl(raw: string, fields: UtmFields): { ok: true; url: string } | { ok: false; error: string } {
  const check = validateBaseUrl(raw);
  if (!check.ok) return check;
  const missing = requiredFieldsMissing(fields);
  if (missing) return { ok: false, error: missing };
  const url = check.url;
  for (const key of UTM_KEYS) url.searchParams.delete(key);
  for (const [key, value] of Object.entries(utmParams(fields))) {
    url.searchParams.set(key, value);
  }
  return { ok: true, url: url.toString() };
}
