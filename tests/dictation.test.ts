import { describe, expect, it } from "vitest";
import { createRecognizer, speechRecognitionAvailable } from "../src/core/dictation";

describe("dictation", () => {
  it("reports availability based on the platform API", () => {
    // jsdom has no SpeechRecognition → not available there.
    expect(speechRecognitionAvailable()).toBe(false);
    expect(createRecognizer({ onResult: () => {}, onEnd: () => {}, onError: () => {} })).toBeNull();
  });
});
