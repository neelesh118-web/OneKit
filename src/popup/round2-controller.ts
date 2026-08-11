import { summarizeText } from "../core/summarizer";
import { cleanTypography } from "../core/smart-text";
import { analyzeKeywords, keywordReport } from "../core/keyword-analysis";
import { buildBookmarkPlan, type BookmarkLike } from "../core/bookmark-sorter";
import { checkLinks, summaryOf, tidyUrl, type LinkCheckResult } from "../core/affiliate-check";
import { hostnameOf } from "../core/custom-css";
import { clearHiddenForHost, listHidden, removeHidden } from "../core/element-hider";
import { addQaNote, clearQaNotes, listQaNotes, qaReport, removeQaNote } from "../core/qa-notes";
import { listSerpNotes, removeSerpNote } from "../core/serp-notes";
import type { KvStorage } from "../core/storage-utils";
import type { OneKitCapabilities } from "./capabilities";

/**
 * Ten-tool gap round — element hider, selection summarizer, quick tab
 * switcher, video frame grab, bookmark sorter, smart-text cleaner, micro
 * QA capture, page keyword analyzer, affiliate link inspector, SERP
 * notes. All 100% local; controllers never touch browser.* directly.
 */
export function createRound2Controller(caps: OneKitCapabilities): () => void {
  const $ = (id: string): HTMLElement => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Missing element #${id}`);
    return el;
  };
  const storage: KvStorage = caps.storage;
  const activeTabId = async (): Promise<number | undefined> => {
    const tab = await caps.getActiveTab();
    return tab.id;
  };

  /* Element hider ------------------------------------------------------ */
  const ehArm = $("eh-arm") as HTMLButtonElement;
  const ehClear = $("eh-clear") as HTMLButtonElement;
  const ehList = $("eh-list");
  const ehStatus = $("eh-status");

  async function renderHidden(): Promise<void> {
    const hidden = await listHidden(storage);
    ehList.textContent = "";
    if (hidden.length === 0) {
      ehStatus.textContent = "Nothing hidden yet — right-click a page → “OneKit — Hide element”, then click what to hide.";
      return;
    }
    ehStatus.textContent = `${hidden.length} element${hidden.length === 1 ? "" : "s"} hidden.`;
    let lastHost = "";
    for (const h of hidden) {
      if (h.hostname !== lastHost) {
        lastHost = h.hostname;
        const head = document.createElement("div");
        head.className = "group-label";
        head.textContent = h.hostname;
        ehList.appendChild(head);
      }
      const row = document.createElement("div");
      row.className = "list-row";
      const label = document.createElement("span");
      label.className = "row-main";
      label.textContent = h.label;
      label.title = h.selector;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "mini-btn";
      btn.textContent = "Show again";
      btn.addEventListener("click", () => {
        void (async () => {
          await removeHidden(storage, h.hostname, h.selector);
          await renderHidden();
        })();
      });
      row.append(label, btn);
      ehList.appendChild(row);
    }
  }

  ehArm.addEventListener("click", () => {
    void (async () => {
      const tabId = await activeTabId();
      if (tabId === undefined) {
        ehStatus.textContent = "Open a web page first.";
        return;
      }
      await caps.sendMessage(tabId, { type: "ok:hide-arm" }).catch(() => {});
      ehStatus.textContent = "Arming… click any element on the page to hide it (Esc cancels).";
    })();
  });
  ehClear.addEventListener("click", () => {
    void (async () => {
      const tab = await caps.getActiveTab();
      const host = tab.url ? hostnameOf(tab.url) : "";
      if (!host) {
        ehStatus.textContent = "Open a web page first.";
        return;
      }
      const removed = await clearHiddenForHost(storage, host);
      ehStatus.textContent = removed > 0 ? `Cleared ${removed} hidden element${removed === 1 ? "" : "s"} for ${host}.` : `Nothing hidden for ${host}.`;
      await renderHidden();
    })();
  });
  void renderHidden().catch(() => {});

  /* SERP notes ---------------------------------------------------------- */
  const snOpen = $("sn-open") as HTMLButtonElement;
  const snList = $("sn-list");
  const snStatus = $("sn-status");

  async function renderSerpNotes(): Promise<void> {
    const notes = await listSerpNotes(storage);
    snList.textContent = "";
    if (notes.length === 0) {
      snStatus.textContent = "No notes yet — search on Google, open this, and the note stays with that query.";
      return;
    }
    snStatus.textContent = `${notes.length} quer${notes.length === 1 ? "y" : "ies"} with notes.`;
    for (const n of notes) {
      const row = document.createElement("div");
      row.className = "list-row";
      const main = document.createElement("div");
      main.className = "row-main";
      const q = document.createElement("div");
      q.className = "group-label";
      q.textContent = `“${n.query}”`;
      const note = document.createElement("div");
      note.textContent = n.note;
      main.append(q, note);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "mini-btn danger";
      btn.textContent = "Delete";
      btn.addEventListener("click", () => {
        void (async () => {
          await removeSerpNote(storage, n.query);
          await renderSerpNotes();
        })();
      });
      row.append(main, btn);
      snList.appendChild(row);
    }
  }

  snOpen.addEventListener("click", () => {
    void (async () => {
      const tabId = await activeTabId();
      if (tabId === undefined) {
        snStatus.textContent = "Open a Google results page first.";
        return;
      }
      await caps.sendMessage(tabId, { type: "ok:serp-notes-toggle" }).catch(() => {});
      snStatus.textContent = "Panel toggled — it appears on the results page.";
      await renderSerpNotes();
    })();
  });
  void renderSerpNotes().catch(() => {});

  /* Quick tab switcher -------------------------------------------------- */
  const tsOpen = $("ts-open") as HTMLButtonElement;
  const tsStatus = $("ts-status");
  tsOpen.addEventListener("click", () => {
    void caps.openTabSwitcher();
    tsStatus.textContent = "Switcher opened — or press Ctrl+Shift+Space anywhere.";
  });

  /* Selection summarizer ------------------------------------------------- */
  const ssPage = $("ss-page") as HTMLButtonElement;
  const ssInput = $("ss-input") as HTMLTextAreaElement;
  const ssPaste = $("ss-paste") as HTMLButtonElement;
  const ssOutput = $("ss-output") as HTMLTextAreaElement;
  const ssStatus = $("ss-status");

  ssPage.addEventListener("click", () => {
    void (async () => {
      const tabId = await activeTabId();
      if (tabId === undefined) {
        ssStatus.textContent = "Open a web page first, then select some text.";
        return;
      }
      await caps.sendMessage(tabId, { type: "ok:summarize-selection" }).catch(() => {});
      ssStatus.textContent = "Select text on the page — the summary card appears there.";
    })();
  });
  ssPaste.addEventListener("click", () => {
    const text = ssInput.value.trim();
    if (!text) {
      ssStatus.textContent = "Paste some text first.";
      return;
    }
    const summary = summarizeText(text, { maxSentences: 5, maxChars: 1100 });
    ssOutput.value = summary;
    ssStatus.textContent = `Summarized ${text.length.toLocaleString()} chars → ${summary.length.toLocaleString()} of key points.`;
  });

  /* Video frame grab ----------------------------------------------------- */
  const vfGrab = $("vf-grab") as HTMLButtonElement;
  const vfStatus = $("vf-status");
  vfGrab.addEventListener("click", () => {
    void (async () => {
      const tabId = await activeTabId();
      if (tabId === undefined) {
        vfStatus.textContent = "Open the video page first.";
        return;
      }
      const result = (await caps
        .sendMessage(tabId, { type: "ok:video-frame-grab" })
        .catch(() => undefined)) as { ok?: boolean; reason?: string } | undefined;
      if (!result?.ok) {
        vfStatus.textContent =
          result?.reason === "no-video"
            ? "No playable video found on this page."
            : result?.reason === "tainted"
              ? "This video is cross-origin protected — its frame can't be captured."
              : "Could not capture the frame (open the video page first).";
        return;
      }
      vfStatus.textContent = "Frame saved to Downloads ✓";
    })();
  });

  /* Bookmark auto-sorter -------------------------------------------------- */
  const bsAnalyze = $("bs-analyze") as HTMLButtonElement;
  const bsApply = $("bs-apply") as HTMLButtonElement;
  const bsPreview = $("bs-preview");
  const bsStatus = $("bs-status");
  let currentPlan: ReturnType<typeof buildBookmarkPlan> | null = null;

  async function renderPlan(plan: ReturnType<typeof buildBookmarkPlan>): Promise<void> {
    bsPreview.textContent = "";
    const add = (text: string, cls = ""): void => {
      const div = document.createElement("div");
      div.className = cls;
      div.textContent = text;
      bsPreview.appendChild(div);
    };
    if (plan.folders.length === 0) {
      add("No sortable bookmarks found.", "");
      return;
    }
    add(`${plan.totalMoved} bookmarks → ${plan.folders.length} folders:`, "group-label");
    for (const f of plan.folders) {
      if (f.entries.length < 2) continue;
      add(`${f.name} — ${f.entries.length}`, "");
    }
    if (plan.duplicates.length > 0) {
      add(`${plan.duplicates.length} exact duplicate${plan.duplicates.length === 1 ? "" : "s"} — duplicates will be removed.`, "");
    }
    if (plan.emptyFolders.length > 0) {
      add(`${plan.emptyFolders.length} empty folder${plan.emptyFolders.length === 1 ? "" : "s"} found (left alone).`, "");
    }
  }

  bsAnalyze.addEventListener("click", () => {
    void (async () => {
      bsStatus.textContent = "Analyzing…";
      const tree = await caps.getBookmarks();
      currentPlan = buildBookmarkPlan(tree as BookmarkLike[]);
      await renderPlan(currentPlan);
      bsStatus.textContent = `Preview ready — ${currentPlan.totalMoved} bookmarks would move.`;
    })();
  });
  bsApply.addEventListener("click", () => {
    void (async () => {
      if (!currentPlan) {
        bsStatus.textContent = "Analyze first — nothing is applied without a preview.";
        return;
      }
      bsStatus.textContent = "Applying…";
      const plan = currentPlan;
      let moved = 0;
      let removed = 0;
      for (const folder of plan.folders) {
        if (folder.entries.length < 2) continue;
        const folderId = await caps.createBookmarkFolder(folder.name);
        for (const entry of folder.entries) {
          await caps.moveBookmark(entry.id, folderId).catch(() => {});
          moved++;
        }
      }
      for (const dup of plan.duplicates) {
        await caps.removeBookmarks([dup.dup.id]).catch(() => {});
        removed++;
      }
      bsStatus.textContent = `Done — ${moved} bookmarks organized, ${removed} duplicates removed. Re-analyze to preview the result.`;
      currentPlan = null;
      bsPreview.textContent = "";
    })();
  });

  /* Smart-text cleaner ---------------------------------------------------- */
  const stInput = $("st-input") as HTMLTextAreaElement;
  const stFix = $("st-fix") as HTMLButtonElement;
  const stCopy = $("st-copy") as HTMLButtonElement;
  const stOutput = $("st-output") as HTMLTextAreaElement;
  const stStatus = $("st-status");

  stFix.addEventListener("click", () => {
    const result = cleanTypography(stInput.value);
    stOutput.value = result.text;
    stStatus.textContent =
      result.fixes.length === 0
        ? "Already clean — no fixes needed."
        : `Fixed ${result.fixes.reduce((sum, f) => sum + f.count, 0)} things: ${result.fixes.map((f) => f.label).join(", ")}.`;
  });
  stCopy.addEventListener("click", () => {
    if (!stOutput.value) {
      stStatus.textContent = "Fix some text first.";
      return;
    }
    void caps.copyText(stOutput.value).then(() => {
      stStatus.textContent = "Copied ✓";
    });
  });

  /* Micro QA capture ------------------------------------------------------ */
  const qaNote = $("qa-note") as HTMLInputElement;
  const qaCapture = $("qa-capture") as HTMLButtonElement;
  const qaShot = $("qa-shot") as HTMLButtonElement;
  const qaClear = $("qa-clear") as HTMLButtonElement;
  const qaList = $("qa-list");
  const qaStatus = $("qa-status");

  async function renderQa(): Promise<void> {
    const notes = await listQaNotes(storage);
    qaList.textContent = "";
    if (notes.length === 0) {
      qaStatus.textContent = "No captures yet — describe what you found and hit Capture.";
      return;
    }
    qaStatus.textContent = `${notes.length} capture${notes.length === 1 ? "" : "s"}. Click a report to copy it.`;
    for (const n of notes) {
      const row = document.createElement("div");
      row.className = "list-row";
      const main = document.createElement("div");
      main.className = "row-main";
      const title = document.createElement("div");
      title.className = "group-label";
      title.textContent = `${n.title} · ${new Date(n.at).toLocaleString()}`;
      const note = document.createElement("div");
      note.textContent = n.note || "(screenshot only)";
      main.append(title, note);
      if (n.screenshot) {
        const img = document.createElement("img");
        img.src = n.screenshot;
        img.alt = "capture";
        img.style.maxWidth = "100%";
        img.style.borderRadius = "6px";
        img.style.marginTop = "4px";
        main.appendChild(img);
      }
      const actions = document.createElement("div");
      actions.className = "btn-row";
      const copyBtn = document.createElement("button");
      copyBtn.type = "button";
      copyBtn.className = "mini-btn";
      copyBtn.textContent = "Copy report";
      copyBtn.addEventListener("click", () => void caps.copyText(qaReport(n)));
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "mini-btn danger";
      delBtn.textContent = "Delete";
      delBtn.addEventListener("click", () => {
        void (async () => {
          await removeQaNote(storage, n.id);
          await renderQa();
        })();
      });
      actions.append(copyBtn, delBtn);
      main.appendChild(actions);
      row.appendChild(main);
      qaList.appendChild(row);
    }
  }

  const capture = (withShot: boolean): void => {
    void (async () => {
      const tab = await caps.getActiveTab();
      if (!tab.url) {
        qaStatus.textContent = "Open a web page first.";
        return;
      }
      let screenshot: string | undefined;
      if (withShot) {
        qaStatus.textContent = "Capturing screenshot…";
        try {
          screenshot = await caps.captureVisibleTab();
        } catch {
          qaStatus.textContent = "Screenshot unavailable — saving without it.";
        }
      }
      await addQaNote(storage, {
        url: tab.url,
        title: tab.title ?? tab.url,
        note: qaNote.value,
        ...(screenshot ? { screenshot } : {})
      });
      qaNote.value = "";
      qaStatus.textContent = withShot ? "Capture + screenshot saved ✓" : "Capture saved ✓";
      await renderQa();
    })();
  };
  qaCapture.addEventListener("click", () => capture(false));
  qaShot.addEventListener("click", () => capture(true));
  qaClear.addEventListener("click", () => {
    void (async () => {
      await clearQaNotes(storage);
      await renderQa();
    })();
  });
  void renderQa().catch(() => {});

  /* Page keyword analyzer -------------------------------------------------- */
  const kaAnalyze = $("ka-analyze") as HTMLButtonElement;
  const kaCopy = $("ka-copy") as HTMLButtonElement;
  const kaResults = $("ka-results");
  const kaStatus = $("ka-status");
  let lastKeywordReport = "";

  kaAnalyze.addEventListener("click", () => {
    void (async () => {
      const tabId = await activeTabId();
      if (tabId === undefined) {
        kaStatus.textContent = "Open a web page first.";
        return;
      }
      kaStatus.textContent = "Analyzing…";
      const res = (await caps.sendMessage(tabId, { type: "ok:keyword-analysis" }).catch(() => undefined)) as
        | { ok?: boolean; analysis?: ReturnType<typeof analyzeKeywords> }
        | undefined;
      if (!res?.ok || !res.analysis) {
        kaStatus.textContent = "Nothing readable found on this page.";
        return;
      }
      lastKeywordReport = keywordReport(res.analysis);
      kaResults.textContent = "";
      const add = (text: string, cls = ""): void => {
        const div = document.createElement("div");
        div.className = cls;
        div.textContent = text;
        kaResults.appendChild(div);
      };
      add(`${res.analysis.totalWords} words · ~${res.analysis.readingMinutes} min read`, "group-label");
      for (const w of res.analysis.words.slice(0, 10)) {
        add(`${w.word} — ${w.count}×`, "");
      }
      if (res.analysis.phrases.length > 0) {
        add("Repeated phrases:", "group-label");
        for (const p of res.analysis.phrases.slice(0, 6)) {
          add(`${p.phrase} — ${p.count}×`, "");
        }
      }
      kaStatus.textContent = `Analyzed ${res.analysis.totalWords} words. Copy the full report with the button.`;
    })();
  });
  kaCopy.addEventListener("click", () => {
    if (!lastKeywordReport) {
      kaStatus.textContent = "Analyze a page first.";
      return;
    }
    void caps.copyText(lastKeywordReport).then(() => {
      kaStatus.textContent = "Report copied ✓";
    });
  });

  /* Affiliate link inspector ------------------------------------------------ */
  const acPage = $("ac-page") as HTMLButtonElement;
  const acInput = $("ac-input") as HTMLTextAreaElement;
  const acCheck = $("ac-check") as HTMLButtonElement;
  const acResults = $("ac-results");
  const acStatus = $("ac-status");

  function renderAffiliate(results: LinkCheckResult[]): void {
    acResults.textContent = "";
    const { checked, flagged } = summaryOf(results);
    acStatus.textContent = `${checked} link${checked === 1 ? "" : "s"} checked, ${flagged} flagged.`;
    if (flagged === 0) {
      const ok = document.createElement("div");
      ok.textContent = "No issues found — clean links. ✓";
      acResults.appendChild(ok);
      return;
    }
    for (const r of results) {
      if (r.issues.length === 0) continue;
      const row = document.createElement("div");
      row.className = "list-row";
      const main = document.createElement("div");
      main.className = "row-main";
      const url = document.createElement("div");
      url.className = "group-label";
      url.textContent = r.url.slice(0, 80) + (r.url.length > 80 ? "…" : "");
      main.appendChild(url);
      for (const issue of r.issues) {
        const line = document.createElement("div");
        line.textContent = `${issue.severity === "error" ? "⚠️" : "·"} ${issue.message}`;
        main.appendChild(line);
      }
      row.appendChild(main);
      acResults.appendChild(row);
    }
  }

  acPage.addEventListener("click", () => {
    void (async () => {
      const tabId = await activeTabId();
      if (tabId === undefined) {
        acStatus.textContent = "Open a web page first.";
        return;
      }
      acStatus.textContent = "Checking links…";
      const res = (await caps.sendMessage(tabId, { type: "ok:page-links" }).catch(() => undefined)) as
        | { links?: Array<{ url: string; rel?: string }>; hrefs?: string[] }
        | undefined;
      const links = res?.links ?? (res?.hrefs ?? []).map((url) => ({ url, rel: "" }));
      renderAffiliate(checkLinks(links.slice(0, 60)));
    })();
  });
  acCheck.addEventListener("click", () => {
    const urls = acInput.value
      .split("\n")
      .map((l) => tidyUrl(l))
      .filter((l) => l.length > 0)
      .slice(0, 30);
    if (urls.length === 0) {
      acStatus.textContent = "Paste at least one link first.";
      return;
    }
    renderAffiliate(checkLinks(urls.map((url) => ({ url, rel: "" }))));
  });

  return () => {};
}
