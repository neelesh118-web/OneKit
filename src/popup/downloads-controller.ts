import {
  clearDownloadHistory,
  listDownloadHistory
} from "../core/downloads";
import { loadSettings, saveSettings } from "../core/settings";
import type { OneKitCapabilities } from "./capabilities";

/**
 * Downloads tab — the download organizer toggle (routes files into folders
 * by type, only while enabled) and the local download history. All local.
 */
export function createDownloadsController(caps: OneKitCapabilities): () => void {
  const $ = (id: string): HTMLElement => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Missing element #${id}`);
    return el;
  };

  const toggle = $("downloads-toggle") as HTMLInputElement;
  const status = $("downloads-status");
  const list = $("downloads-list");
  const clearBtn = $("downloads-clear") as HTMLButtonElement;

  async function renderToggle(): Promise<void> {
    const settings = await loadSettings(caps.storage);
    toggle.checked = settings.tools.downloadOrganizer;
    status.textContent = settings.tools.downloadOrganizer
      ? "On — new downloads go into folders by type."
      : "Off — downloads keep their original location until you switch this on.";
  }

  async function renderHistory(): Promise<void> {
    const entries = await listDownloadHistory(caps.storage);
    list.innerHTML = "";
    if (entries.length === 0) {
      list.textContent = "No downloads recorded yet. The history fills in as you download files.";
      return;
    }
    for (const entry of entries.slice(0, 40)) {
      const row = document.createElement("div");
      row.className = "result-row";
      const title = document.createElement("strong");
      title.className = "result-title";
      title.textContent = entry.filename;
      const meta = document.createElement("span");
      meta.className = "result-meta";
      meta.textContent = `${entry.category} · ${new Date(entry.ts).toLocaleString()}`;
      row.append(title, meta);
      list.appendChild(row);
    }
  }

  toggle.addEventListener("change", () => {
    void (async () => {
      const settings = await loadSettings(caps.storage);
      settings.tools.downloadOrganizer = toggle.checked;
      await saveSettings(settings, caps.storage);
      await renderToggle();
    })();
  });

  clearBtn.addEventListener("click", () => {
    void clearDownloadHistory(caps.storage).then(() => void renderHistory());
  });

  void renderToggle();
  void renderHistory();
  return () => {};
}
