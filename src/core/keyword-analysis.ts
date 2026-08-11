/**
 * Page keyword analyzer — word frequencies, repeated phrases and keyword
 * density for the visible text of a page, computed entirely on-device.
 * Honest about being a heuristic: it's a frequency report, not an SEO
 * verdict.
 */

export interface KeywordStat {
  word: string;
  count: number;
}

export interface PhraseStat {
  phrase: string;
  count: number;
}

export interface KeywordAnalysis {
  totalWords: number;
  uniqueWords: number;
  words: KeywordStat[];
  phrases: PhraseStat[];
  /** Approximate reading time in minutes (200 wpm). */
  readingMinutes: number;
}

const STOPWORDS = new Set(
  (
    "a,an,the,and,or,but,if,then,else,when,while,of,at,by,for,with,about,against," +
    "between,into,through,during,before,after,above,below,to,from,up,down,in,out,on,off," +
    "over,under,again,further,then,once,here,there,all,any,both,each,few,more,most,other," +
    "some,such,no,nor,not,only,own,same,so,than,too,very,s,can,will,just,should,now,is,are," +
    "was,were,be,been,being,have,has,had,having,do,does,did,doing,would,could,ought,i'm," +
    "you,he,she,it,we,they,them,his,her,its,our,their,your,me,him,us,this,that,these,those," +
    "am,as,also,get,got,one,two,what,which,who,whom,how,why,etc,eg,ie,vs,via,may,might," +
    "shall,need,make,made,use,used,using,see,saw,seen,way,ways,thing,things,page,pages,site,"
  ).split(",")
);

/** Normalized tokens: lowercase alphanumeric words with hyphens preserved. */
export function tokenize(text: string): string[] {
  const matches = text.toLowerCase().match(/[a-z0-9][a-z0-9-]*/g) ?? [];
  return matches.filter((w) => w.length > 1);
}

/** Word frequency, stopwords excluded, sorted by count then alphabetically. */
export function wordFrequency(text: string, limit = 20): KeywordStat[] {
  const counts = new Map<string, number>();
  for (const w of tokenize(text)) {
    if (STOPWORDS.has(w)) continue;
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count || a.word.localeCompare(b.word))
    .slice(0, limit);
}

/**
 * Repeated phrases (2–3 word windows with stopwords removed). A phrase is
 * only reported when it appears at least twice, so it's signal, not noise.
 */
export function phraseFrequency(text: string, limit = 12): PhraseStat[] {
  const tokens = tokenize(text).filter((w) => !STOPWORDS.has(w));
  const counts = new Map<string, number>();
  for (let i = 0; i < tokens.length - 1; i++) {
    for (const size of [2, 3] as const) {
      const window = tokens.slice(i, i + size);
      if (window.length < size) continue;
      counts.set(window.join(" "), (counts.get(window.join(" ")) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= 2)
    .map(([phrase, count]) => ({ phrase, count }))
    .sort((a, b) => b.count - a.count || a.phrase.localeCompare(b.phrase))
    .slice(0, limit);
}

export function analyzeKeywords(text: string, options: { wordLimit?: number; phraseLimit?: number } = {}): KeywordAnalysis {
  const totalWords = tokenize(text).length;
  const words = wordFrequency(text, options.wordLimit ?? 20);
  const phrases = phraseFrequency(text, options.phraseLimit ?? 12);
  return {
    totalWords,
    uniqueWords: words.length,
    words,
    phrases,
    readingMinutes: Math.max(1, Math.round(totalWords / 200))
  };
}

/** Markdown report for the popup copy button. */
export function keywordReport(analysis: KeywordAnalysis): string {
  const lines: string[] = [
    `# Keyword analysis`,
    ``,
    `**${analysis.totalWords} words** · **${analysis.uniqueWords} tracked terms** · ~${analysis.readingMinutes} min read`,
    ``,
    `## Top words`,
    ...analysis.words.map((w) => `- ${w.word} — ${w.count}×`),
    ``,
    `## Repeated phrases`,
    ...(analysis.phrases.length ? analysis.phrases.map((p) => `- ${p.phrase} — ${p.count}×`) : ["- none found"]),
    ``
  ];
  return lines.join("\n");
}
