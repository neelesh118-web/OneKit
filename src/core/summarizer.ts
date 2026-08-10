/**
 * Local TL;DR summarizer — extractive sentence scoring, fully on-device.
 *
 * Real summarizers need a model; this one is honest about being heuristic:
 * it scores each sentence by word frequency (with stop-words removed),
 * position (lead sentence bias — news style), and length, then picks the
 * top-N. It's a genuinely useful TL;DR for news and articles, with zero
 * network and zero model weight. The popup says "heuristic, not AI" so
 * nobody mistakes it for a language model.
 */

export interface SummaryOptions {
  /** Number of sentences to keep. */
  maxSentences?: number;
  /** Target max characters (overrides maxSentences when tighter). */
  maxChars?: number;
}

export const DEFAULT_STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "if", "then", "so", "of", "in", "on",
  "at", "to", "for", "with", "from", "by", "about", "as", "is", "are", "was",
  "were", "be", "been", "being", "have", "has", "had", "do", "does", "did",
  "will", "would", "can", "could", "should", "may", "might", "must", "not",
  "no", "nor", "this", "that", "these", "those", "it", "its", "he", "she",
  "they", "them", "we", "you", "i", "me", "my", "your", "our", "their", "his",
  "her", "there", "here", "where", "when", "why", "how", "what", "which", "who",
  "whom", "more", "most", "some", "any", "all", "each", "every", "both", "few"
]);

/** Splits text into sentences (keeps the sentence punctuation). */
export function splitSentences(text: string): string[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (!cleaned) return [];
  const parts = cleaned.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g);
  return (parts ?? [])
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Word-frequency map with stop-words removed and stems approximated. */
export function wordFrequencies(text: string): Map<string, number> {
  const freqs = new Map<string, number>();
  const words = text.toLowerCase().match(/[a-z]{3,}/g) ?? [];
  for (const word of words) {
    if (DEFAULT_STOP_WORDS.has(word)) continue;
    freqs.set(word, (freqs.get(word) ?? 0) + 1);
  }
  return freqs;
}

export interface ScoredSentence {
  sentence: string;
  score: number;
  /** Original position (0-based) — used to re-order the summary. */
  index: number;
}

/**
 * Scores sentences: frequency (sum of non-stop word counts, normalized),
 * position bias (news-style: earlier sentences score higher), and a length
 * penalty for both extremes.
 */
export function scoreSentences(sentences: string[], freqs: Map<string, number>): ScoredSentence[] {
  const maxFreq = Math.max(1, ...freqs.values());
  return sentences.map((sentence, index) => {
    const words = sentence.toLowerCase().match(/[a-z]{3,}/g) ?? [];
    let freqScore = 0;
    for (const word of words) {
      if (DEFAULT_STOP_WORDS.has(word)) continue;
      freqScore += (freqs.get(word) ?? 0) / maxFreq;
    }
    const positionScore = sentences.length > 1 ? 1 - index / (sentences.length - 1) : 1;
    // Mild length penalty — very short (junk) and very long sentences.
    const lengthPenalty = words.length < 6 ? 0.5 : words.length > 60 ? 0.6 : 1;
    const score = (freqScore + positionScore) * lengthPenalty;
    return { sentence, score, index };
  });
}

/** Picks the top sentences by score, then re-orders them by position. */
export function selectSentences(scored: ScoredSentence[], maxSentences: number): ScoredSentence[] {
  return [...scored]
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, maxSentences))
    .sort((a, b) => a.index - b.index);
}

/** Full summarization pipeline. */
export function summarizeText(text: string, options: SummaryOptions = {}): string {
  const sentences = splitSentences(text);
  if (sentences.length === 0) return "";
  if (sentences.length <= 2) return sentences.join(" ");
  const freqs = wordFrequencies(text);
  const scored = scoreSentences(sentences, freqs);
  const maxSentences = Math.min(sentences.length, options.maxSentences ?? 4);
  const selected = selectSentences(scored, maxSentences);

  // Apply the character cap after selection if provided.
  const maxChars = options.maxChars ?? 800;
  let out: string[] = [];
  let length = 0;
  for (const item of selected) {
    if (out.length > 0 && length + item.sentence.length > maxChars) break;
    out.push(item.sentence);
    length += item.sentence.length;
  }
  return out.join(" ");
}

/** Coverage ratio 0..1: how much of the original's unique vocabulary appears. */
export function summaryStats(text: string, summary: string): { words: number; chars: number; coverage: number } {
  const words = (text.match(/[a-z]{3,}/gi) ?? []).length;
  const summaryWords = (summary.match(/[a-z]{3,}/gi) ?? []).length;
  const all = new Set((text.toLowerCase().match(/[a-z]{3,}/g) ?? []));
  const kept = new Set((summary.toLowerCase().match(/[a-z]{3,}/g) ?? []));
  let keptNotStop = 0;
  for (const w of kept) if (!DEFAULT_STOP_WORDS.has(w)) keptNotStop++;
  const coverage = all.size === 0 ? 0 : keptNotStop / all.size;
  return { words: summaryWords, chars: summary.length, coverage: Math.min(1, coverage) };
}
