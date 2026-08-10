import {
  sortedTabIdsByDomain,
  tabIdsToClose,
  tabIdsToMerge,
  utilitiesSummary
} from "../core/tab-utilities";
import { closedTabLabel } from "../core/recent-closed";
import { buildPageLinkFormats } from "../core/copy-page-link";
import { lookupWord } from "../core/dictionary";
import { buildUtmUrl, type UtmFields } from "../core/utm-builder";
import { colorConversions, loremIpsum, randomUsername, uuidV4 } from "../core/generators";
import { faviconExtension, faviconFilename } from "../core/favicon";
import { collectPageLinks } from "../core/page-links";
import { pageMetaToMarkdown, type PageMeta } from "../core/page-meta";
import { urlsFromList, summarizeLinkResults, verdictFor, type LinkCheckResult } from "../core/link-checker";
import type { TabLike } from "../core/tab-tools";
import type { OneKitCapabilities } from "./capabilities";

/**
 * Tools & utilities round — tab utilities pack, recently closed tabs,
 * read-aloud + reader view, reading line, copy page link, dictionary
 * lookup, UTM builder, generator pack, favicon extractor, open all
 * links, page meta inspector, bulk link checker. All 100% local (the
 * link checker's HEAD/GET pings are the one network touch, same as the
 * existing link status inspector).
 */
