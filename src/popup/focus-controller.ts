import {
  addFocusRule,
  clearFocusRules,
  formatMinutes,
  listFocusRules,
  parseMinutes,
  removeFocusRule,
  setFocusRuleEnabled,
  type DayOfWeek,
  type FocusRule
} from "../core/focus";
import {
  clearScreenTime,
  screenTimeStats,
  type ScreenTimeStats
} from "../core/screen-time";
import { loadSettings, saveSettings } from "../core/settings";
import type { OneKitCapabilities } from "./capabilities";

/**
 * Focus tab — distraction blocker (per-site schedules) and local screen-time
 * stats. The blocker hides a site behind an overlay during your chosen
 * windows; the overlay is always one click away from pausing or allowing
 * the site for today.
 */

const DAY_LABELS: { value: DayOfWeek; short: string; long: string }[] = [
  { value: 0, short: "S", long: "Sun" },
  { value: 1, short: "M", long: "Mon" },
  { value: 2, short: "T", long: "Tue" },
  { value: 3, short: "W", long: "Wed" },
  { value: 4, short: "T", long: "Thu" },
  { value: 5, short: "F", long: "Fri" },
  { value: 6, short: "S", long: "Sat" }
];

function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function ruleSummary(rule: FocusRule): string {
  if (rule.always) return "Always";
  const windowText =
    rule.endMin > rule.startMin
      ? `${formatMinutes(rule.startMin)}–${formatMinutes(rule.endMin)}`
      : `${formatMinutes(rule.startMin)}–${formatMinutes(rule.endMin)} (next day)`;
  const days = rule.days
    .map((d) => DAY_LABELS.find((l) => l.value === d)?.short)
    .join("");
  return `${windowText} · ${days || "never"}`;
}

