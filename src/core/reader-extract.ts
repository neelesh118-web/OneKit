/**
 * Clean reader — extracts the main article content from any HTML page.
 * Heuristic, local, no network: prefers <article>/<main>, then scores
 * candidate blocks by text density. Honest about limits: it is not a
 * perfect extractor, but it removes the chrome (navs, ads, sidebars).
 */

export interface ReaderArticle {
  title: string;
  url: string;
  text: string;
  wordCount: number;
  readingMinutes: number;
}

const WORDS_PER_MINUTE = 200;

export function countWords(text: string): number {
  const matches = text.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu);
  return matches ? matches.length : 0;
}

export function readingMinutes(wordCount: number): number {
  return Math.max(1, Math.round(wordCount / WORDS_PER_MINUTE));
}

const STRIP_SELECTOR = [
  "script",
  "style",
  "noscript",
  "nav",
  "header",
  "footer",
  "aside",
  "form",
  "iframe",
  "svg",
  "canvas",
  "[role='navigation']",
  "[role='banner']",
  "[role='complementary']",
  "[aria-hidden='true']",
  ".advertisement",
  ".ad",
  ".ads",
  ".cookie-banner",
  ".newsletter",
  ".share-buttons",
  ".comments"
].join(",");

/** Scores an element as article content: text density minus penalty junk. */
function scoreElement(el: Element): number {
  const clone = el.cloneNode(true) as Element;
  for (const junk of clone.querySelectorAll(STRIP_SELECTOR)) junk.remove();
  const text = (clone.textContent ?? "").replace(/\s+/g, " ").trim();
  const chars = text.length;
  if (chars < 200) return 0;
  const paragraphs = clone.querySelectorAll("p").length;
  const links = clone.querySelectorAll("a").length;
  let score = chars;
  score += paragraphs * 80;
  score -= links * 15;
  // Penalize shallow containers that are mostly links.
  const linkChars = [...clone.querySelectorAll("a")].reduce(
    (n, a) => n + (a.textContent ?? "").length,
    0
  );
  if (chars > 0) score -= (linkChars / chars) * chars * 0.5;
  return score;
}

/** Extracts the article from parsed HTML. Falls back to the body text. */
export function extractArticleFromDocument(doc: Document, url: string): ReaderArticle {
  const title =
    doc.querySelector("h1")?.textContent?.replace(/\s+/g, " ").trim() ??
    doc.title?.trim() ??
    url;

  let best: Element | null = null;
  let bestScore = 0;
  for (const candidate of doc.querySelectorAll("article, main, [role='main'], .content, .post, .entry-content, body")) {
    const score = scoreElement(candidate);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  const container = best ?? doc.body;
  const clone = container.cloneNode(true) as Element;
  for (const junk of clone.querySelectorAll(STRIP_SELECTOR)) junk.remove();
  const text = (clone.textContent ?? "")
    .replace(/\s+/g, " ")
    .trim()
    // Collapse repeated blank space runs.
    .replace(/ {2,}/g, " ");

  const wordCount = countWords(text);
  return {
    title,
    url,
    text,
    wordCount,
    readingMinutes: readingMinutes(wordCount)
  };
}

/** Parses raw HTML (works in browsers and jsdom). */
export function extractArticle(html: string, url: string): ReaderArticle {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return extractArticleFromDocument(doc, url);
}
