/**
 * Page meta inspector — title, meta description, Open Graph tags,
 * canonical link, and H1 headings, read straight from the DOM. The
 * SEO/dev quick-check that needs no network.
 */

export interface PageMeta {
  title: string;
  description: string;
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  canonical: string;
  language: string;
  h1s: string[];
  missing: string[];
}

function metaContent(doc: Document, name: string): string {
  const el = doc.querySelector<HTMLMetaElement>(`meta[name="${name}"], meta[property="${name}"]`);
  return el?.getAttribute("content")?.trim() ?? "";
}

export function pageMetaFromDocument(doc: Document, locationHref: string): PageMeta {
  const title = (doc.title || "").trim();
  const description = metaContent(doc, "description");
  const ogTitle = metaContent(doc, "og:title");
  const ogDescription = metaContent(doc, "og:description");
  const ogImage = metaContent(doc, "og:image");
  const canonicalEl = doc.querySelector<HTMLLinkElement>("link[rel='canonical']");
  let canonical = canonicalEl?.getAttribute("href")?.trim() ?? "";
  if (canonical) {
    try {
      canonical = new URL(canonical, locationHref).href;
    } catch {
      // Keep the raw value.
    }
  }
  const language = doc.documentElement.lang?.trim() ?? "";
  const h1s = Array.from(doc.querySelectorAll<HTMLElement>("h1"))
    .map((h) => (h.textContent ?? "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 8);

  const missing: string[] = [];
  if (!title) missing.push("title");
  if (!description) missing.push("meta description");
  if (!ogTitle) missing.push("og:title");
  if (!ogImage) missing.push("og:image");
  if (!canonical) missing.push("canonical");

  return { title, description, ogTitle, ogDescription, ogImage, canonical, language, h1s, missing };
}

/** Markdown summary for copy-to-clipboard. */
export function pageMetaToMarkdown(meta: PageMeta): string {
  const lines: string[] = [];
  if (meta.title) lines.push(`# ${meta.title}`);
  if (meta.description) lines.push(`**Description:** ${meta.description}`);
  if (meta.ogTitle) lines.push(`**og:title:** ${meta.ogTitle}`);
  if (meta.ogDescription) lines.push(`**og:description:** ${meta.ogDescription}`);
  if (meta.ogImage) lines.push(`**og:image:** ${meta.ogImage}`);
  if (meta.canonical) lines.push(`**Canonical:** ${meta.canonical}`);
  if (meta.language) lines.push(`**Language:** ${meta.language}`);
  if (meta.h1s.length > 0) lines.push("", "**H1s:**", ...meta.h1s.map((h) => `- ${h}`));
  if (meta.missing.length > 0) lines.push("", `**Missing:** ${meta.missing.join(", ")}`);
  return lines.join("\n");
}
