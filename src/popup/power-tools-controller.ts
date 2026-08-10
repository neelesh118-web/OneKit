import { clearAllAutoRefresh, listAutoRefreshRules, localStorageAutoRefresh, setAutoRefresh } from "../core/auto-refresh";
import { VIEWPORT_PRESETS, presetById } from "../core/window-resizer";
import { clearMeetingLinks, listMeetingLinks } from "../core/meeting-links";
import { filterByTag, tagCloud, tagsForItem } from "../core/auto-tag";
import { computePrivacyScore } from "../core/privacy-score";
import { formatMoney, parsePrice, priceWithFees } from "../core/price-fees";
import { addVideoNote, clearVideoNotesFor, listVideoNotes, localStorageVideoNotes, removeVideoNote, formatVideoTime } from "../core/video-notes";
import { groupByPage, highlightExportFilename, highlightStats, highlightsToMarkdown } from "../core/highlight-export";
import { listHighlights, localStorageHighlights } from "../core/highlights-store";
import { cssForHostname, hostnameOf, listCssRules, localStorageCustomCss, removeCssRule, toggleCssRule, upsertCssRule } from "../core/custom-css";
import { localStorageReadLater, listReadLater } from "../core/read-later-store";
import { localStorageFocusSession } from "../core/focus-session";
import type { OneKitCapabilities } from "./capabilities";

/**
 * Power tools — auto-refresh, window resizer, page ruler, fake form
 * filler, meeting links, auto-tag, privacy score, price-with-fees,
 * video notes, table→CSV, highlight export, custom CSS. All 100% local.
 */
