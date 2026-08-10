import { clearParked, loadParked, parkTabs, restoreParked } from "../core/tab-parking";
import { addScheduledSession, describeSchedule, dueSessions, loadScheduledSessions, removeScheduledSession } from "../core/scheduled-sessions";
import { exportSessions, importSessions, serializeSessions } from "../core/session-io";
import { clearActivity, loadActivity } from "../core/activity-log";
import { clearClipboard, listClipboard, setClipboardPinned } from "../core/clipboard-store";
import { clipboardToMarkdown } from "../core/clipboard-export";
import { replaceInText } from "../core/text-replace";
import { pageToPdfUrl } from "../core/page-to-pdf";
import { buildReport, removableIds } from "../core/downloads-cleaner";
import { generatePassphrase, DEFAULT_PASSPHRASE_OPTIONS } from "../core/passphrase";
import { bookmarksToCsv, bookmarksToMarkdown, bookmarkStats } from "../core/bookmarks-markdown";
import { passwordsCsv, totpCsv } from "../core/csv-export";
import { loadCollection, collectionToCsv } from "../core/link-collector";
import { loadTodos } from "../core/todo-store";
import { unlockVault, readVaultEntries } from "../core/passwords";
import { unlockTotp, listTotpAccounts } from "../core/totp";
import { localStorageDownloads } from "../core/downloads";
import { localStorageHistory } from "../core/history-store";
import type { OneKitCapabilities } from "./capabilities";
import type { BookmarkNodeLike } from "../core/bookmark-cleaner";
import type { DownloadHistoryEntry } from "../core/downloads";

/**
 * Session & data tools — tab parking, scheduled session opens, session
 * export/import, the activity log, clipboard export, popup text find &
 * replace, page→PDF, downloads cleaner, passphrase generator, and
 * bookmarks → Markdown. All 100% local.
 */