export function createToolsUtilitiesController(caps: OneKitCapabilities): () => void {
  const $ = (id: string): HTMLElement => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Missing element #${id}`);
    return el;
  };
  const activeTab = async (): Promise<TabLike> => caps.getActiveTab();

  /* Tab utilities ----------------------------------------------------------- */
  const tuStatus = $("tu-status");

  $("tu-left").addEventListener("click", () => void runTabUtility("left"));
  $("tu-right").addEventListener("click", () => void runTabUtility("right"));
  $("tu-others").addEventListener("click", () => void runTabUtility("others"));
  $("tu-sort").addEventListener("click", () => void sortTabs());
  $("tu-merge").addEventListener("click", () => void mergeWindows());

  async function runTabUtility(direction: "left" | "right" | "others"): Promise<void> {
    const [tabs, active] = await Promise.all([caps.queryTabs(), activeTab()]);
    const ids = tabIdsToClose(tabs, active.id, direction);
    if (ids.length === 0) {
      tuStatus.textContent = direction === "others" ? "Only this tab is open (pinned tabs are kept)." : "Nothing to close in that direction (pinned tabs are kept).";
      return;
    }
    await caps.closeTabs(ids);
    tuStatus.textContent = `${ids.length} tab${ids.length === 1 ? "" : "s"} closed.`;
  }

  async function sortTabs(): Promise<void> {
    const tabs = await caps.queryTabs();
    const byWindow = new Map<number, TabLike[]>();
    for (const tab of tabs) {
      if (tab.windowId === undefined || tab.id === undefined) continue;
      const list = byWindow.get(tab.windowId) ?? [];
      list.push(tab);
      byWindow.set(tab.windowId, list);
    }
    let sorted = 0;
    for (const [windowId, windowTabs] of byWindow) {
      const ids = sortedTabIdsByDomain(windowTabs);
      if (ids.length > 1) {
        await caps.moveTabs(ids, 0, windowId);
        sorted += ids.length;
      }
    }
    tuStatus.textContent = sorted > 0 ? `Sorted ${sorted} tabs by domain.` : "Nothing to sort.";
  }

  async function mergeWindows(): Promise<void> {
    const [tabs, active] = await Promise.all([caps.queryTabs(), activeTab()]);
    const ids = tabIdsToMerge(tabs, active.windowId);
    if (ids.length === 0) {
      tuStatus.textContent = "All your tabs are already in this window.";
      return;
    }
    await caps.moveTabs(ids, -1, active.windowId);
    tuStatus.textContent = utilitiesSummary(0, 0, ids.length);
  }

  /* Recently closed tabs ----------------------------------------------------- */
  const rcList = $("rc-list");
  const rcStatus = $("rc-status");

  async function renderRecentlyClosed(): Promise<void> {
    const tabs = await caps.getRecentlyClosed();
    rcList.innerHTML = "";
    if (tabs.length === 0) {
      rcStatus.textContent = "No recently closed tabs yet — close one and it appears here.";
      return;
    }
    for (const tab of tabs) {
      const row = document.createElement("div");
      row.className = "result-row";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "mini-btn";
      button.textContent = "↩ Reopen";
      const text = document.createElement("span");
      text.textContent = closedTabLabel(tab);
      text.title = tab.url ?? "";
      text.style.flex = "1";
      text.style.overflow = "hidden";
      text.style.textOverflow = "ellipsis";
      text.style.whiteSpace = "nowrap";
      button.addEventListener("click", () => {
        if (tab.sessionId) void caps.restoreSession(tab.sessionId);
      });
      row.append(text, button);
      rcList.appendChild(row);
    }
    rcStatus.textContent = `${tabs.length} recently closed tab${tabs.length === 1 ? "" : "s"} (local session history).`;
  }
  $("rc-refresh").addEventListener("click", () => void renderRecentlyClosed());
  void renderRecentlyClosed();

  /* Read aloud + Reader view --------------------------------------------------- */
  const raStatus = $("ra-status");

  $("ra-read").addEventListener("click", () => {
    void (async () => {
      const tab = await activeTab();
      if (!tab.id) {
        raStatus.textContent = "Open a web page first.";
        return;
      }
      await caps.sendMessage(tab.id, { type: "ok:read-page" }).catch(() => {});
      raStatus.textContent = "Reading — click Stop to interrupt.";
    })();
  });
  $("ra-stop").addEventListener("click", () => {
    void (async () => {
      const tab = await activeTab();
      if (tab.id) await caps.sendMessage(tab.id, { type: "ok:read-stop" }).catch(() => {});
      raStatus.textContent = "Stopped.";
    })();
  });
  $("ra-reader").addEventListener("click", () => {
    void (async () => {
      const tab = await activeTab();
      if (!tab.url) {
        raStatus.textContent = "Open a web page first.";
        return;
      }
      await caps.openUrl(`${caps.readerUrl()}?url=${encodeURIComponent(tab.url)}`);
      raStatus.textContent = "Opened in Reader view.";
    })();
  });

  /* Reading line ---------------------------------------------------------------- */
  const rlStatus = $("rl-status");
  $("rl-toggle").addEventListener("click", () => {
    void (async () => {
      const tab = await activeTab();
      if (!tab.id) {
        rlStatus.textContent = "Open a web page first.";
        return;
      }
      const res = (await caps
        .sendMessage(tab.id, { type: "ok:reading-line-toggle", thickness: Number(($("rl-thickness") as HTMLInputElement).value) })
        .catch(() => null)) as { on?: boolean } | null;
      rlStatus.textContent = res?.on ? "Reading line on — move your cursor down the page." : "Reading line off.";
    })();
  });

  /* Copy page link ---------------------------------------------------------------- */
  const clkStatus = $("clk-status");
  const copyFormat = (format: "markdown" | "html" | "plain") => {
    void (async () => {
      const tab = await activeTab();
      if (!tab.url) {
        clkStatus.textContent = "Open a web page first.";
        return;
      }
      const formats = buildPageLinkFormats(tab.title ?? "", tab.url);
      await caps.copyText(formats[format]);
      clkStatus.textContent = `Copied as ${format} ✓`;
    })();
  };
  $("clk-md").addEventListener("click", () => copyFormat("markdown"));
  $("clk-html").addEventListener("click", () => copyFormat("html"));
  $("clk-plain").addEventListener("click", () => copyFormat("plain"));

  /* Dictionary lookup ----------------------------------------------------------------- */
  const dictInput = $("dict-input") as HTMLInputElement;
  const dictResult = $("dict-result");
  const dictStatus = $("dict-status");

  function dictLookup(): void {
    const word = dictInput.value.trim();
    dictResult.innerHTML = "";
    if (!word) {
      dictStatus.textContent = "Type a word first.";
      return;
    }
    const entry = lookupWord(word);
    if (!entry) {
      dictStatus.textContent = `“${word}” is not in the offline dictionary (it covers the most common everyday words).`;
      return;
    }
    const row = document.createElement("div");
    row.className = "result-row";
    const strong = document.createElement("strong");
    strong.className = "result-title";
    strong.textContent = `${entry.word} (${entry.partOfSpeech})`;
    const def = document.createElement("span");
    def.textContent = entry.definition;
    row.append(strong, def);
    dictResult.appendChild(row);
    dictStatus.textContent = "Found in the offline dictionary.";
  }
  $("dict-lookup").addEventListener("click", dictLookup);
  dictInput.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") dictLookup();
  });

  /* Generator pack --------------------------------------------------------------------- */
  const genOutput = $("gen-output");
  const genStatus = $("gen-status");

  function emitGenerated(label: string, value: string): void {
    genOutput.innerHTML = "";
    const row = document.createElement("div");
    row.className = "result-row";
    const text = document.createElement("span");
    text.textContent = `${label}: ${value}`;
    text.style.flex = "1";
    text.style.wordBreak = "break-all";
    const copy = document.createElement("button");
    copy.type = "button";
    copy.className = "mini-btn";
    copy.textContent = "Copy";
    copy.addEventListener("click", () => {
      void caps.copyText(value);
      genStatus.textContent = "Copied ✓";
    });
    row.append(text, copy);
    genOutput.appendChild(row);
    genStatus.textContent = "Generated locally.";
  }
  $("gen-uuid").addEventListener("click", () => emitGenerated("UUID", uuidV4()));
  $("gen-lorem").addEventListener("click", () => emitGenerated("Lorem ipsum", loremIpsum(30)));
  $("gen-user").addEventListener("click", () => emitGenerated("Username", randomUsername()));
  $("gen-color-btn").addEventListener("click", () => {
    const conversions = colorConversions(($("gen-color") as HTMLInputElement).value);
    if (!conversions) {
      genOutput.innerHTML = "";
      genStatus.textContent = "That isn't a valid hex color — try #ff0000.";
      return;
    }
    emitGenerated(
      "Color",
      `${conversions.hex} · ${conversions.rgb} · hsl(${conversions.hsl})`
    );
  });

  /* UTM builder ---------------------------------------------------------------------------- */
  const utmStatus = $("utm-status");
  $("utm-build").addEventListener("click", () => {
    void (async () => {
      const fields: UtmFields = {
        source: ($("utm-source") as HTMLInputElement).value,
        medium: ($("utm-medium") as HTMLInputElement).value,
        campaign: ($("utm-campaign") as HTMLInputElement).value,
        term: ($("utm-term") as HTMLInputElement).value,
        content: ($("utm-content") as HTMLInputElement).value
      };
      const result = buildUtmUrl(($("utm-url") as HTMLInputElement).value, fields);
      if (!result.ok) {
        utmStatus.textContent = result.error;
        return;
      }
      await caps.copyText(result.url);
      utmStatus.textContent = `Copied ✓ ${result.url}`;
    })();
  });

  /* Favicon extractor -------------------------------------------------------------------------- */
  const fvStatus = $("fv-status");
  $("fv-save").addEventListener("click", () => {
    void (async () => {
      const tab = await activeTab();
      if (!tab.id || !tab.url) {
        fvStatus.textContent = "Open a web page first.";
        return;
      }
      const res = (await caps.sendMessage(tab.id, { type: "ok:page-favicon" }).catch(() => null)) as {
        dataUrl?: string;
        href?: string;
        size?: number;
        error?: string;
      } | null;
      if (!res?.dataUrl) {
        fvStatus.textContent = res?.error ?? "Could not read this page's icon.";
        return;
      }
      const host = tab.url.replace(/^https?:\/\//, "").split(/[/?#]/)[0] ?? "page";
      const ext = res.href ? faviconExtension(res.href) : "png";
      caps.downloadDataUrl(res.dataUrl, `${faviconFilename(host)}.${ext}`);
      fvStatus.textContent = `Saved ${faviconFilename(host)}.${ext}${res.size ? ` (${Math.round(res.size / 1024)} KB)` : ""} ✓`;
    })();
  });

  /* Open all links -------------------------------------------------------------------------------- */
  const olStatus = $("ol-status");
  $("ol-open").addEventListener("click", () => {
    void (async () => {
      const tab = await activeTab();
      if (!tab.id || !tab.url) {
        olStatus.textContent = "Open a web page first.";
        return;
      }
      const res = (await caps
        .sendMessage(tab.id, { type: "ok:page-links" })
        .catch(() => null)) as { hrefs?: string[]; pageUrl?: string } | null;
      if (!res?.hrefs || res.hrefs.length === 0) {
        olStatus.textContent = "No links found on this page.";
        return;
      }
      const { links, dropped } = collectPageLinks(res.hrefs, res.pageUrl ?? tab.url, { max: 25 });
      if (links.length === 0) {
        olStatus.textContent = "No openable http(s) links on this page.";
        return;
      }
      const opened = await caps.openTabs(links);
      olStatus.textContent = `Opened ${opened} tab${opened === 1 ? "" : "s"}${dropped > 0 ? ` (${dropped} skipped: mailto/duplicates/over the 25 cap)` : ""}.`;
    })();
  });

  /* Page meta inspector ----------------------------------------------------------------------------- */
  const pmList = $("pm-list");
  const pmStatus = $("pm-status");
  let lastMeta: PageMeta | null = null;

  function renderMeta(meta: PageMeta): void {
    lastMeta = meta;
    pmList.innerHTML = "";
    const rows: Array<[string, string]> = [];
    if (meta.title) rows.push(["Title", meta.title]);
    if (meta.description) rows.push(["Description", meta.description]);
    if (meta.ogTitle) rows.push(["og:title", meta.ogTitle]);
    if (meta.ogDescription) rows.push(["og:description", meta.ogDescription]);
    if (meta.ogImage) rows.push(["og:image", meta.ogImage]);
    if (meta.canonical) rows.push(["Canonical", meta.canonical]);
    if (meta.language) rows.push(["Language", meta.language]);
    for (const [key, value] of rows) {
      const row = document.createElement("div");
      row.className = "result-row";
      const strong = document.createElement("strong");
      strong.className = "result-title";
      strong.textContent = key;
      const text = document.createElement("span");
      text.textContent = value;
      text.style.wordBreak = "break-all";
      row.append(strong, text);
      pmList.appendChild(row);
    }
    if (meta.h1s.length > 0) {
      const title = document.createElement("div");
      title.className = "result-title";
      title.textContent = `H1 headings (${meta.h1s.length})`;
      pmList.appendChild(title);
      for (const h1 of meta.h1s) {
        const row = document.createElement("div");
        row.className = "result-row";
        row.textContent = h1;
        pmList.appendChild(row);
      }
    }
    pmStatus.textContent =
      meta.missing.length > 0
        ? `Missing: ${meta.missing.join(", ")}.`
        : "All the basics are present ✓";
  }

  $("pm-inspect").addEventListener("click", () => {
    void (async () => {
      const tab = await activeTab();
      if (!tab.id) {
        pmStatus.textContent = "Open a web page first.";
        return;
      }
      const meta = (await caps.sendMessage(tab.id, { type: "ok:page-meta" }).catch(() => null)) as PageMeta | null;
      if (!meta) {
        pmStatus.textContent = "Could not read this page.";
        return;
      }
      renderMeta(meta);
    })();
  });
  $("pm-copy").addEventListener("click", () => {
    if (!lastMeta) {
      pmStatus.textContent = "Inspect the page first.";
      return;
    }
    void caps.copyText(pageMetaToMarkdown(lastMeta));
    pmStatus.textContent = "Copied as Markdown ✓";
  });

  /* Bulk link checker ---------------------------------------------------------------------------------- */
  const lcInput = $("lc-input") as HTMLTextAreaElement;
  const lcList = $("lc-list");
  const lcStatus = $("lc-status");

  $("lc-run").addEventListener("click", () => {
    void (async () => {
      const urls = urlsFromList(lcInput.value);
      if (urls.length === 0) {
        lcStatus.textContent = "Paste at least one URL first.";
        return;
      }
      lcStatus.textContent = `Checking ${urls.length} URL${urls.length === 1 ? "" : "s"}…`;
      lcList.innerHTML = "";
      const results = await caps.checkLinks(urls);
      lcList.innerHTML = "";
      for (const result of results) {
        renderLinkResult(result);
      }
      lcStatus.textContent = summarizeLinkResults(results);
    })();
  });

  function renderLinkResult(result: LinkCheckResult): void {
    const verdict = verdictFor(result);
    const row = document.createElement("div");
    row.className = "result-row";
    const text = document.createElement("span");
    text.textContent = `${result.status > 0 ? result.status : "—"} · ${result.url}`;
    text.style.flex = "1";
    text.style.overflow = "hidden";
    text.style.textOverflow = "ellipsis";
    text.style.whiteSpace = "nowrap";
    text.style.color =
      verdict === "ok" ? "var(--ok, #16a34a)" : verdict === "error" || verdict === "not-found" ? "var(--danger, #dc2626)" : "#d97706";
    const label = document.createElement("span");
    label.className = "result-meta";
    label.textContent = verdict;
    row.append(text, label);
    lcList.appendChild(row);
  }

  return () => {
    // Popup-lifetime controller — nothing to tear down.
  };
}
