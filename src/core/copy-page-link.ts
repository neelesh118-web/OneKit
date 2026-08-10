/**
 * Copy page link — the current page's title + URL in the three formats
 * people paste into: Markdown, HTML, and plain "Title - URL".
 */

export function pageLinkMarkdown(title: string, url: string): string {
  const cleanTitle = title.trim() || url;
  return `[${cleanTitle}](${url})`;
}

export function pageLinkHtml(title: string, url: string): string {
  const cleanTitle = title.trim() || url;
  const esc = cleanTitle.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const escUrl = url.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  return `<a href="${escUrl}">${esc}</a>`;
}

export function pageLinkPlain(title: string, url: string): string {
  return `${title.trim() || url} - ${url}`;
}

export interface PageLinkFormats {
  markdown: string;
  html: string;
  plain: string;
}

export function buildPageLinkFormats(title: string, url: string): PageLinkFormats {
  return {
    markdown: pageLinkMarkdown(title, url),
    html: pageLinkHtml(title, url),
    plain: pageLinkPlain(title, url)
  };
}
