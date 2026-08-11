/**
 * Quick tab switcher — an Alt+Tab-style overlay for browser tabs.
 * Opened by Ctrl+Shift+Space (background command) or the Speed tab
 * button. Keyboard-first: type to filter, arrows to move, Enter to
 * switch and focus, Esc to dismiss. Fully local.
 */
import { browser } from "wxt/browser";

interface TabInfo {
  id?: number;
  windowId?: number;
  index?: number;
  title?: string;
  url?: string;
  pinned?: boolean;
}

interface Row {
  tab: TabInfo;
  windowId: number;
  title: string;
  url: string;
}

const listEl = document.getElementById("list")!;
const filterEl = document.getElementById("filter") as HTMLInputElement;
const statusEl = document.getElementById("status")!;

let rows: Row[] = [];
let active = 0;

function faviconFor(url: string): string {
  try {
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(new URL(url).hostname)}&sz=32`;
  } catch {
    return "";
  }
}

async function loadTabs(): Promise<void> {
  const tabs = (await browser.tabs.query({})) as TabInfo[];
  const now = Date.now();
  rows = tabs
    .filter((t) => t.url && /^https?:/.test(t.url))
    .sort((a, b) => (a.windowId ?? 0) - (b.windowId ?? 0) || (a.index ?? 0) - (b.index ?? 0))
    .map((tab) => ({
      tab,
      windowId: tab.windowId ?? 0,
      title: tab.title || tab.url || "Untitled",
      url: tab.url ?? ""
    }));
  statusEl.textContent = `${rows.length} tabs · now ${new Date(now).toLocaleTimeString()}`;
  render();
}

function filtered(): Row[] {
  const q = filterEl.value.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(
    (r) => r.title.toLowerCase().includes(q) || r.url.toLowerCase().includes(q)
  );
}

function render(): void {
  listEl.textContent = "";
  const list = filtered();
  if (list.length === 0) {
    const empty = document.createElement("div");
    empty.id = "empty";
    empty.textContent = "No matching tabs.";
    listEl.appendChild(empty);
    return;
  }
  if (active >= list.length) active = 0;
  let lastWindow = -1;
  for (const [i, row] of list.entries()) {
    if (row.windowId !== lastWindow) {
      lastWindow = row.windowId;
      const win = document.createElement("div");
      win.className = "win";
      win.textContent = `Window ${row.windowId}`;
      listEl.appendChild(win);
    }
    const el = document.createElement("div");
    el.className = "row" + (i === active ? " active" : "");
    const ico = document.createElement("span");
    ico.className = "ico";
    const img = document.createElement("img");
    const f = faviconFor(row.url);
    img.src = f;
    img.width = 16;
    img.height = 16;
    img.style.borderRadius = "3px";
    ico.appendChild(img);
    const t = document.createElement("span");
    t.className = "t";
    t.textContent = row.title;
    const u = document.createElement("span");
    u.className = "u";
    u.textContent = row.url;
    el.append(ico, t, u);
    if (row.tab.pinned) {
      const pin = document.createElement("span");
      pin.className = "pin";
      pin.textContent = "📌";
      el.appendChild(pin);
    }
    el.addEventListener("mousemove", () => {
      active = i;
      render();
    });
    el.addEventListener("click", () => void switchTo(i));
    listEl.appendChild(el);
  }
  const activeEl = listEl.querySelector(".row.active");
  activeEl?.scrollIntoView({ block: "nearest" });
}

async function switchTo(index: number): Promise<void> {
  const list = filtered();
  const row = list[index];
  if (!row) return;
  const tabId = row.tab.id;
  try {
    if (tabId !== undefined) {
      await browser.tabs.update(tabId, { active: true });
      await browser.windows.update(row.windowId, { focused: true });
    }
  } catch {
    // Tab may have closed since the list was built.
  }
  window.close();
}

function move(delta: number): void {
  const list = filtered();
  if (list.length === 0) return;
  active = (active + delta + list.length) % list.length;
  render();
}

document.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown") {
    e.preventDefault();
    move(1);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    move(-1);
  } else if (e.key === "Enter") {
    e.preventDefault();
    void switchTo(active);
  } else if (e.key === "Escape") {
    window.close();
  }
});

filterEl.addEventListener("input", () => {
  active = 0;
  render();
});

void loadTabs().catch(() => {
  statusEl.textContent = "Could not load tabs.";
});
filterEl.focus();
