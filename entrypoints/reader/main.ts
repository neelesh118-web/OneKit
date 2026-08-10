import { extractArticle } from "../../src/core/reader-extract";
import { listReadLater, markReadLater } from "../../src/core/read-later-store";
import { localStorageArea } from "../../src/core/storage-utils";

/**
 * OneKit Reader — opens a URL in a clean, distraction-free view. Fetches
 * the page (extension host permission), extracts the article locally, and
 * renders it. All on-device; the only network call is fetching the page
 * the user explicitly asked to read.
 */

const $ = (id: string): HTMLElement => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Missing element #${id}`);
  return el;
};

const article = $("article");
const status = $("status");
const meta = $("meta");

function applyTheme(): void {
  const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  document.documentElement.dataset.theme = dark ? "dark" : "light";
}

function urlFromQuery(): string | null {
  const params = new URLSearchParams(window.location.search);
  const raw = params.get("url");
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.href : null;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  applyTheme();

  const target = urlFromQuery();
  if (!target) {
    status.textContent = "No page to read. Use right-click → “OneKit — Open clean reader” on a page.";
    return;
  }

  meta.textContent = target;
  status.textContent = "Fetching the page…";
  try {
    const response = await fetch(target, { credentials: "omit" });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const html = await response.text();
    status.textContent = "Extracting the article…";
    const result = extractArticle(html, target);

    article.innerHTML = "";
    const heading = document.createElement("h1");
    heading.textContent = result.title;
    const urlLine = document.createElement("p");
    urlLine.className = "article-url";
    urlLine.textContent = target;
    const body = document.createElement("div");
    body.className = "article-body";
    body.textContent = result.text;
    article.append(heading, urlLine, body);
    meta.textContent = `${result.title} — ${result.wordCount.toLocaleString()} words · ~${result.readingMinutes} min read`;

    // Mark saved read-later items as read when opened here.
    void (async () => {
      try {
        const items = await listReadLater(localStorageArea());
        const item = items.find((i) => i.url === target);
        if (item) await markReadLater(localStorageArea(), item.id, true);
      } catch {
        // Non-fatal.
      }
    })();
  } catch (error) {
    status.textContent =
      error instanceof Error
        ? `Could not load the page: ${error.message}. Some sites block automated fetching — try the original link.`
        : "Could not load the page.";
  }
}

$("back").addEventListener("click", () => {
  if (window.history.length > 1) window.history.back();
  else window.close();
});

$("download").addEventListener("click", () => {
  const heading = article.querySelector("h1")?.textContent ?? "article";
  const body = article.querySelector(".article-body")?.textContent ?? "";
  const text = `# ${heading}\n\n${body}\n`;
  const blob = new Blob([text], { type: "text/markdown;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${heading.slice(0, 60).replace(/[\\/:*?"<>|]/g, "")}.md`;
  a.click();
  URL.revokeObjectURL(a.href);
});

let fontSize = 17;
$("font-plus").addEventListener("click", () => {
  fontSize = Math.min(26, fontSize + 1);
  article.style.fontSize = `${fontSize}px`;
});
$("font-minus").addEventListener("click", () => {
  fontSize = Math.max(13, fontSize - 1);
  article.style.fontSize = `${fontSize}px`;
});

void main();
