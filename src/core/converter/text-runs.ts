/**
 * Shared text-run extractor for the binary document readers (Sony LRF,
 * WordPerfect, and friends). These formats interleave printable UTF-16LE
 * text with function codes / control tags; the honest extraction is to walk
 * the code units, drop the marker ranges, and keep the printable runs —
 * the same lossy-but-real rule every other text reader follows here.
 */

export interface Utf16RunOptions {
  /** Drop code units in the 0xF500–0xF5FF tag range (Sony LRF markers). */
  skipTagRange?: boolean;
  /** Drop code units whose low byte is a control char (WordPerfect
   * function codes land there when they split a character pair). */
  skipControlLowByte?: boolean;
}

/** Extract printable UTF-16LE text runs from raw bytes. */
export function utf16Runs(bytes: Uint8Array, opts: Utf16RunOptions = {}): string[] {
  const units = new Uint16Array(bytes.buffer, bytes.byteOffset, Math.floor(bytes.length / 2));
  const runs: string[] = [];
  let run = "";
  const push = (): void => {
    const text = run.trim();
    // Require some real letters — marker/garbage runs collapse to nothing.
    if (text.length >= 2 && /[A-Za-z0-9\u00C0-\uFFFF]/.test(text)) runs.push(text);
    run = "";
  };
  for (let i = 0; i < units.length; i++) {
    const u = units[i]!;
    const low = u & 0xff;
    const isControl = u < 0x20 || (u >= 0x7f && u <= 0x9f);
    const isTag = opts.skipTagRange && u >= 0xf500 && u <= 0xf5ff;
    const badLow = opts.skipControlLowByte && low < 0x20 && u >= 0x80;
    if (isControl || isTag || badLow) {
      push();
      continue;
    }
    // Keep only characters that can actually appear in prose: letters,
    // digits, punctuation, CJK, emoji. Drop lone surrogates.
    if (u >= 0x20 && u !== 0xfffd && !(u >= 0xd800 && u <= 0xdfff)) {
      run += String.fromCharCode(u);
    } else {
      push();
    }
  }
  push();
  return runs;
}
