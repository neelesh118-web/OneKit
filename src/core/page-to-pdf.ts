/**
 * Page → PDF — one-click "save this page as PDF". OneKit's honest approach:
 * it extracts the page's article, opens the print-friendly reader in a new
 * tab, and triggers the browser's own print dialog (Save as PDF). The
 * dialog is the browser's — OneKit doesn't render the PDF itself — and the
 * result is a clean, readable PDF with the page's real content.
 */

export interface PagePdfResult {
  ok: boolean;
  message: string;
}

/**
 * Builds the reader URL and the command to trigger print. Returns the URL
 * for the caller to open in a tab; `&print=1` makes the reader auto-print.
 */
export function pageToPdfUrl(pageUrl: string, readerBase: string): string | null {
  if (!/^https?:/.test(pageUrl)) return null;
  return `${readerBase}?url=${encodeURIComponent(pageUrl)}&print=1`;
}

/** A pure filename builder so tests don't need Date. */
export function pdfFilename(title: string, now: number): string {
  const safe = title.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "page";
  return `${safe}-${new Date(now).toISOString().slice(0, 10)}.pdf`;
}