export function createFocusController(caps: OneKitCapabilities): () => void {
  const $ = (id: string): HTMLElement => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Missing element #${id}`);
    return el;
  };

  const blockerToggle = $("focus-master") as HTMLInputElement;
  const ruleHost = $("focus-host") as HTMLInputElement;
  const ruleAlways = $("focus-always") as HTMLInputElement;
  const ruleStart = $("focus-start") as HTMLInputElement;
  const ruleEnd = $("focus-end") as HTMLInputElement;
  const ruleDays = $("focus-days");
  const ruleAdd = $("focus-add") as HTMLButtonElement;
  const ruleList = $("focus-rules");
  const ruleStatus = $("focus-rules-status");
  const clearRules = $("focus-rules-clear") as HTMLButtonElement;

  const stToday = $("st-today");
  const stSites = $("st-sites");
  const stWeek = $("st-week");
  const stClear = $("st-clear") as HTMLButtonElement;

  /* Screen time ------------------------------------------------------- */
  async function renderScreenTime(): Promise<void> {
    const stats: ScreenTimeStats = await screenTimeStats(caps.storage);
    stToday.textContent =
      stats.todaySeconds > 0
        ? `${formatDuration(stats.todaySeconds)} active on pages today`
        : "No active time recorded today yet. Time counts while a tab is open and visible.";
    stSites.innerHTML = "";
    const top = stats.todaySites.slice(0, 8);
    if (top.length === 0) {
      const empty = document.createElement("p");
      empty.className = "status";
      empty.textContent = "Per-site breakdown will appear here.";
      stSites.appendChild(empty);
    } else {
      for (const site of top) {
        const row = document.createElement("div");
        row.className = "result-row";
        const title = document.createElement("span");
        title.className = "result-title";
        title.textContent = site.origin.replace(/^https?:\/\//, "");
        const meta = document.createElement("span");
        meta.className = "result-meta";
        meta.textContent = formatDuration(site.seconds);
        row.append(title, meta);
        stSites.appendChild(row);
      }
    }
    const weekMax = Math.max(1, ...stats.last7Days.map((d) => d.seconds));
    stWeek.innerHTML = "";
    for (const day of stats.last7Days) {
      const barRow = document.createElement("div");
      barRow.className = "st-bar-row";
      const label = document.createElement("span");
      label.className = "st-bar-label";
      label.textContent = day.day.slice(5);
      const track = document.createElement("div");
      track.className = "st-bar-track";
      const fill = document.createElement("div");
      fill.className = "st-bar-fill";
      fill.style.width = `${Math.max(2, Math.round((day.seconds / weekMax) * 100))}%`;
      const value = document.createElement("span");
      value.className = "st-bar-value";
      value.textContent = formatDuration(day.seconds);
      track.appendChild(fill);
      barRow.append(label, track, value);
      stWeek.appendChild(barRow);
    }
  }

  /* Distraction blocker ---------------------------------------------- */
  async function renderMasterToggle(): Promise<void> {
    const settings = await loadSettings(caps.storage);
    blockerToggle.checked = settings.tools.focusBlocker;
  }

  async function renderRules(): Promise<void> {
    const rules = await listFocusRules(caps.storage);
    ruleList.innerHTML = "";
    if (rules.length === 0) {
      ruleStatus.textContent = "No schedules yet. Add one below — it only applies when the blocker is on.";
      return;
    }
    ruleStatus.textContent = `${rules.length} schedule${rules.length === 1 ? "" : "s"} — subdomains count too.`;
    for (const rule of rules) {
      const row = document.createElement("div");
      row.className = "result-row focus-rule";
      const left = document.createElement("div");
      left.className = "focus-rule-left";
      const title = document.createElement("span");
      title.className = "result-title";
      title.textContent = rule.hostname;
      const meta = document.createElement("span");
      meta.className = "result-meta";
      meta.textContent = ruleSummary(rule);
      left.append(title, meta);

      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "mini-btn";
      toggle.textContent = rule.enabled ? "On" : "Off";
      toggle.addEventListener("click", () => {
        void setFocusRuleEnabled(caps.storage, rule.id, !rule.enabled).then(() => void renderRules());
      });

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "mini-btn danger";
      remove.textContent = "Delete";
      remove.addEventListener("click", () => {
        void removeFocusRule(caps.storage, rule.id).then(() => void renderRules());
      });

      row.append(left, toggle, remove);
      ruleList.appendChild(row);
    }
  }

  function renderDayPicker(): void {
    ruleDays.innerHTML = "";
    for (const day of DAY_LABELS) {
      const label = document.createElement("label");
      label.className = "day-chip";
      label.title = day.long;
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = String(day.value);
      checkbox.checked = day.value >= 1 && day.value <= 5; // weekdays by default
      const span = document.createElement("span");
      span.textContent = day.short;
      label.append(checkbox, span);
      ruleDays.appendChild(label);
    }
  }

  blockerToggle.addEventListener("change", () => {
    void (async () => {
      const settings = await loadSettings(caps.storage);
      settings.tools.focusBlocker = blockerToggle.checked;
      await saveSettings(settings, caps.storage);
      ruleStatus.textContent = blockerToggle.checked
        ? "Blocker is on. Schedules below apply to matching sites."
        : "Blocker is off — nothing is hidden until you switch it back on.";
    })();
  });

  ruleAdd.addEventListener("click", () => {
    void (async () => {
      const days = [...ruleDays.querySelectorAll<HTMLInputElement>("input:checked")].map(
        (el) => Number(el.value) as DayOfWeek
      );
      const rule = await addFocusRule(caps.storage, {
        hostname: ruleHost.value,
        always: ruleAlways.checked,
        startMin: parseMinutes(ruleStart.value || "09:00"),
        endMin: parseMinutes(ruleEnd.value || "17:00"),
        days
      });
      if (!rule) {
        ruleStatus.textContent = "That hostname looks invalid, or it's already scheduled. Example: facebook.com";
        return;
      }
      ruleHost.value = "";
      ruleStatus.textContent = `Added ${rule.hostname}.`;
      await renderRules();
    })();
  });

  clearRules.addEventListener("click", () => {
    void clearFocusRules(caps.storage).then(() => void renderRules());
  });

  stClear.addEventListener("click", () => {
    void clearScreenTime(caps.storage).then(() => void renderScreenTime());
  });

  renderDayPicker();
  void renderMasterToggle();
  void renderRules();
  void renderScreenTime();
  return () => {};
}
