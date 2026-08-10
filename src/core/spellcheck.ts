/**
 * Local spell-checker — tokenizes text, skips URLs/emails/numbers, and
 * flags words missing from a bundled wordlist with edit-distance ≤ 2
 * suggestions. Fully offline; proper nouns and jargon will be flagged
 * (the UI says so honestly).
 */

export interface Misspelling {
  word: string;
  start: number;
  end: number;
  suggestions: string[];
}

/** Tokens we never spell-check: URLs, emails, hashtags, mentions, numbers, currency. */
const SKIP_TOKEN_RE =
  /(?:https?:\/\/|www\.)\S+|[\w.+-]+@[\w.-]+\.[a-z]{2,}|#\w+|@\w+|(?:[\d,.]+%?|\$\d[\d,.]*|\d+(?:\.\d+)?)/gi;

const WORD_RE = /[A-Za-z']+/g;

export interface SpellToken {
  word: string;
  start: number;
  end: number;
}

/** Extracts word tokens, skipping URLs/emails/numbers via a combined scan. */
export function tokenizeWords(text: string): SpellToken[] {
  const tokens: SpellToken[] = [];
  const skip = new Set<number>();
  for (const m of text.matchAll(SKIP_TOKEN_RE)) {
    if (m.index === undefined) continue;
    for (let i = m.index; i < m.index + m[0].length; i++) skip.add(i);
  }
  for (const m of text.matchAll(WORD_RE)) {
    if (m.index === undefined) continue;
    const start = m.index;
    const end = m.index + m[0].length;
    let word = m[0];
    let s = start;
    // Skip tokens that overlap a skipped region.
    let overlapped = false;
    for (let i = s; i < end; i++) {
      if (skip.has(i)) {
        overlapped = true;
        break;
      }
    }
    if (overlapped) continue;
    // Trim stray apostrophes at the edges ("'hello'" → "hello").
    word = word.replace(/^'+|'+$/g, "");
    if (!word) continue;
    const leadingApostrophes = m[0].length - m[0].replace(/^'+/, "").length;
    s = start + leadingApostrophes;
    if (word.length < 2) continue;
    tokens.push({ word, start: s, end: s + word.length });
  }
  return tokens;
}

export function normalizeForCheck(word: string): string {
  let w = word.toLowerCase();
  // Possessive: "john's" → "john", "boss'" → "boss"
  if (w.endsWith("'s")) w = w.slice(0, -2);
  else if (w.endsWith("'")) w = w.slice(0, -1);
  return w;
}

/** All single-edit variants of a word (insert / delete / replace / transpose). */
export function editVariants(word: string): string[] {
  const out = new Set<string>();
  const letters = "abcdefghijklmnopqrstuvwxyz";
  // deletions
  for (let i = 0; i < word.length; i++) out.add(word.slice(0, i) + word.slice(i + 1));
  // transpositions
  for (let i = 0; i < word.length - 1; i++) {
    out.add(word.slice(0, i) + word[i + 1] + word[i] + word.slice(i + 2));
  }
  // replacements
  for (let i = 0; i < word.length; i++) {
    for (const c of letters) out.add(word.slice(0, i) + c + word.slice(i + 1));
  }
  // insertions
  for (let i = 0; i <= word.length; i++) {
    for (const c of letters) out.add(word.slice(0, i) + c + word.slice(i));
  }
  return [...out];
}

export interface SpellChecker {
  check(text: string): Misspelling[];
  suggest(word: string, max?: number): string[];
}

export function createSpellChecker(words: readonly string[]): SpellChecker {
  const set = new Set(words.map((w) => w.toLowerCase()));
  const seen: Record<string, string[]> = {};

  function suggest(word: string, max = 5): string[] {
    const norm = normalizeForCheck(word);
    if (set.has(norm)) return [];
    if (seen[norm]) return seen[norm].slice(0, max);
    // Distance 1 hits first — the correct fix for a typo is almost always
    // one edit away, so it must never be crowded out by junk distance-2 words.
    const d1 = new Set<string>();
    for (const v of editVariants(norm)) {
      if (set.has(v)) d1.add(v);
    }
    const d2 = new Set<string>();
    if (d1.size < max) {
      for (const v of editVariants(norm)) {
        for (const v2 of editVariants(v)) {
          if (set.has(v2) && !d1.has(v2)) d2.add(v2);
        }
      }
    }
    const rank = (a: string, b: string) => a.length - b.length || a.localeCompare(b);
    seen[norm] = [...d1].sort(rank).concat([...d2].sort(rank));
    return seen[norm].slice(0, max);
  }

  function check(text: string): Misspelling[] {
    const out: Misspelling[] = [];
    for (const token of tokenizeWords(text)) {
      const norm = normalizeForCheck(token.word);
      if (set.has(norm)) continue;
      // Single letters and acronyms (all caps, ≤ 4 chars) are skipped.
      if (norm.length < 2) continue;
      if (token.word === token.word.toUpperCase() && token.word.length <= 4) continue;
      out.push({ word: token.word, start: token.start, end: token.end, suggestions: suggest(norm, 3) });
    }
    return out;
  }

  return { check, suggest };
}
