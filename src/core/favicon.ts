/**
 * Favicon extractor — resolve a page's icon URL from its <link> tags
 * (falling back to /favicon.ico) and derive a sensible save filename.
 * The actual byte fetch happens in the content script (host permissions).
 */

export function faviconUrlFromDocument(doc: Document, locationHref: string): string | null {
  const rels = ["icon", "shortcut icon", "apple-touch-icon", "apple-touch-icon-precomposed"];
  const links = Array.from(doc.querySelectorAll<HTMLLinkElement>("link[rel]"));
  for (const rel of rels) {
    const link = links.find(
      (l) => (l.rel ?? "").toLowerCase().trim() === rel || (l.rel ?? "").toLowerCase().split(/\s+/).includes(rel)
    );
    const href = link?.getAttribute("href");
    if (href) {
      try {
        return new URL(href, locationHref).href;
      } catch {
        // Keep looking.
      }
    }
  }
  try {
    return new URL("/favicon.ico", locationHref).href;
  } catch {
    return null;
  }
}

/** Extracts the file extension from a URL ("ico", "png", …). */
export function faviconExtension(url: string): string {
  try {
    const path = new URL(url).pathname;
    const match = /\.([a-z0-9]{2,5})$/i.exec(path);
    return match?.[1]?.toLowerCase() ?? "ico";
  } catch {
    return "ico";
  }
}

/** "example.com-icon" — safe for any host. */
export function faviconFilename(host: string): string {
  return `${host.replace(/[^a-z0-9.-]/gi, "_")}-icon`;
}
