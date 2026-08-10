import { describe, expect, it } from "vitest";
import {
  MAX_READ_ALOUD_CHARS,
  speechSynthesisAvailable,
  speakText,
  stopSpeaking
} from "../src/core/read-aloud";

describe("read-aloud", () => {
  it("reports unavailability in environments without speech", () => {
    // jsdom has no speechSynthesis, so the module must degrade honestly.
    expect(speechSynthesisAvailable()).toBe(false);
    expect(speakText("hello")).toBe(false);
    expect(() => stopSpeaking()).not.toThrow();
  });

  it("caps the text length at a sane reading limit", () => {
    expect(MAX_READ_ALOUD_CHARS).toBe(4000);
  });
});