export function createSessionToolsController(caps: OneKitCapabilities): () => void {
  const $ = (id: string): HTMLElement => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Missing element #${id}`);
    return el;
  };

  /* Tab parking -------------------------------------------------------- */
  const pkList = $("pk-list");
  const pkPark = $("pk-park") as HTMLButtonElement;
  const pkRestoreAll = $("pk-restore-all") as HTMLButtonElement;
  const pkClear = $("pk-clear") as HTMLButtonElement;
  const pkStatus = $("pk-status");

  async function renderParked(): Promise<void> {
    const list = await loadParked(caps.storage);
    pkList.innerHTML = "";
    for (const tab of list.slice(0, 100)) {
      const row = document.createElement("div");
      row.className = "result-row";
      const title = document.createElement("strong");
      title.className = "result-title";
      title.textContent = tab.title;
      const meta = document.createElement("a");
      meta.className = "result-meta";
      meta.href = tab.url;
      meta.target = "_blank";
      meta.rel = "noreferrer";
      meta.textContent = tab.url;
      const restore = document.createElement("button");
      restore.type = "button";
      restore.className = "mini-btn";
      restore.textContent = "↩ Restore";
      restore.addEventListener("click", () => {
        void (async () => {
          await restoreParked(caps.storage, [tab.url]);
          for (const url of [tab.url]) await caps.openUrl(url);
          await renderParked();
        })();
      });
      row.append(title, meta, restore);
      pkList.appendChild(row);
    }
    pkStatus.textContent =
      list.length === 0
        ? "Nothing parked. Parking closes this window's web tabs (never the active or pinned ones) and saves them here — restore them any time, zero data loss."
        : `${list.length} tab${list.length === 1 ? "" : "s"} parked — restore any of them below.`;
    pkRestoreAll.disabled = list.length === 0;
    pkClear.disabled = list.length === 0;
  }

  pkPark.addEventListener("click", () => {
    void (async () => {
      const tabs = await caps.queryTabs();
      const { parked, tabIds } = await parkTabs(caps.storage, tabs, caps.now());
      if (parked.length === 0) {
        pkStatus.textContent = "Nothing to park — only inactive web tabs get parked.";
        return;
      }
      await caps.closeTabs(tabIds);
      pkStatus.textContent = `Parked ${parked.length} tab${parked.length === 1 ? "" : "s"} to free memory.`;
      await renderParked();
    })();
  });
  pkRestoreAll.addEventListener("click", () => {
    void (async () => {
      const list = await loadParked(caps.storage);
      await restoreParked(caps.storage, list.map((t) => t.url));
      for (const tab of list) await caps.openUrl(tab.url);
      await renderParked();
      pkStatus.textContent = `Restored ${list.length} tab${list.length === 1 ? "" : "s"}.`;
    })();
  });
  pkClear.addEventListener("click", () => {
    void clearParked(caps.storage).then(() => void renderParked());
  });
  void renderParked();

  /* Scheduled sessions -------------------------------------------------- */
  const ssName = $("ss-name") as HTMLInputElement;
  const ssTime = $("ss-time") as HTMLInputElement;
  const ssFreq = $("ss-freq") as HTMLSelectElement;
  const ssDay = $("ss-day") as HTMLSelectElement;
  const ssAdd = $("ss-add") as HTMLButtonElement;
  const ssList = $("ss-list");
  const ssStatus = $("ss-status");

  for (const [value, label] of [
    ["daily", "Every day"],
    ["weekly", "Weekly"]
  ] as const) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    ssFreq.appendChild(option);
  }
  for (const [value, label] of [
    ["0", "Sunday"], ["1", "Monday"], ["2", "Tuesday"], ["3", "Wednesday"],
    ["4", "Thursday"], ["5", "Friday"], ["6", "Saturday"]
  ] as const) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    ssDay.appendChild(option);
  }

  async function renderScheduled(): Promise<void> {
    const list = await loadScheduledSessions(caps.storage);
    const due = await dueSessions(caps.storage, caps.now());
    ssList.innerHTML = "";
    for (const session of list) {
      const row = document.createElement("div");
      row.className = "result-row";
      const title = document.createElement("strong");
      title.className = "result-title";
      title.textContent = session.name;
      const meta = document.createElement("span");
      meta.className = "result-meta";
      meta.textContent = `${describeSchedule(session)} · ${session.tabs.length} tabs`;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "mini-btn";
      remove.textContent = "✕";
      remove.addEventListener("click", () => {
        void removeScheduledSession(session.id, caps.storage).then(() => void renderScheduled());
      });
      row.append(title, meta, remove);
      ssList.appendChild(row);
    }
    ssStatus.textContent =
      list.length === 0
        ? "No scheduled sessions. Set one to auto-open a set of tabs (e.g. your work tabs every weekday morning)."
        : `${list.length} scheduled · ${due.length} due now (opens on the next background check).`;
  }

  ssAdd.addEventListener("click", () => {
    void (async () => {
      const tabs = await caps.queryTabs();
      try {
        await addScheduledSession(
          {
            name: ssName.value,
            frequency: ssFreq.value as "daily" | "weekly",
            dayOfWeek: Number(ssDay.value),
            time: ssTime.value,
            tabs
          },
          caps.now(),
          caps.storage
        );
        ssName.value = "";
        await renderScheduled();
        ssStatus.textContent = "Scheduled — it opens in the background at that time.";
      } catch (err) {
        ssStatus.textContent = err instanceof Error ? err.message : "Could not schedule.";
      }
    })();
  });
  void renderScheduled();

  /* Session export / import ---------------------------------------------- */
  const siExport = $("si-export") as HTMLButtonElement;
  const siImport = $("si-import") as HTMLButtonElement;
  const siFile = $("si-file") as HTMLInputElement;
  const siStatus = $("si-status");

  siExport.addEventListener("click", () => {
    void (async () => {
      const data = await exportSessions(caps.storage);
      caps.downloadText(serializeSessions(data), `onekit-sessions-${new Date().toISOString().slice(0, 10)}.json`);
      siStatus.textContent = `Exported ${data.workspaces.length} workspaces, ${data.parked.length} parked tabs${data.backup ? ", and the session backup" : ""}.`;
    })().catch(() => {
      siStatus.textContent = "Export failed.";
    });
  });
  siImport.addEventListener("click", () => siFile.click());
  siFile.addEventListener("change", () => {
    void (async () => {
      const file = siFile.files?.[0];
      if (!file) return;
      const text = await file.text();
      const result = await importSessions(caps.storage, JSON.parse(text));
      siStatus.textContent =
        result.errors.length > 0
          ? result.errors.join(" ")
          : `Restored ${result.restored.workspaces} workspaces, ${result.restored.parked} parked tabs${result.restored.backup ? ", session backup" : ""}.`;
      siFile.value = "";
    })().catch(() => {
      siStatus.textContent = "That file doesn't look like a OneKit session export.";
    });
  });

  /* Activity log ----------------------------------------------------------- */
  const alList = $("al-list");
  const alClear = $("al-clear") as HTMLButtonElement;
  const alStatus = $("al-status");

  async function renderActivity(): Promise<void> {
    const events = await loadActivity(caps.storage);
    alList.innerHTML = "";
    for (const event of events.slice(0, 50)) {
      const row = document.createElement("div");
      row.className = "result-row";
      const title = document.createElement("strong");
      title.className = "result-title";
      title.textContent = event.type;
      const meta = document.createElement("span");
      meta.className = "result-meta";
      meta.textContent = `${new Date(event.at).toLocaleString()} — ${event.message}`;
      row.append(title, meta);
      alList.appendChild(row);
    }
    alStatus.textContent = events.length === 0 ? "Nothing logged yet — reminders fired, scheduled opens, and exports appear here." : `${events.length} events (newest first).`;
    alClear.disabled = events.length === 0;
  }
  alClear.addEventListener("click", () => {
    void clearActivity(caps.storage).then(() => void renderActivity());
  });
  void renderActivity();

  /* Clipboard export + pinned items ------------------------------------------- */
  const ceExport = $("ce-export") as HTMLButtonElement;
  const ceClear = $("ce-clear") as HTMLButtonElement;
  const ceList = $("ce-list");
  const ceStatus = $("ce-status");

  async function renderClipboard(): Promise<void> {
    const entries = await listClipboard(caps.storage);
    ceList.innerHTML = "";
    for (const entry of entries.slice(0, 12)) {
      const row = document.createElement("div");
      row.className = "result-row";
      const title = document.createElement("strong");
      title.className = "result-title";
      title.textContent = entry.pinned ? `📌 ${entry.text.slice(0, 60)}` : entry.text.slice(0, 60);
      const meta = document.createElement("span");
      meta.className = "result-meta";
      meta.textContent = entry.pinned ? "pinned — survives trimming" : new Date(entry.ts).toLocaleString();
      const pin = document.createElement("button");
      pin.type = "button";
      pin.className = "mini-btn";
      pin.textContent = entry.pinned ? "Unpin" : "Pin";
      pin.addEventListener("click", () => {
        void setClipboardPinned(caps.storage, entry.id, !entry.pinned).then(() => void renderClipboard());
      });
      row.append(title, meta, pin);
      ceList.appendChild(row);
    }
    ceStatus.textContent =
      entries.length === 0
        ? "Nothing copied yet. Pinned items survive the 50-entry rotation."
        : `${entries.length} entr${entries.length === 1 ? "y" : "ies"} in history — pin the ones you need to keep.`;
  }

  ceExport.addEventListener("click", () => {
    void listClipboard(caps.storage).then((entries) => {
      if (entries.length === 0) {
        ceStatus.textContent = "Nothing copied yet.";
        return;
      }
      caps.downloadText(clipboardToMarkdown(entries), `onekit-clipboard-${new Date().toISOString().slice(0, 10)}.md`);
      ceStatus.textContent = `Exported ${entries.length} clipboard entr${entries.length === 1 ? "y" : "ies"}.`;
    });
  });
  ceClear.addEventListener("click", () => {
    void clearClipboard(caps.storage).then(() => {
      ceStatus.textContent = "Clipboard history cleared.";
      void renderClipboard();
    });
  });
  void renderClipboard();

  /* CSV export hub -------------------------------------------------------------- */
  const csvLinks = $("csv-links") as HTMLButtonElement;
  const csvTodos = $("csv-todos") as HTMLButtonElement;
  const csvPassphrase = $("csv-passphrase") as HTMLInputElement;
  const csvPasswords = $("csv-passwords") as HTMLButtonElement;
  const csvTotp = $("csv-totp") as HTMLButtonElement;
  const csvStatus = $("csv-status");

  csvLinks.addEventListener("click", () => {
    void (async () => {
      const list = await loadCollection(caps.storage);
      if (list.length === 0) {
        csvStatus.textContent = "No collected links yet — right-click a link and choose OneKit → Collect link.";
        return;
      }
      caps.downloadText(collectionToCsv(list), `onekit-links-${new Date().toISOString().slice(0, 10)}.csv`);
      csvStatus.textContent = `Exported ${list.length} link${list.length === 1 ? "" : "s"} as CSV.`;
    })().catch(() => {
      csvStatus.textContent = "Could not read the link collection.";
    });
  });

  csvTodos.addEventListener("click", () => {
    void (async () => {      const todos = await loadTodos(caps.storage);
      const esc = (v: string): string => `"${(v ?? "").replace(/"/g, '""')}"`;
      const rows = ["todo,status", ...todos.map((t) => [t.title, t.done ? "done" : "open"].map(esc).join(","))];
      caps.downloadText(rows.join("\n"), `onekit-todos-${new Date().toISOString().slice(0, 10)}.csv`);
      csvStatus.textContent = `Exported ${todos.length} todo${todos.length === 1 ? "" : "s"} as CSV.`;
    })().catch(() => {
      csvStatus.textContent = "Could not read the todo list.";
    });
  });

  csvPasswords.addEventListener("click", () => {
    void (async () => {
      const passphrase = csvPassphrase.value;
      if (!passphrase) {
        csvStatus.textContent = "Enter the master passphrase first (vaults are encrypted at rest).";
        return;
      }
      const key = await unlockVault(passphrase, caps.storage);
      const entries = await readVaultEntries(caps.storage, key);
      if (entries.length === 0) {
        csvStatus.textContent = "The vault is empty.";
        return;
      }
      caps.downloadText(
        passwordsCsv(entries.map((e) => ({ name: e.site, url: `https://${e.site}`, username: e.username, password: e.password, notes: e.notes }))),
        `onekit-passwords-${new Date().toISOString().slice(0, 10)}.csv`
      );
      csvStatus.textContent = `Exported ${entries.length} password${entries.length === 1 ? "" : "s"} as CSV (keep this file safe).`;
    })().catch((err) => {
      csvStatus.textContent = err instanceof Error && err.message.includes("Wrong") ? "Wrong master passphrase." : "Could not unlock the vault.";
    });
  });

  csvTotp.addEventListener("click", () => {
    void (async () => {
      const passphrase = csvPassphrase.value;
      const accounts = await listTotpAccounts(caps.storage, passphrase ? await unlockTotp(passphrase, caps.storage).catch(() => undefined) : undefined);
      if (accounts.length === 0) {
        csvStatus.textContent = "No TOTP accounts yet.";
        return;
      }
      caps.downloadText(
        totpCsv(accounts.map((a) => ({ label: a.label, secret: a.secret, issuer: a.issuer, digits: a.digits, period: a.period }))),
        `onekit-totp-${new Date().toISOString().slice(0, 10)}.csv`
      );
      csvStatus.textContent = `Exported ${accounts.length} TOTP account${accounts.length === 1 ? "" : "s"} as CSV (keep this file safe).`;
    })().catch(() => {
      csvStatus.textContent = "Wrong passphrase — TOTP secrets are encrypted at rest.";
    });
  });

  /* Text find & replace -------------------------------------------------------- */
  const trInput = $("tr-input") as HTMLTextAreaElement;
  const trFind = $("tr-find") as HTMLInputElement;
  const trReplace = $("tr-replace") as HTMLInputElement;
  const trCase = $("tr-case") as HTMLInputElement;
  const trRun = $("tr-run") as HTMLButtonElement;
  const trOutput = $("tr-output") as HTMLTextAreaElement;
  const trStatus = $("tr-status");

  trRun.addEventListener("click", () => {
    const result = replaceInText(trInput.value, trFind.value, trReplace.value, trCase.checked);
    trOutput.value = result.output;
    trStatus.textContent =
      result.count === 0
        ? "No matches — check the find text and the case toggle."
        : `Replaced ${result.count} occurrence${result.count === 1 ? "" : "s"}.`;
  });

  /* Page → PDF ------------------------------------------------------------------ */
  const ppBtn = $("pp-btn") as HTMLButtonElement;
  const ppStatus = $("pp-status");

  ppBtn.addEventListener("click", () => {
    void (async () => {
      const tab = await caps.getActiveTab();
      if (!tab.url || !/^https?:/.test(tab.url)) {
        ppStatus.textContent = "Open a normal web page first, then save it as PDF.";
        return;
      }
      const url = pageToPdfUrl(tab.url, caps.readerUrl());
      if (!url) {
        ppStatus.textContent = "Could not build the PDF link.";
        return;
      }
      await caps.openUrl(url);
      ppStatus.textContent = "Opened the clean page — choose Save as PDF in the print dialog. (OneKit uses the browser's own PDF engine.)";
    })().catch(() => {
      ppStatus.textContent = "Could not open the clean page.";
    });
  });

  /* Downloads cleaner ------------------------------------------------------------- */
  const dcScan = $("dc-scan") as HTMLButtonElement;
  const dcRemove = $("dc-remove") as HTMLButtonElement;
  const dcList = $("dc-list");
  const dcStatus = $("dc-status");
  let cleanupReport: ReturnType<typeof buildReport> | null = null;

  dcScan.addEventListener("click", () => {
    void (async () => {
      const history = (await localStorageDownloads().get("ok.downloads"))["ok.downloads"] as DownloadHistoryEntry[] | undefined;
      const list = Array.isArray(history) ? history : [];
      cleanupReport = buildReport(list, caps.now(), 90);
      const ids = removableIds(cleanupReport);
      dcList.innerHTML = "";
      for (const group of cleanupReport.duplicates.slice(0, 20)) {
        const row = document.createElement("div");
        row.className = "result-row";
        const title = document.createElement("strong");
        title.className = "result-title";
        title.textContent = `${group.filename} (×${group.entries.length})`;
        const meta = document.createElement("span");
        meta.className = "result-meta";
        meta.textContent = "duplicate downloads — keep the newest";
        row.append(title, meta);
        dcList.appendChild(row);
      }
      for (const entry of cleanupReport.oldEntries.slice(0, 20)) {
        const row = document.createElement("div");
        row.className = "result-row";
        const title = document.createElement("strong");
        title.className = "result-title";
        title.textContent = entry.filename;
        const meta = document.createElement("span");
        meta.className = "result-meta";
        meta.textContent = `older than 90 days (${new Date(entry.ts).toLocaleDateString()})`;
        row.append(title, meta);
        dcList.appendChild(row);
      }
      dcStatus.textContent = `${ids.length} item${ids.length === 1 ? "" : "s"} removable from history (files on disk are untouched).`;
      dcRemove.disabled = ids.length === 0;
    })().catch(() => {
      dcStatus.textContent = "Could not read download history.";
    });
  });
  dcRemove.addEventListener("click", () => {
    void (async () => {
      if (!cleanupReport) return;
      const ids = removableIds(cleanupReport);
      const history = (await localStorageDownloads().get("ok.downloads"))["ok.downloads"] as DownloadHistoryEntry[] | undefined;
      const list = Array.isArray(history) ? history : [];
      const removed = list.filter((e) => !ids.includes(e.id));
      await localStorageDownloads().set({ "ok.downloads": removed });
      dcStatus.textContent = `Removed ${list.length - removed.length} entr${list.length - removed.length === 1 ? "y" : "ies"} from download history.`;
      dcRemove.disabled = true;
      cleanupReport = null;
      dcList.innerHTML = "";
    })();
  });

  /* Passphrase generator ------------------------------------------------------------ */
  const phWords = $("ph-words") as HTMLInputElement;
  const phSep = $("ph-sep") as HTMLInputElement;
  const phNumber = $("ph-number") as HTMLInputElement;
  const phCap = $("ph-cap") as HTMLInputElement;
  const phGen = $("ph-gen") as HTMLButtonElement;
  const phOutput = $("ph-output") as HTMLInputElement;
  const phCopy = $("ph-copy") as HTMLButtonElement;
  const phStatus = $("ph-status");

  function renderPassphrase(): void {
    const passphrase = generatePassphrase({
      words: Math.max(2, Math.min(8, Number(phWords.value) || DEFAULT_PASSPHRASE_OPTIONS.words)),
      separator: phSep.value || "-",
      addNumber: phNumber.checked,
      capitalize: phCap.checked
    });
    phOutput.value = passphrase;
    phCopy.disabled = false;
    phStatus.textContent = "A phrase you can actually remember — different from your passwords, and no pattern to guess.";
  }
  phGen.addEventListener("click", renderPassphrase);
  phCopy.addEventListener("click", () => {
    void caps.copyText(phOutput.value).then(() => {
      phStatus.textContent = "Copied ✓";
    });
  });
  renderPassphrase();

  /* Bookmarks → Markdown ------------------------------------------------------------- */
  const bmExport = $("bm-export") as HTMLButtonElement;
  const bmCsv = $("bm-csv") as HTMLButtonElement;
  const bmStatus = $("bm-status");

  bmExport.addEventListener("click", () => {
    void (async () => {
      const tree = await caps.getBookmarks();
      const root: BookmarkNodeLike = { id: "root", children: tree };
      caps.downloadText(bookmarksToMarkdown(root), `onekit-bookmarks-${new Date().toISOString().slice(0, 10)}.md`);
      const stats = bookmarkStats(root);
      bmStatus.textContent = `Exported ${stats.total} bookmarks across ${stats.folders} folders.`;
    })().catch(() => {
      bmStatus.textContent = "Could not read bookmarks.";
    });
  });
  bmCsv.addEventListener("click", () => {
    void (async () => {
      const tree = await caps.getBookmarks();
      const root: BookmarkNodeLike = { id: "root", children: tree };
      caps.downloadText(bookmarksToCsv(root), `onekit-bookmarks-${new Date().toISOString().slice(0, 10)}.csv`);
      bmStatus.textContent = "Bookmarks CSV exported.";
    })().catch(() => {
      bmStatus.textContent = "Could not read bookmarks.";
    });
  });

  return () => {};
}
