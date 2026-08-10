import {
  addReminder,
  clearReminders,
  loadReminders,
  pendingReminders,
  relativeDue,
  removeReminder
} from "../core/reminders";
import {
  addCollectedLink,
  clearCollection,
  collectionToCsv,
  collectionToMarkdown,
  loadCollection,
  removeCollectedLink
} from "../core/link-collector";
import { loadLimit, saveLimit, statusFor, suspensionCandidates } from "../core/tab-limiter";
import { tabsToCsv, tabsToMarkdown } from "../core/tab-list";
import { exportJson, exportMarkdown } from "../core/export-hub";
import type { OneKitCapabilities } from "./capabilities";
import type { TabLike } from "../core/tab-tools";

/**
 * The 2026 round's popup surfaces:
 *  - Reminders + Link collector (Memory tab)
 *  - Tab limiter + Copy tab list (Speed tab)
 *  - Data export hub (Settings tab)
 */
export function createMemoryToolsController(caps: OneKitCapabilities): () => void {
  const $ = (id: string): HTMLElement => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Missing element #${id}`);
    return el;
  };

  /* Reminders ---------------------------------------------------------- */
  const remText = $("rem-text") as HTMLInputElement;
  const remWhen = $("rem-when") as HTMLInputElement;
  const remAdd = $("rem-add") as HTMLButtonElement;
  const remList = $("rem-list");
  const remClear = $("rem-clear") as HTMLButtonElement;
  const remStatus = $("rem-status");

  const scheduleAlarm = async (id: string, when: number): Promise<void> => {
    const browser = (await import("wxt/browser")).browser;
    await browser.alarms.create(`ok-reminder-${id}`, { when });
  };

  async function renderReminders(): Promise<void> {
    const now = caps.now();
    const list = await loadReminders(caps.storage);
    const pending = list.filter((r) => r.firedAt === null).sort((a, b) => a.due - b.due);
    remList.innerHTML = "";
    for (const reminder of pending) {
      const row = document.createElement("div");
      row.className = "result-row";
      const title = document.createElement("strong");
      title.className = "result-title";
      title.textContent = reminder.text;
      const meta = document.createElement("span");
      meta.className = "result-meta";
      meta.textContent = relativeDue(reminder.due, now);
      const dismiss = document.createElement("button");
      dismiss.type = "button";
      dismiss.className = "mini-btn";
      dismiss.textContent = "✕";
      dismiss.addEventListener("click", () => {
        void removeReminder(reminder.id, caps.storage).then(() => void renderReminders());
      });
      row.append(title, meta, dismiss);
      remList.appendChild(row);
    }
    const fired = list.filter((r) => r.firedAt !== null).length;
    remStatus.textContent =
      list.length === 0
        ? "No reminders yet — set one below; it fires as a notification even with the popup closed."
        : `${pending.length} pending · ${fired} fired (dismissed ones stay until removed).`;
    remClear.disabled = list.length === 0;
  }

  remAdd.addEventListener("click", () => {
    void (async () => {
      const text = remText.value.trim();
      if (!text) {
        remStatus.textContent = "Say what you want to be reminded of.";
        return;
      }
      const due = new Date(remWhen.value).getTime();
      if (!Number.isFinite(due)) {
        remStatus.textContent = "Pick a date and time first.";
        return;
      }
      try {
        await addReminder({ text, due }, caps.now(), caps.storage, scheduleAlarm);
        remText.value = "";
        remStatus.textContent = `Reminder set for ${new Date(due).toLocaleString()}.`;
        await renderReminders();
      } catch (err) {
        remStatus.textContent = err instanceof Error ? err.message : "Could not set the reminder.";
      }
    })();
  });
  remClear.addEventListener("click", () => {
    void clearReminders(caps.storage).then(() => void renderReminders());
  });
  void renderReminders();

  /* Link collector ------------------------------------------------------ */
  const lcList = $("lc-list");
  const lcExportMd = $("lc-export-md") as HTMLButtonElement;
  const lcExportCsv = $("lc-export-csv") as HTMLButtonElement;
  const lcClear = $("lc-clear") as HTMLButtonElement;
  const lcStatus = $("lc-status");

  async function renderCollection(): Promise<void> {
    const list = await loadCollection(caps.storage);
    lcList.innerHTML = "";
    for (const link of list.slice(0, 100)) {
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
      meta.textContent = link.url;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "mini-btn";
      remove.textContent = "✕";
      remove.addEventListener("click", () => {
        void removeCollectedLink(link.url, caps.storage).then(() => void renderCollection());
      });
      row.append(title, meta, remove);
      lcList.appendChild(row);
    }
    lcStatus.textContent =
      list.length === 0
        ? "Right-click any link (or page) → OneKit — Collect link. Stashed links appear here for export."
        : `${list.length} link${list.length === 1 ? "" : "s"} collected.`;
    lcExportMd.disabled = list.length === 0;
    lcExportCsv.disabled = list.length === 0;
    lcClear.disabled = list.length === 0;
  }

  lcExportMd.addEventListener("click", () => {
    void loadCollection(caps.storage).then((list) => {
      caps.downloadText(collectionToMarkdown(list), `onekit-links-${new Date().toISOString().slice(0, 10)}.md`);
    });
  });
  lcExportCsv.addEventListener("click", () => {
    void loadCollection(caps.storage).then((list) => {
      caps.downloadText(collectionToCsv(list), `onekit-links-${new Date().toISOString().slice(0, 10)}.csv`);
    });
  });
  lcClear.addEventListener("click", () => {
    void clearCollection(caps.storage).then(() => void renderCollection());
  });
  void renderCollection();

  /* Tab limiter ---------------------------------------------------------- */
  const tlLimit = $("tl-limit") as HTMLInputElement;
  const tlSave = $("tl-save") as HTMLButtonElement;
  const tlStatus2 = $("tl-status2");
  const tlSuspend = $("tl-suspend") as HTMLButtonElement;

  async function renderTabLimit(): Promise<void> {
    const limit = await loadLimit(caps.storage);
    tlLimit.value = String(limit);
    const tabs = await caps.queryTabs();
    const { action, message } = statusFor(tabs.length, limit);
    tlStatus2.textContent = message;
    tlStatus2.className = `status ${action === "ok" ? "" : action === "warn" ? "warn" : "over"}`;
  }

  tlSave.addEventListener("click", () => {
    void (async () => {
      const saved = await saveLimit(caps.storage, Number(tlLimit.value) || 40);
      tlLimit.value = String(saved);
      await renderTabLimit();
    })();
  });
  tlSuspend.addEventListener("click", () => {
    void (async () => {
      const limit = await loadLimit(caps.storage);
      const tabs = (await caps.queryTabs()) as Array<TabLike & { lastAccessed?: number; pinned?: boolean; discarded?: boolean }>;
      const keep = Math.floor(limit * 0.6);
      const ids = suspensionCandidates(tabs, keep);
      if (ids.length === 0) {
        tlStatus2.textContent = "Nothing to suspend — you're not over the limit.";
        return;
      }
      await caps.discardTabs(ids);
      await renderTabLimit();
      tlStatus2.textContent = `Suspended ${ids.length} oldest inactive tab${ids.length === 1 ? "" : "s"}.`;
    })();
  });
  void renderTabLimit();

  /* Copy tab list ---------------------------------------------------------- */
  const clList = $("cl-list");
  const clMarkdown = $("cl-markdown") as HTMLButtonElement;
  const clCsv = $("cl-csv") as HTMLButtonElement;
  const clStatus = $("cl-status");

  async function renderTabList(): Promise<void> {
    const tabs = await caps.queryTabs();
    const httpTabs = tabs.filter((t) => (t.url ?? "").startsWith("http"));
    clStatus.textContent = `${httpTabs.length} web tab${httpTabs.length === 1 ? "" : "s"} (${tabs.length} total) — copy them as Markdown or CSV.`;
    clMarkdown.disabled = httpTabs.length === 0;
    clCsv.disabled = httpTabs.length === 0;
  }
  clMarkdown.addEventListener("click", () => {
    void caps.queryTabs().then((tabs) => {
      caps.downloadText(tabsToMarkdown(tabs), `onekit-tabs-${new Date().toISOString().slice(0, 10)}.md`);
    });
  });
  clCsv.addEventListener("click", () => {
    void caps.queryTabs().then((tabs) => {
      caps.downloadText(tabsToCsv(tabs), `onekit-tabs-${new Date().toISOString().slice(0, 10)}.csv`);
    });
  });
  void renderTabList();

  /* Data export hub --------------------------------------------------------- */
  const exJson = $("ex-json") as HTMLButtonElement;
  const exMd = $("ex-md") as HTMLButtonElement;
  const exStatus = $("ex-status");

  exJson.addEventListener("click", () => {
    void (async () => {
      exStatus.textContent = "Exporting…";
      const json = await exportJson(caps.storage);
      caps.downloadText(json, `onekit-data-${new Date().toISOString().slice(0, 10)}.json`);
      exStatus.textContent = "JSON export saved — every OneKit store in one file.";
    })().catch(() => {
      exStatus.textContent = "Export failed — try again.";
    });
  });
  exMd.addEventListener("click", () => {
    void (async () => {
      exStatus.textContent = "Exporting…";
      const md = await exportMarkdown(caps.storage);
      caps.downloadText(md, `onekit-data-${new Date().toISOString().slice(0, 10)}.md`);
      exStatus.textContent = "Markdown digest saved — a friendly read of your data.";
    })().catch(() => {
      exStatus.textContent = "Export failed — try again.";
    });
  });

  return () => {};
}