export function createPowerToolsController(caps: OneKitCapabilities): () => void {
  const $ = (id: string): HTMLElement => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Missing element #${id}`);
    return el;
  };

  /* Auto-refresh --------------------------------------------------------- */
  const arInterval = $("ar-interval") as HTMLSelectElement;
  const arStart = $("ar-start") as HTMLButtonElement;
  const arStop = $("ar-stop") as HTMLButtonElement;
  const arList = $("ar-list");
  const arStatus = $("ar-status");

  async function renderAutoRefresh(): Promise<void> {
    const rules = await listAutoRefreshRules(caps.storage);
    arList.innerHTML = "";
    for (const rule of rules) {
      const row = document.createElement("div");
      row.className = "result-row";
      const title = document.createElement("strong");
      title.className = "result-title";
      title.textContent = rule.origin;
      const meta = document.createElement("span");
      meta.className = "result-meta";
      meta.textContent = `every ${rule.intervalSeconds}s`;
      row.append(title, meta);
      arList.appendChild(row);
    }
    arStatus.textContent = rules.length === 0 ? "No pages auto-refreshing. Pick an interval, then Start — the page reloads itself on that beat." : `${rules.length} page${rules.length === 1 ? "" : "s"} on an auto-refresh timer.`;
    arStop.disabled = rules.length === 0;
  }

  arStart.addEventListener("click", () => {
    void (async () => {
      const tab = await caps.getActiveTab();
      if (!tab.url || !/^https?:/.test(tab.url)) {
        arStatus.textContent = "Open a web page first — the active tab gets the timer.";
        return;
      }
      const rule = await setAutoRefresh(caps.storage, tab.url, Number(arInterval.value), caps.now());
      await caps.sendMessage((await caps.getActiveTab()).id ?? 0, { type: "ok:auto-refresh-arm" }).catch(() => {});
      arStatus.textContent = `Will refresh ${rule.origin} every ${rule.intervalSeconds}s.`;
      await renderAutoRefresh();
    })();
  });

  arStop.addEventListener("click", () => {
    void (async () => {
      const cleared = await clearAllAutoRefresh(caps.storage);
      await caps.sendMessage((await caps.getActiveTab()).id ?? 0, { type: "ok:stop-auto-refresh" }).catch(() => {});
      arStatus.textContent = `Stopped ${cleared} timer${cleared === 1 ? "" : "s"}.`;
      await renderAutoRefresh();
    })();
  });
  void renderAutoRefresh();

  /* Window resizer --------------------------------------------------------- */
  const wrSelect = $("wr-preset") as HTMLSelectElement;
  const wrApply = $("wr-apply") as HTMLButtonElement;
  const wrStatus = $("wr-status");

  for (const preset of VIEWPORT_PRESETS) {
    const option = document.createElement("option");
    option.value = preset.id;
    option.textContent = `${preset.label} (${preset.width}×${preset.height})`;
    wrSelect.appendChild(option);
  }
  wrApply.addEventListener("click", () => {
    void (async () => {
      const preset = presetById(wrSelect.value);
      if (!preset) return;
      await caps.resizeWindow(preset.id);
      wrStatus.textContent = `Window set to ${preset.label} (${preset.width}×${preset.height} viewport).`;
    })();
  });

  /* Page ruler -------------------------------------------------------------- */
  const prToggle = $("pr-toggle") as HTMLButtonElement;
  const prStatus = $("pr-status");
  prToggle.addEventListener("click", () => {
    void (async () => {
      const tab = await caps.getActiveTab();
      if (!tab.url || !/^https?:/.test(tab.url)) {
        prStatus.textContent = "Open a web page, then toggle the ruler.";
        return;
      }
      await caps.sendMessage(tab.id ?? 0, { type: "ok:ruler-toggle" });
      prStatus.textContent = "Ruler toggled — drag a box to measure, double-click to exit.";
    })().catch(() => {
      prStatus.textContent = "Could not reach the page.";
    });
  });

  /* Fake form filler ---------------------------------------------------------- */
  const ffFill = $("ff-fill") as HTMLButtonElement;
  const ffStatus = $("ff-status");
  ffFill.addEventListener("click", () => {
    void (async () => {
      const tab = await caps.getActiveTab();
      if (!tab.url || !/^https?:/.test(tab.url)) {
        ffStatus.textContent = "Open a form page first.";
        return;
      }
      const result = (await caps.sendMessage(tab.id ?? 0, { type: "ok:fake-fill" })) as { filled?: number } | undefined;
      ffStatus.textContent = result && result.filled ? `Filled ${result.filled} field${result.filled === 1 ? "" : "s"} with test data — nothing real.` : "No fillable fields found on that page.";
    })().catch(() => {
      ffStatus.textContent = "Could not reach the page.";
    });
  });

  /* Meeting link launcher ----------------------------------------------------- */
  const mlList = $("ml-list");
  const mlClear = $("ml-clear") as HTMLButtonElement;
  const mlStatus = $("ml-status");

  async function renderMeetings(): Promise<void> {
    const links = await listMeetingLinks(caps.storage, caps.now());
    mlList.innerHTML = "";
    for (const link of links.slice(0, 15)) {
      const row = document.createElement("div");
      row.className = "result-row";
      const title = document.createElement("strong");
      title.className = "result-title";
      title.textContent = link.title;
      const meta = document.createElement("a");
      meta.className = "result-meta";
      meta.href = link.url;
      meta.target = "_blank";
      meta.rel = "noreferrer";
      meta.textContent = `${link.provider} · ${new Date(link.at).toLocaleString()}`;
      const join = document.createElement("button");
      join.type = "button";
      join.className = "mini-btn";
      join.textContent = "Join";
      join.addEventListener("click", () => {
        void caps.openUrl(link.url);
      });
      row.append(title, meta, join);
      mlList.appendChild(row);
    }
    mlStatus.textContent = links.length === 0 ? "No meeting links yet — when you open a Zoom/Meet/Teams join link, it appears here." : `${links.length} recent meeting link${links.length === 1 ? "" : "s"} (last 30 days).`;
    mlClear.disabled = links.length === 0;
  }
  mlClear.addEventListener("click", () => {
    void clearMeetingLinks(caps.storage).then(() => void renderMeetings());
  });
  void renderMeetings();

  /* Auto-tag saved content ----------------------------------------------------- */
  const atList = $("at-list");
  const atStatus = $("at-status");

  async function renderAutoTag(): Promise<void> {
    const [readLater, highlights] = await Promise.all([
      listReadLater(localStorageReadLater()),
      listHighlights(localStorageHighlights())
    ]);
    const items = [
      ...readLater.map((r) => ({ url: r.url, title: r.title })),
      ...highlights.map((h) => ({ url: h.url, title: h.text.slice(0, 80) }))
    ];
    const cloud = tagCloud(items).slice(0, 30);
    atList.innerHTML = "";
    for (const { tag, count } of cloud) {
      const row = document.createElement("div");
      row.className = "result-row";
      const title = document.createElement("strong");
      title.className = "result-title";
      title.textContent = tag;
      const meta = document.createElement("span");
      meta.className = "result-meta";
      meta.textContent = `${count} item${count === 1 ? "" : "s"}`;
      const preview = document.createElement("button");
      preview.type = "button";
      preview.className = "mini-btn";
      preview.textContent = "Show";
      preview.addEventListener("click", () => {
        const matches = filterByTag(items, tag);
        atStatus.textContent = `${tag}: ${matches.slice(0, 5).map((m) => m.url).join(", ")}${matches.length > 5 ? ` +${matches.length - 5} more` : ""}`;
      });
      row.append(title, meta, preview);
      atList.appendChild(row);
    }
    atStatus.textContent = cloud.length === 0 ? "No saved pages or highlights yet — your tags appear here automatically." : `${items.length} saved items auto-tagged by domain + keywords.`;
  }
  void renderAutoTag();

  /* Privacy score -------------------------------------------------------------- */
  const psScore = $("ps-score");
  const psSummary = $("ps-summary");
  const psTips = $("ps-tips");
  const psRefresh = $("ps-refresh") as HTMLButtonElement;

  async function renderPrivacyScore(): Promise<void> {
    const [cookieHosts, historyDomains, settings] = await Promise.all([
      caps.getAllCookieHosts(),
      caps.getHistoryDomains(90),
      caps.getProtectedTools?.() ?? Promise.resolve([])
    ]);
    const vaultMeta = (await caps.storage.get("ok.passwordsMeta"))["ok.passwordsMeta"] as { salt?: string } | undefined;
    const result = computePrivacyScore({
      cookieCount: cookieHosts.length,
      historyHosts: historyDomains.length,
      protectionsEnabled: settings.length,
      protectionsTotal: 3,
      vaultProtected: Boolean(vaultMeta?.salt)
    });
    psScore.textContent = `${result.grade} · ${result.score}/100`;
    psSummary.textContent = result.summary;
    psTips.innerHTML = "";
    for (const tip of result.recommendations) {
      const li = document.createElement("li");
      li.textContent = tip;
      psTips.appendChild(li);
    }
  }
  psRefresh.addEventListener("click", () => void renderPrivacyScore());
  void renderPrivacyScore();

  /* Price-with-fees -------------------------------------------------------------- */
  const pfPrice = $("pf-price") as HTMLInputElement;
  const pfTax = $("pf-tax") as HTMLInputElement;
  const pfShip = $("pf-ship") as HTMLInputElement;
  const pfFeePct = $("pf-fee-pct") as HTMLInputElement;
  const pfDisc = $("pf-disc") as HTMLInputElement;
  const pfCalc = $("pf-calc") as HTMLButtonElement;
  const pfResult = $("pf-result");
  const pfStatus = $("pf-status");

  pfCalc.addEventListener("click", () => {
    const result = priceWithFees({
      price: parsePrice(pfPrice.value) ?? 0,
      taxPercent: Number(pfTax.value) || 0,
      shipping: Number(pfShip.value) || 0,
      feePercent: Number(pfFeePct.value) || 0,
      discountPercent: Number(pfDisc.value) || 0
    });
    pfResult.innerHTML = "";
    const rows: Array<[string, string]> = [
      ["Subtotal", formatMoney(result.subtotal)],
      ["Tax", formatMoney(result.taxAmount)],
      ["Shipping", formatMoney(result.shippingAmount)],
      ["Fees", formatMoney(result.feeAmount)],
      ["Total you pay", formatMoney(result.total)],
      ["Seller keeps", formatMoney(result.sellerKeeps)]
    ];
    for (const [label, value] of rows) {
      const row = document.createElement("div");
      row.className = "result-row";
      const title = document.createElement("strong");
      title.className = "result-title";
      title.textContent = label;
      const meta = document.createElement("span");
      meta.className = "result-meta";
      meta.textContent = value;
      row.append(title, meta);
      pfResult.appendChild(row);
    }
    pfStatus.textContent = "Real total, computed locally.";
  });

  /* Video notes ------------------------------------------------------------------- */
  const vnAdd = $("vn-add") as HTMLButtonElement;
  const vnText = $("vn-text") as HTMLInputElement;
  const vnTime = $("vn-time") as HTMLInputElement;
  const vnList = $("vn-list");
  const vnClear = $("vn-clear") as HTMLButtonElement;
  const vnStatus = $("vn-status");

  async function renderVideoNotes(): Promise<void> {
    const tab = await caps.getActiveTab();
    const url = tab?.url && /^https?:/.test(tab.url) ? tab.url : undefined;
    const notes = url ? await listVideoNotes(caps.storage, url) : [];
    vnList.innerHTML = "";
    for (const note of notes.slice(0, 30)) {
      const row = document.createElement("div");
      row.className = "result-row";
      const title = document.createElement("strong");
      title.className = "result-title";
      title.textContent = formatVideoTime(note.timestamp);
      const meta = document.createElement("span");
      meta.className = "result-meta";
      meta.textContent = note.text;
      const del = document.createElement("button");
      del.type = "button";
      del.className = "mini-btn";
      del.textContent = "✕";
      del.addEventListener("click", () => {
        void removeVideoNote(caps.storage, note.id).then(() => void renderVideoNotes());
      });
      row.append(title, meta, del);
      vnList.appendChild(row);
    }
    vnStatus.textContent = !url ? "Open a video page, then add notes here — each is saved with its timestamp." : notes.length === 0 ? "No notes yet for this video." : `${notes.length} note${notes.length === 1 ? "" : "s"} for this video (jump back any time).`;
    vnClear.disabled = notes.length === 0;
  }
  vnAdd.addEventListener("click", () => {
    void (async () => {
      const tab = await caps.getActiveTab();
      if (!tab?.url || !/^https?:/.test(tab.url)) {
        vnStatus.textContent = "Open a video page first.";
        return;
      }
      await addVideoNote(caps.storage, tab.url, Number(vnTime.value) || 0, vnText.value, caps.now());
      vnText.value = "";
      await renderVideoNotes();
    })();
  });
  vnClear.addEventListener("click", () => {
    void (async () => {
      const tab = await caps.getActiveTab();
      if (!tab?.url) return;
      await clearVideoNotesFor(caps.storage, tab.url);
      await renderVideoNotes();
    })();
  });
  void renderVideoNotes();

  /* Table → CSV -------------------------------------------------------------------- */
  const tcCopy = $("tc-copy") as HTMLButtonElement;
  const tcStatus = $("tc-status");
  tcCopy.addEventListener("click", () => {
    void (async () => {
      const tab = await caps.getActiveTab();
      if (!tab?.url || !/^https?:/.test(tab.url)) {
        tcStatus.textContent = "Open a page with a table first.";
        return;
      }
      const result = (await caps.sendMessage(tab.id ?? 0, { type: "ok:table-csv" })) as { rows?: number } | undefined;
      tcStatus.textContent = result && result.rows ? `Copied the table (${result.rows} rows) as CSV ✓` : "No table found on that page.";
    })().catch(() => {
      tcStatus.textContent = "Could not reach the page.";
    });
  });

  /* Highlight export ----------------------------------------------------------------- */
  const heExport = $("he-export") as HTMLButtonElement;
  const heStatus = $("he-status");
  heExport.addEventListener("click", () => {
    void (async () => {
      const highlights = await listHighlights(localStorageHighlights());
      const groups = groupByPage(highlights.map((h) => ({ id: h.id, url: h.url, text: h.text, color: h.color, createdAt: h.ts })));
      caps.downloadText(highlightsToMarkdown(groups), highlightExportFilename());
      const stats = highlightStats(groups);
      heStatus.textContent = `Exported ${stats.total} highlight${stats.total === 1 ? "" : "s"} across ${stats.pages} page${stats.pages === 1 ? "" : "s"}.`;
    })().catch(() => {
      heStatus.textContent = "Could not read highlights.";
    });
  });

  /* Custom CSS ------------------------------------------------------------------------ */
  const ccHost = $("cc-host") as HTMLInputElement;
  const ccCss = $("cc-css") as HTMLTextAreaElement;
  const ccSave = $("cc-save") as HTMLButtonElement;
  const ccList = $("cc-list");
  const ccStatus = $("cc-status");

  async function renderCustomCss(): Promise<void> {
    const rules = await listCssRules(caps.storage);
    ccList.innerHTML = "";
    for (const rule of rules) {
      const row = document.createElement("div");
      row.className = "result-row";
      const title = document.createElement("strong");
      title.className = "result-title";
      title.textContent = rule.hostname;
      const meta = document.createElement("span");
      meta.className = "result-meta";
      meta.textContent = rule.enabled ? "on" : "off";
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "mini-btn";
      toggle.textContent = rule.enabled ? "Disable" : "Enable";
      toggle.addEventListener("click", () => {
        void toggleCssRule(caps.storage, rule.hostname, !rule.enabled).then(() => void renderCustomCss());
      });
      const del = document.createElement("button");
      del.type = "button";
      del.className = "mini-btn danger";
      del.textContent = "✕";
      del.addEventListener("click", () => {
        void removeCssRule(caps.storage, rule.hostname).then(() => void renderCustomCss());
      });
      row.append(title, meta, toggle, del);
      ccList.appendChild(row);
    }
    ccStatus.textContent = rules.length === 0 ? "No custom CSS yet — add a hostname (e.g. example.com) and your own rules." : `${rules.length} site rule${rules.length === 1 ? "" : "s"} — applies when the tool is enabled in Settings.`;
  }
  ccSave.addEventListener("click", () => {
    void (async () => {
      try {
        await upsertCssRule(caps.storage, ccHost.value, ccCss.value, caps.now());
        ccHost.value = "";
        ccCss.value = "";
        await renderCustomCss();
        ccStatus.textContent = "Rule saved ✓";
      } catch (err) {
        ccStatus.textContent = err instanceof Error ? err.message : "Could not save the rule.";
      }
    })();
  });
  void renderCustomCss();

  return () => {};
}
