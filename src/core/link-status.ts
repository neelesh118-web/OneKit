/**
 * Link status inspector — honest, 100% local heuristics. It does NOT ping
 * URLs (that needs a network and would be a tracking foot-gun); it checks
 * the URL's own structure for the failure modes that are visible locally:
 * bad protocols, empty hosts, spaces, broken percent-encoding, missing
 * schemes, mailto/tel traps, and obvious placeholder links.
 */

export interface LinkStatus {
  ok: boolean;
  /** Human-readable summary of what's wrong (empty when ok). */
  problems: string[];
  /** Parsed URL parts when the URL parsed. */
  parsed?: { scheme: string; host: string; path: string };
}

export function inspectLink(raw: string): LinkStatus {
  const url = raw.trim();
  const problems: string[] = [];
  if (!url) return { ok: false, problems: ["Empty link."] };
  if (/\s/.test(url)) problems.push("Contains spaces (almost always broken).");
  if (url.length > 2048) problems.push("Longer than 2048 characters — many servers reject it.");

  // Explicitly check for placeholder examples.
  if (/example\.com|yourdomain|your-site|domain\.com|replace-?me|placeholder/i.test(url)) {
    problems.push("Looks like a placeholder example URL.");
  }

  let parsed: URL | null = null;
  try {
    parsed = new URL(url);
  } catch {
    // Fall through — the heuristics below explain why.
  }

  if (!parsed) {
    // Try to diagnose: missing scheme vs totally malformed.
    if (/^[a-z][a-z0-9+.-]*:/i.test(url)) {
      problems.push("The scheme parses but the rest of the URL is malformed.");
    } else {
      problems.push("Missing a scheme — should start with http:// or https://.");
    }
    return { ok: false, problems };
  }

  const scheme = parsed.protocol.replace(":", "");
  const host = parsed.hostname;
  const path = parsed.pathname;

  if (!/^https?$/.test(scheme)) {
    if (scheme === "mailto" || scheme === "tel") {
      problems.push(`${scheme}: is a contact link, not a web page — expected behavior.`);
    } else {
      problems.push(`Non-http scheme "${scheme}:" — most browsers won't open it as a page.`);
    }
  }
  if (!host) problems.push("No hostname in the URL.");
  if (host === "localhost" || /\.local$/.test(host)) {
    problems.push("Local-only hostname — won't work for other visitors.");
  }
  if (/%[^0-9a-f]{2}|%[0-9a-f]{1}$/i.test(path)) problems.push("Broken percent-encoding in the path.");
  if (/#$/.test(url)) problems.push("Empty fragment (trailing #).");
  if (/(\.\.\/){3,}/.test(path)) problems.push("Very deep ../ path — likely a build artifact.");
  if (/\/{3,}/.test(url)) problems.push("Multiple consecutive slashes — often a paste error.");

  return {
    ok: problems.length === 0,
    problems,
    parsed: { scheme, host, path }
  };
}
