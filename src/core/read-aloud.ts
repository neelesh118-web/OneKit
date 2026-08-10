/**
 * Read aloud — wraps the browser's built-in speech synthesis (no network,
 * no API keys). The content script feeds it selections or page text; a
 * small stop chip appears while speaking.
 */

export interface SpeakOptions {
  rate?: number;
  pitch?: number;
}

export const MAX_READ_ALOUD_CHARS = 4000;

export function speechSynthesisAvailable(): boolean {
  return (
    typeof window !== "undefined" &&
    "speechSynthesis" in window &&
    "SpeechSynthesisUtterance" in window
  );
}

function pickEnglishVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const english = voices.filter((v) => v.lang?.toLowerCase().startsWith("en"));
  return (
    english.find((v) => v.localService) ??
    english.find((v) => v.name?.toLowerCase().includes("google")) ??
    english[0] ??
    null
  );
}

/** Starts reading `text` aloud. Returns false when speech is unavailable. */
export function speakText(text: string, options: SpeakOptions = {}): boolean {
  if (!speechSynthesisAvailable()) return false;
  const clean = text.replace(/\s+/g, " ").trim().slice(0, MAX_READ_ALOUD_CHARS);
  if (!clean) return false;
  const synthesis = window.speechSynthesis;
  synthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(clean);
  const voices = synthesis.getVoices();
  const voice = pickEnglishVoice(voices);
  if (voice) utterance.voice = voice;
  utterance.rate = options.rate ?? 1;
  utterance.pitch = options.pitch ?? 1;
  synthesis.speak(utterance);
  return true;
}

export function stopSpeaking(): void {
  if (speechSynthesisAvailable()) window.speechSynthesis.cancel();
}

export function isSpeaking(): boolean {
  return speechSynthesisAvailable() && window.speechSynthesis.speaking;
}
