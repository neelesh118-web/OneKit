import { localStorageArea, type KvStorage } from "./storage-utils";

/**
 * Pomodoro — a simple focus/break cycle timer that lives in local storage so
 * it survives the popup closing. The countdown overlay on the active tab is
 * driven by this state; the state machine itself is browser-free.
 */

export const POMODORO_STORAGE_KEY = "ok.pomodoro";

export type PomodoroPhase = "focus" | "break" | "longBreak";

export interface PomodoroState {
  phase: PomodoroPhase;
  startedAt: number;
  until: number;
  /** Completed focus sessions in the current cycle set. */
  cycleCount: number;
}

export const POMODORO_DURATIONS: Record<PomodoroPhase, number> = {
  focus: 25 * 60,
  break: 5 * 60,
  longBreak: 15 * 60
};

export function isPomodoroState(value: unknown): value is PomodoroState {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    (v.phase === "focus" || v.phase === "break" || v.phase === "longBreak") &&
    typeof v.startedAt === "number" &&
    typeof v.until === "number" &&
    typeof v.cycleCount === "number"
  );
}

async function readState(storage: KvStorage): Promise<PomodoroState | null> {
  const raw = await storage.get(POMODORO_STORAGE_KEY);
  const value = raw[POMODORO_STORAGE_KEY];
  return isPomodoroState(value) ? value : null;
}

/** Starts a phase. After 4 focus sessions the next break is a long break. */
export async function startPomodoro(
  storage: KvStorage,
  phase: PomodoroPhase,
  now: number = Date.now()
): Promise<PomodoroState> {
  const current = await readState(storage);
  const nextCycle =
    phase === "focus" ? (current?.cycleCount ?? 0) + 1 : current?.cycleCount ?? 0;
  const duration = POMODORO_DURATIONS[phase];
  const state: PomodoroState = {
    phase,
    startedAt: now,
    until: now + duration * 1000,
    cycleCount: nextCycle
  };
  await storage.set({ [POMODORO_STORAGE_KEY]: state });
  return state;
}

/** Returns the active state, auto-clearing an expired timer. */
export async function readPomodoro(storage: KvStorage, now: number = Date.now()): Promise<PomodoroState | null> {
  const state = await readState(storage);
  if (!state) return null;
  if (state.until <= now) {
    await storage.remove(POMODORO_STORAGE_KEY);
    return null;
  }
  return state;
}

export async function endPomodoro(storage: KvStorage): Promise<void> {
  await storage.remove(POMODORO_STORAGE_KEY);
}

/** The next phase to run after the current one completes. */
export function nextPhase(state: PomodoroState): PomodoroPhase {
  if (state.phase === "focus") {
    return state.cycleCount % 4 === 0 ? "longBreak" : "break";
  }
  return "focus";
}

export function phaseLabel(phase: PomodoroPhase): string {
  if (phase === "focus") return "Focus";
  if (phase === "break") return "Short break";
  return "Long break";
}

export function localStoragePomodoro(): KvStorage {
  return localStorageArea();
}
