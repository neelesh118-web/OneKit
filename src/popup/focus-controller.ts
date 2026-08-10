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
import {
  clearBudgets,
  listBudgets,
  removeBudget,
  saveBudget
} from "../core/budgets";
import { loadSettings, saveSettings } from "../core/settings";
import {
  endFocusSession,
  formatRemaining,
  readFocusSession,
  startFocusSession
} from "../core/focus-session";
import {
  endPomodoro,
  phaseLabel,
  readPomodoro,
  startPomodoro
} from "../core/pomodoro";
import {
  addHabit,
  habitStreak,
  last7Keys,
  listHabits,
  removeHabit,
  toggleHabitDay,
  weekdayLabel
} from "../core/habits";
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

  /* Daily site budgets -------------------------------------------------- */
  const budgetHost = $("budget-host") as HTMLInputElement;
  const budgetMinutes = $("budget-minutes") as HTMLInputElement;
  const budgetAdd = $("budget-add") as HTMLButtonElement;
  const budgetList = $("budget-list");
  const budgetStatus = $("budget-status");
  const budgetClear = $("budget-clear") as HTMLButtonElement;

  async function renderBudgets(): Promise<void> {
    const budgets = await listBudgets(caps.storage);
    budgetList.innerHTML = "";
    if (budgets.length === 0) {
      budgetStatus.textContent =
        "No budgets yet. Add one below — it only applies while the distraction blocker is on.";
      return;
    }
    budgetStatus.textContent = `${budgets.length} budget${budgets.length === 1 ? "" : "s"} — subdomains count too.`;
    for (const budget of budgets) {
      const row = document.createElement("div");
      row.className = "result-row";
      const left = document.createElement("div");
      left.className = "focus-rule-left";
      const title = document.createElement("span");
      title.className = "result-title";
      title.textContent = budget.hostname;
      const meta = document.createElement("span");
      meta.className = "result-meta";
      meta.textContent = `${budget.minutesPerDay} min/day`;
      left.append(title, meta);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "mini-btn danger";
      remove.textContent = "Delete";
      remove.addEventListener("click", () => {
        void removeBudget(caps.storage, budget.id).then(() => void renderBudgets());
      });
      row.append(left, remove);
      budgetList.appendChild(row);
    }
  }

  budgetAdd.addEventListener("click", () => {
    void (async () => {
      const minutes = Number(budgetMinutes.value) || 30;
      const rule = await saveBudget(caps.storage, budgetHost.value, minutes, caps.now());
      if (!rule) {
        budgetStatus.textContent =
          "That hostname looks invalid, or the budget limit was reached. Example: facebook.com";
        return;
      }
      budgetHost.value = "";
      budgetStatus.textContent = `Added ${rule.hostname} at ${rule.minutesPerDay} min/day.`;
      await renderBudgets();
    })();
  });

  budgetClear.addEventListener("click", () => {
    void clearBudgets(caps.storage).then(() => void renderBudgets());
  });

  stClear.addEventListener("click", () => {
    void clearScreenTime(caps.storage).then(() => void renderScreenTime());
  });

  /* Focus session (deep-work timer) ------------------------------------- */
  const sessionMinutes = $("session-minutes") as HTMLSelectElement;
  const sessionStart = $("session-start") as HTMLButtonElement;
  const sessionEnd = $("session-end") as HTMLButtonElement;
  const sessionAllowlist = $("session-allowlist") as HTMLInputElement;
  const sessionStatus = $("session-status");
  let sessionTimer: number | undefined;

  async function renderSession(): Promise<void> {
    const session = await readFocusSession(caps.storage);
    if (!session) {
      sessionEnd.disabled = true;
      sessionStatus.textContent =
        "No session active. Start one to block distracting sites everywhere for a set time — the overlay counts down and you can end it anytime.";
      return;
    }
    const remaining = Math.max(0, session.until - caps.now());
    if (remaining <= 0) {
      await endFocusSession(caps.storage);
      await renderSession();
      return;
    }
    sessionEnd.disabled = false;
    const allowText = session.allowlist.length > 0 ? ` · ${session.allowlist.join(", ")} allowed` : "";
    sessionStatus.textContent = `Session active — ends in ${formatRemaining(remaining)}${allowText}.`;
  }

  sessionStart.addEventListener("click", () => {
    void (async () => {
      const minutes = Number(sessionMinutes.value) || 45;
      const allowlist = sessionAllowlist.value
        .split(",")
        .map((h) => h.trim())
        .filter(Boolean);
      const session = await startFocusSession(caps.storage, minutes, allowlist, caps.now());
      sessionAllowlist.value = "";
      sessionStatus.textContent =
        `Session started — ${formatRemaining(session.until - session.startedAt)} of deep work. Every site except ${session.allowlist.length > 0 ? session.allowlist.join(", ") : "none"} is now covered.`;
      sessionEnd.disabled = false;
    })();
  });

  sessionEnd.addEventListener("click", () => {
    void endFocusSession(caps.storage).then(() => void renderSession());
  });

  void renderSession();
  if (sessionTimer !== undefined) window.clearInterval(sessionTimer);
  sessionTimer = window.setInterval(() => {
    void (async () => {
      const session = await readFocusSession(caps.storage);
      if (!session) return;
      await renderSession();
    })();
  }, 60_000);

  /* Pomodoro --------------------------------------------------------------- */
  const pomodoroFocus = $("pomodoro-focus") as HTMLButtonElement;
  const pomodoroBreak = $("pomodoro-break") as HTMLButtonElement;
  const pomodoroLongBreak = $("pomodoro-longbreak") as HTMLButtonElement;
  const pomodoroEnd = $("pomodoro-end") as HTMLButtonElement;
  const pomodoroStatus = $("pomodoro-status");
  let pomodoroTimer: number | undefined;

  async function renderPomodoro(): Promise<void> {
    const state = await readPomodoro(caps.storage, caps.now());
    if (!state) {
      pomodoroStatus.textContent =
        "No timer running. Start a focus session — the chip appears on the active tab and keeps counting even when this popup closes.";
      return;
    }
    const remaining = Math.max(0, state.until - caps.now());
    pomodoroStatus.textContent =
      `${phaseLabel(state.phase)} running — ${formatRemaining(remaining)} left. Next: ${phaseLabel(state.phase === "focus" ? "break" : "focus")}.`;
  }

  const startPomodoroPhase = (phase: "focus" | "break" | "longBreak"): void => {
    void (async () => {
      await startPomodoro(caps.storage, phase, caps.now());
      await renderPomodoro();
      const tab = await caps.getActiveTab();
      if (tab.id !== undefined) {
        await caps.sendMessage(tab.id, { type: "ok:pomodoro-start" }).catch(() => {
          // No content script on that page — the timer still runs.
        });
      }
    })();
  };

  pomodoroFocus.addEventListener("click", () => startPomodoroPhase("focus"));
  pomodoroBreak.addEventListener("click", () => startPomodoroPhase("break"));
  pomodoroLongBreak.addEventListener("click", () => startPomodoroPhase("longBreak"));
  pomodoroEnd.addEventListener("click", () => {
    void endPomodoro(caps.storage).then(() => void renderPomodoro());
  });

  void renderPomodoro();
  if (pomodoroTimer !== undefined) window.clearInterval(pomodoroTimer);
  pomodoroTimer = window.setInterval(() => {
    void renderPomodoro();
  }, 30_000);

  /* Habit tracker ----------------------------------------------------------- */
  const habitName = $("habit-name") as HTMLInputElement;
  const habitIcon = $("habit-icon") as HTMLInputElement;
  const habitAdd = $("habit-add") as HTMLButtonElement;
  const habitList = $("habit-list");
  const habitStatus = $("habit-status");
  const weekKeys = last7Keys();

  async function renderHabits(): Promise<void> {
    const habits = await listHabits(caps.storage);
    habitList.innerHTML = "";
    if (habits.length === 0) {
      habitStatus.textContent = "No habits yet. Add one — a 7-day grid and your streak appear here.";
      return;
    }
    habitStatus.textContent = `${habits.length} habit${habits.length === 1 ? "" : "s"} — check off today to keep the streak alive.`;
    for (const habit of habits) {
      const stats = habitStreak(habit, new Date());
      const row = document.createElement("div");
      row.className = "result-row habit-row";
      const head = document.createElement("div");
      const title = document.createElement("strong");
      title.className = "result-title";
      title.textContent = `${habit.icon} ${habit.name}`;
      const meta = document.createElement("span");
      meta.className = "result-meta";
      meta.textContent = `🔥 ${stats.streak}-day streak · ${stats.total} total · ${stats.last7}/7 this week`;
      head.append(title, meta);

      const grid = document.createElement("div");
      grid.className = "habit-week";
      for (const key of weekKeys) {
        const day = document.createElement("label");
        day.className = "habit-day";
        day.title = key;
        const box = document.createElement("input");
        box.type = "checkbox";
        box.checked = Boolean(habit.dates[key]);
        box.addEventListener("change", () => {
          void toggleHabitDay(habit.id, key, caps.storage).then(() => void renderHabits());
        });
        const span = document.createElement("span");
        span.textContent = weekdayLabel(key);
        day.append(box, span);
        grid.appendChild(day);
      }

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "mini-btn danger";
      remove.textContent = "Delete";
      remove.addEventListener("click", () => {
        void removeHabit(habit.id, caps.storage).then(() => void renderHabits());
      });
      row.append(head, grid, remove);
      habitList.appendChild(row);
    }
  }

  habitAdd.addEventListener("click", () => {
    void (async () => {
      try {
        await addHabit(habitName.value, habitIcon.value, caps.storage);
        habitName.value = "";
        habitStatus.textContent = "Habit added — check today's box to start the streak.";
        await renderHabits();
      } catch (err) {
        habitStatus.textContent = err instanceof Error ? err.message : "Could not add habit.";
      }
    })();
  });
  habitName.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      (habitAdd as HTMLButtonElement).click();
    }
  });

  renderDayPicker();
  void renderMasterToggle();
  void renderRules();
  void renderBudgets();
  void renderScreenTime();
  void renderHabits();
  return () => {
    if (sessionTimer !== undefined) window.clearInterval(sessionTimer);
    if (pomodoroTimer !== undefined) window.clearInterval(pomodoroTimer);
  };
}
