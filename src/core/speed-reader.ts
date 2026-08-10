/**
 * Speed reader — RSVP (Rapid Serial Visual Presentation) word-by-word
 * reading: one word at a time, centered, at a fixed rate, so your eyes
 * never move. No AI, no model — pure timing math. 100% local.
 *
 * The overlay itself lives in the content script; this module owns the
 * pure logic: tokenizing a page into displayable words, pacing, and the
 * word-position math that keeps the reader deterministic and testable.
 */

export interface SpeedReaderOptions {
  /** Pause longer after punctuation (.!? —) so rhythm feels natural. */
  pauseAfterPunctuation?: boolean;
}

export const SPEED_READER_MIN_WPM = 100;
export const SPEED_READER_MAX_WPM = 900;

export function normalizeWpm(raw: number): number {
  if (!Number.isFinite(raw)) return 300;
  return Math.max(SPEED_READER_MIN_WPM, Math.min(SPEED_READER_MAX_WPM, Math.round(raw)));
}

/** Milliseconds per word at a given WPM. */
export function msPerWord(wpm: number): number {
  const safe = normalizeWpm(wpm);
  return Math.round(60_000 / safe);
}

/** True when a word ends in sentence punctuation that deserves a pause. */
export function endsWithPunctuation(word: string): boolean {
  return /[.!?;:]$/.test(word);
}

/** Pause multiplier after sentence-ending punctuation (1.6× feels natural). */
export const PUNCTUATION_PAUSE_MULTIPLIER = 1.6;

export interface ReaderToken {
  word: string;
  /** How long to display this token, in ms. */
  durationMs: number;
}

/**
 * Tokenizes plain text into reader tokens with per-token durations.
 * Long words get a little more time (up to +60% over the base) so they're
 * readable at speed; punctuation gets a 1.6× pause.
 */
export function tokenizeForReading(text: string, wpm: number, options: SpeedReaderOptions = {}): ReaderToken[] {
  const words = text
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0);
  const base = msPerWord(wpm);
  return words.map((word) => {
    let duration = base;
    if (word.length >= 10) duration = Math.round(base * 1.4);
    else if (word.length >= 7) duration = Math.round(base * 1.2);
    if (options.pauseAfterPunctuation && endsWithPunctuation(word)) {
      duration = Math.round(duration * PUNCTUATION_PAUSE_MULTIPLIER);
    }
    return { word, durationMs: duration };
  });
}

/** Extracts a readable text block from a page (article-first, body fallback). */
export function readerTextFromDocument(doc: Document): string {
  const main =
    doc.querySelector<HTMLElement>("article, main, [role='main'], .post, .entry-content") ??
    doc.body;
  const text = (main?.innerText ?? doc.body?.innerText ?? "").replace(/\s+/g, " ").trim();
  return text.slice(0, 60_000);
}

export interface ReadingPlan {
  tokens: ReaderToken[];
  totalMs: number;
  estimatedSeconds: number;
}

/** Builds a full reading plan (tokens + timing totals). */
export function planReading(text: string, wpm: number, options: SpeedReaderOptions = {}): ReadingPlan {
  const tokens = tokenizeForReading(text, wpm, options);
  const totalMs = tokens.reduce((sum, t) => sum + t.durationMs, 0);
  return { tokens, totalMs, estimatedSeconds: Math.round(totalMs / 1000) };
}
