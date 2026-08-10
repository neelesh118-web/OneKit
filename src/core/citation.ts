/**
 * Citation generator — formats the current page as an APA, MLA or Chicago
 * (notes-bibliography) web citation, 100% locally from page metadata.
 * Honest about limits: it formats what's known (title, site, URL, access
 * date, authors) and never fabricates missing details like volume/page.
 */

export type CitationStyle = "apa" | "mla" | "chicago";

export interface CitationSource {
  title: string;
  url: string;
  /** Site/brand name; falls back to the hostname. */
  siteName?: string;
  authors?: string[];
  /** Access date as ISO (YYYY-MM-DD); defaults to today. */
  accessedDate?: string;
}

export const CITATION_STYLES: { id: CitationStyle; label: string }[] = [
  { id: "apa", label: "APA" },
  { id: "mla", label: "MLA" },
  { id: "chicago", label: "Chicago" }
];

/** "example.com/path" → "Example". Best-effort site name. */
export function siteNameFromUrl(url: string): string {
  try {
    const host = new URL(url).hostname;
    const parts = host.split(".").filter((p) => p && p !== "www");
    const name = parts[0] ?? host;
    if (!name) return url;
    return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    return url;
  }
}

function formatDate(iso?: string): string {
  if (!iso) return "";
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function formatDateParts(iso?: string): { year: string; month: string; day: string } {
  const d = iso ? new Date(`${iso}T00:00:00`) : new Date();
  if (Number.isNaN(d.getTime())) return { year: "", month: "", day: "" };
  return {
    year: String(d.getFullYear()),
    month: d.toLocaleDateString("en-US", { month: "long" }),
    day: String(d.getDate())
  };
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** APA 7th ed. webpage citation. */
export function apaCitation(src: CitationSource): string {
  const accessed = formatDate(src.accessedDate ?? todayIso());
  const site = src.siteName || siteNameFromUrl(src.url);
  if (src.authors && src.authors.length > 0) {
    // Last, F. M. — keep it simple: first author "Last, First".
    const author = src.authors[0]!.split(/\s+/);
    const lastName = author.pop()!;
    const first = author.join(" ");
    const byline = first ? `${lastName}, ${first}.` : `${lastName}.`;
    return `${byline} (${new Date().getFullYear()}). ${src.title}. ${site}. Retrieved ${accessed}, from ${src.url}`;
  }
  return `${site}. (${new Date().getFullYear()}). ${src.title}. Retrieved ${accessed}, from ${src.url}`;
}

/** MLA 9th ed. webpage citation. */
export function mlaCitation(src: CitationSource): string {
  const { day, month, year } = formatDateParts(src.accessedDate);
  const date = year ? `${day} ${month} ${year}` : "";
  const site = src.siteName || siteNameFromUrl(src.url);
  if (src.authors && src.authors.length > 0) {
    const author = src.authors[0]!.split(/\s+/);
    const lastName = author.pop()!;
    const first = author.join(" ");
    const byline = first ? `${lastName}, ${first}.` : `${lastName}.`;
    return `${byline} "${src.title}." ${site}, ${date}, ${src.url}.`;
  }
  return `"${src.title}." ${site}, ${date}, ${src.url}.`;
}

/** Chicago 17th ed. (notes-bibliography) webpage citation. */
export function chicagoCitation(src: CitationSource): string {
  const accessed = formatDate(src.accessedDate ?? todayIso());
  const site = src.siteName || siteNameFromUrl(src.url);
  if (src.authors && src.authors.length > 0) {
    const author = src.authors[0]!.split(/\s+/);
    const lastName = author.pop()!;
    const first = author.join(" ");
    const byline = first ? `${lastName}, ${first}.` : `${lastName}.`;
    return `${byline} "${src.title}." ${site}. Accessed ${accessed}. ${src.url}.`;
  }
  return `"${src.title}." ${site}. Accessed ${accessed}. ${src.url}.`;
}

export function formatCitation(src: CitationSource, style: CitationStyle): string {
  if (!src.title.trim() || !src.url.trim()) {
    throw new Error("A page title and URL are needed to build a citation.");
  }
  switch (style) {
    case "apa":
      return apaCitation(src);
    case "mla":
      return mlaCitation(src);
    case "chicago":
      return chicagoCitation(src);
  }
}
