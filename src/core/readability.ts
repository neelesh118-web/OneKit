/**
 * Reading-time and grade-level metrics for any page text. Reuses the
 * reader's word counter and adds sentence/syllable analysis for a
 * Flesch–Kincaid grade level. Pure and testable — no DOM, no network.
 */
import { countWords, readingMinutes } from "./reader-extract";

export interface ReadabilityMetrics {
  words: number;
  characters: number;
  sentences: number;
  /** Reading time in minutes (200 wpm, min 1). */
  minutes: number;
  /** Flesch–Kincaid grade level (1–18, one decimal). 0 = not enough text. */
  gradeLevel: number;
}

/** Approximate syllables per word via vowel-group counting. */
export function countSyllables(word: string): number {
  const lower = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!lower) return 0;
  // Vowel groups — "aeiouy" runs count as one syllable each.
  const groups = lower.match(/[aeiouy]+/g);
  let count = groups ? groups.length : 0;
  // Silent final e ("make", "home") usually doesn't add a syllable.
  if (count > 1 && lower.endsWith("e")) count -= 1;
  // "le" endings add one back ("table", "cable", "bottle" = 2).
  if (lower.endsWith("le")) count += 1;
  return Math.max(1, count);
}

/** Splits text into sentences on terminal punctuation. */
export function countSentences(text: string): number {
  const matches = text.match(/[^.!?]+[.!?]+/g);
  const hard = matches ? matches.length : 0;
  // Trailing sentence without punctuation still counts as one.
  const trimmed = text.trim();
  return hard + (trimmed && !/[.!?]$/.test(trimmed) ? 1 : 0);
}

export function fleschKincaidGrade(words: number, sentences: number, syllables: number): number {
  if (words < 20 || sentences === 0) return 0;
  const grade = 0.39 * (words / sentences) + 11.8 * (syllables / words) - 15.59;
  return Math.round(Math.min(18, Math.max(1, grade)) * 10) / 10;
}

export function readingMetrics(text: string): ReadabilityMetrics {
  const words = countWords(text);
  const sentences = countSentences(text);
  const syllables = words === 0 ? 0 : countSyllables(text);
  return {
    words,
    characters: text.replace(/\s/g, "").length,
    sentences,
    minutes: readingMinutes(words),
    gradeLevel: fleschKincaidGrade(words, sentences, syllables)
  };
}

/** Friendly label for a grade level (0 = not enough text). */
export function gradeLevelLabel(grade: number): string {
  if (grade <= 0) return "—";
  if (grade <= 6) return `${grade} (easy — most adults)`;
  if (grade <= 10) return `${grade} (moderate)`;
  if (grade <= 14) return `${grade} (college)` ;
  return `${grade} (advanced)`;
}
