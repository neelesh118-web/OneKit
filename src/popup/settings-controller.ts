import {
  loadSettings,
  saveSettings,
  TOOL_LABELS,
  type OneKitSettings,
  type Theme,
  type ToolToggles
} from "../core/settings";
import { historyStats } from "../core/history-store";
import {
  createBackup,
  eraseAllData,
  parseBackup,
  restoreBackup,
  serializeBackup
} from "../core/backup-restore";
import { clearHistory as clearHistoryStore } from "../core/history-store";
import { clearClipboard as clearClipboardStore } from "../core/clipboard-store";
import { clearDrafts as clearDraftsStore } from "../core/drafts-store";
import type { OneKitCapabilities } from "./capabilities";

/**
 * Settings tab — theme, the master list of per-tool switches (all eight
 * tools are OFF except the two memory tools), and honest data-management
 * buttons. Every switch is a plain boolean in local storage.
 */
export function createSettingsController(caps: OneKitCapabilities): () => void {
  const $ = (id: string): HTMLElement => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Missing element #${id}`);
    return el;
  };

  const themeSelect = $("theme-select") as HTMLSelectElement;
  const togglesRoot = $("tool-toggles");
  const dataStats = $("data-stats");
  const clearHistory = $("data-clear-history") as HTMLButtonElement;
  const clearClipboard = $("data-clear-clipboard") as HTMLButtonElement;
  const clearDrafts = $("data-clear-drafts") as HTMLButtonElement;
  const clearAll = $("data-clear-all") as HTMLButtonElement;
  const dataStatus = $("data-status");

  const toolToggleEls = new Map<keyof ToolToggles, HTMLInputElement>();

  function buildToggleRow(key: keyof ToolToggles, label: string, value: boolean): HTMLInputElement {
    const row = document.createElement("label");
    row.className = "toggle-row";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = value;
    const span = document.createElement("span");
    span.textContent = label;
    row.append(checkbox, span);
    togglesRoot.appendChild(row);
    return checkbox;
  }

  async function render(): Promise<void> {
    const settings = await loadSettings(caps.storage);
    themeSelect.value = settings.theme;

    togglesRoot.innerHTML = "";
    toolToggleEls.clear();
    for (const key of Object.keys(TOOL_LABELS) as (keyof ToolToggles)[]) {
      const checkbox = buildToggleRow(key, TOOL_LABELS[key], settings.tools[key]);
      checkbox.addEventListener("change", () => {
        void persistToolToggle(key, checkbox.checked);
      });
      toolToggleEls.set(key, checkbox);
    }

    await renderDataStats();
  }

  async function persistToolToggle(key: keyof ToolToggles, value: boolean): Promise<void> {
    const settings = await loadSettings(caps.storage);
    settings.tools[key] = value;
    await saveSettings(settings, caps.storage);
  }

  async function renderDataStats(): Promise<void> {
    const stats = await historyStats(caps.storage);
    dataStats.textContent = `Pages indexed: ${stats.count} · approx ${(stats.bytes / 1024).toFixed(0)} KB of history. Clipboard and drafts are small. Everything below lives only on this device.`;
  }

  themeSelect.addEventListener("change", () => {
    void (async () => {
      const settings = await loadSettings(caps.storage);
      settings.theme = themeSelect.value as Theme;
      await saveSettings(settings, caps.storage);
      applyTheme(settings.theme);
    })();
  });

  clearHistory.addEventListener("click", async () => {
    await clearHistoryStore(caps.storage);
    await renderDataStats();
    dataStatus.textContent = "History cleared.";
  });
  clearClipboard.addEventListener("click", async () => {
    await clearClipboardStore(caps.storage);
    await renderDataStats();
    dataStatus.textContent = "Clipboard history cleared.";
  });
  clearDrafts.addEventListener("click", async () => {
    await clearDraftsStore(caps.storage);
    await renderDataStats();
    dataStatus.textContent = "Drafts cleared.";
  });
  clearAll.addEventListener("click", async () => {
    const removed = await eraseAllData(caps.storage);
    await renderDataStats();
    dataStatus.textContent =
      `Cleared ${removed.length} data store${removed.length === 1 ? "" : "s"} (settings kept).`;
  });

  /* Backup & restore --------------------------------------------------- */
  const backupExport = $("backup-export") as HTMLButtonElement;
  const backupRestore = $("backup-restore") as HTMLButtonElement;
  const backupFile = $("backup-restore-file") as HTMLInputElement;
  const backupStatus = $("backup-status");

  backupExport.addEventListener("click", () => {
    void (async () => {
      backupStatus.textContent = "Building backup…";
      const backup = await createBackup(caps.storage);
      caps.downloadText(
        serializeBackup(backup),
        `onekit-backup-${new Date(backup.exportedAt).toISOString().slice(0, 10)}.json`
      );
      backupStatus.textContent = "Backup downloaded — store it somewhere safe.";
    })().catch(() => {
      backupStatus.textContent = "Could not create the backup.";
    });
  });

  backupRestore.addEventListener("click", () => {
    backupFile.click();
  });
  backupFile.addEventListener("change", () => {
    const file = backupFile.files?.[0];
    if (!file) return;
    void (async () => {
      backupStatus.textContent = "Reading backup…";
      const parsed = parseBackup(await file.text());
      if (!parsed.ok) {
        backupStatus.textContent = parsed.error;
        return;
      }
      const result = await restoreBackup(caps.storage, parsed.backup);
      backupStatus.textContent =
        `Restored ${result.restored.length} section${result.restored.length === 1 ? "" : "s"}` +
        (result.skipped.length > 0
          ? ` (skipped ${result.skipped.length} missing/invalid: ${result.skipped.join(", ")})`
          : "") +
        ". Restart the extension or reload pages to see restored data.";
      await renderDataStats();
      void render();
    })().catch(() => {
      backupStatus.textContent = "Could not read that file.";
    });
    backupFile.value = "";
  });

  void render();
  return () => {};
}

/** Applies the theme to the popup document (light/dark/system). */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === "system") {
    const dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.dataset.theme = dark ? "dark" : "light";
  } else {
    root.dataset.theme = theme;
  }
}
