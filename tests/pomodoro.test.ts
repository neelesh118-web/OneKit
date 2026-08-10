import { describe, expect, it } from "vitest";
import {
  endPomodoro,
  nextPhase,
  POMODORO_DURATIONS,
  phaseLabel,
  readPomodoro,
  startPomodoro
} from "../src/core/pomodoro";
import { createMemoryStorage } from "../src/core/storage-utils";

const storage = () => createMemoryStorage();
const NOW = 1_000_000;

describe("pomodoro", () => {
  it("starts a focus phase with the right duration", async () => {
    const s = storage();
    const state = await startPomodoro(s, "focus", NOW);
    expect(state.phase).toBe("focus");
    expect(state.until - state.startedAt).toBe(POMODORO_DURATIONS.focus * 1000);
    expect(state.cycleCount).toBe(1);
  });

  it("counts focus cycles across phases", async () => {
    const s = storage();
    await startPomodoro(s, "focus", NOW);
    await startPomodoro(s, "break", NOW + 1000);
    const second = await startPomodoro(s, "focus", NOW + 2000);
    expect(second.cycleCount).toBe(2);
  });

  it("reads an active state and auto-clears an expired one", async () => {
    const s = storage();
    await startPomodoro(s, "focus", NOW);
    expect((await readPomodoro(s, NOW + 60_000))?.phase).toBe("focus");
    expect(await readPomodoro(s, NOW + POMODORO_DURATIONS.focus * 1000 + 1)).toBeNull();
    await endPomodoro(s);
    expect(await readPomodoro(s, NOW)).toBeNull();
  });

  it("suggests the next phase (long break every 4 focus sessions)", () => {
    const focus1 = { phase: "focus" as const, cycleCount: 1, startedAt: 0, until: 1 };
    const focus4 = { phase: "focus" as const, cycleCount: 4, startedAt: 0, until: 1 };
    expect(nextPhase(focus1)).toBe("break");
    expect(nextPhase(focus4)).toBe("longBreak");
    const brk = { phase: "break" as const, cycleCount: 1, startedAt: 0, until: 1 };
    expect(nextPhase(brk)).toBe("focus");
  });

  it("labels phases readably", () => {
    expect(phaseLabel("focus")).toBe("Focus");
    expect(phaseLabel("break")).toBe("Short break");
    expect(phaseLabel("longBreak")).toBe("Long break");
  });
});
