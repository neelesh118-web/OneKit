/**
 * Open all links — collect every http(s) link on a page, deduplicate, and
 * cap the batch so one misbehaving page can't open 200 tabs.
 */

export interface OpenLinksOptions {
  /** Exclude links on the same origin as the page (default false). */
  excludeSameOrigin?: boolean;
  /** Maximum links to return (default 25 — the browser caps the blast). */
  max?: number;
  /** Exclude mailto:/tel:/javascript: etc. automatically. */
}

export function collectPageLinks(
  hrefs: string[],
  pageUrl: string,
  options: OpenLinksOptions = {}
): { links: string[]; dropped: number } {
  const max = options.max ?? 25;
  let pageOrigin = "";
  try {
    pageOrigin = new URL(pageUrl).origin;
  } catch {
    // Page URL unparsable — treat every link as external.
  }
  const seen = new Set<string>();
  const links: string[] = [];
  let dropped = 0;
  for (const raw of hrefs) {
    const href = raw.trim();
    if (!href) continue;
    let absolute: string;
    try {
      absolute = new URL(href, pageUrl).href;
    } catch {
      dropped++;
      continue;
    }
    const proto = new URL(absolute).protocol;
    if (proto !== "http:" && proto !== "https:") {
      dropped++;
      continue;
    }
    if (options.excludeSameOrigin && new URL(absolute).origin === pageOrigin) continue;
    if (seen.has(absolute)) continue;
    seen.add(absolute);
    links.push(absolute);
    if (links.length >= max) {
      dropped += hrefs.length - (hrefs.indexOf(raw) + 1);
      break;
    }
  }
  return { links, dropped };
}
