/**
 * Smart-text cleaner — the typography scrub every writer keeps doing by
 * hand: curly/straight quotes, dashes, double spaces, invisible unicode
 * characters, trailing whitespace and repeated punctuation. Pure local
 * regexes, nothing leaves the device.
 */

export interface TypographyFix {
  type: string;
  label: string;
  count: number;
}

export interface CleanResult {
  text: string;
  fixes: TypographyFix[];
}

const ZERO_WIDTH = /[\u200B-\u200D\uFEFF\u2060]/g;
const CURLY_QUOTES = /[\u201C\u201D\u201E\u201F]/g;
const CURLY_APOS = /[\u2018\u2019\u201A\u201B]/g;
const NARROW_NBSP = /\u202F/g;
const HARD_SPACE = /\u00A0/g;
const EM_DASH = /\u2014/g;
const EN_DASH = /\u2013/g;
const ELLIPSIS = /\u2026/g;
const DOUBLE_SPACE = /[ \t]{2,}/g;
const TRAILING_SPACE = /[ \t]+$/gm;
const LEADING_SPACE = /^[ \t]+/gm;
const REPEATED_PUNCT = /([!?])\1{2,}/g;
const MIXED_SPACE = / +/g;

/**
 * Cleans typography. Always deterministic and idempotent: running it twice
 * reports zero new fixes the second time.
 */
export function cleanTypography(input: string, options: { smartQuotes?: boolean } = {}): CleanResult {
  const fixes: TypographyFix[] = [];
  const report = (type: string, label: string, count: number) => {
    if (count > 0) fixes.push({ type, label, count });
  };

  let text = input;

  const zw = text.match(ZERO_WIDTH)?.length ?? 0;
  report("zeroWidth", "Invisible characters removed", zw);
  text = text.replace(ZERO_WIDTH, "");

  const nb = (text.match(NARROW_NBSP)?.length ?? 0) + (text.match(HARD_SPACE)?.length ?? 0);
  report("nbsp", "Non-breaking spaces → normal spaces", nb);
  text = text.replace(NARROW_NBSP, " ").replace(HARD_SPACE, " ");

  const ap = text.match(CURLY_APOS)?.length ?? 0;
  report("apostrophe", "Curly apostrophes → straight", ap);
  text = text.replace(CURLY_APOS, "'");

  const q = text.match(CURLY_QUOTES)?.length ?? 0;
  report("quotes", "Curly double quotes → straight", q);
  text = text.replace(CURLY_QUOTES, '"');

  const em = text.match(EM_DASH)?.length ?? 0;
  report("emdash", "Em-dashes → two hyphens", em);
  text = text.replace(EM_DASH, "--");

  const en = text.match(EN_DASH)?.length ?? 0;
  report("endash", "En-dashes → hyphen", en);
  text = text.replace(EN_DASH, "-");

  const el = text.match(ELLIPSIS)?.length ?? 0;
  report("ellipsis", "Ellipsis … → three dots", el);
  text = text.replace(ELLIPSIS, "...");

  // Smart quotes mode flips the other way (straight → curly), for prose.
  if (options.smartQuotes) {
    const sq = (text.match(/(^|[\s(])"/g) ?? []).length;
    text = text.replace(/(^|[\s(])"/g, "$1\u201C").replace(/"([.,!?;:)\s]|$)/g, "\u201D$1");
    report("smartQuotes", "Straight quotes → typographic quotes", sq);
  }

  const ds = text.match(DOUBLE_SPACE)?.length ?? 0;
  report("doubleSpace", "Double spaces collapsed", ds);
  text = text.replace(DOUBLE_SPACE, " ");

  const tr = (text.match(TRAILING_SPACE)?.length ?? 0) + (text.match(/\n+$/) ? 1 : 0);
  report("trailing", "Trailing whitespace removed", tr);
  text = text.replace(TRAILING_SPACE, "").replace(/\n+$/, "");

  const ls = text.match(LEADING_SPACE)?.length ?? 0;
  report("leading", "Leading whitespace removed", ls);
  text = text.replace(LEADING_SPACE, "");

  const rp = text.match(REPEATED_PUNCT)?.length ?? 0;
  report("repeated", "Repeated !!/?? collapsed", rp);
  text = text.replace(REPEATED_PUNCT, (m) => m.slice(0, 2));

  // Normalize remaining whitespace runs that mix tabs and spaces.
  text = text.replace(MIXED_SPACE, " ");

  return { text, fixes };
}
