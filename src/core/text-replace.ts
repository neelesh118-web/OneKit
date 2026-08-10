/**
 * Text find & replace — pure local transform on pasted text, with a
 * case-sensitive toggle and a replace count. The on-page version lives in
 * find-replace.ts; this one works on text you paste into the popup.
 */

export interface ReplaceResult {
  output: string;
  count: number;
}

export function replaceInText(input: string, find: string, replace: string, caseSensitive = false): ReplaceResult {
  if (!find) return { output: input, count: 0 };
  const flags = caseSensitive ? "g" : "gi";
  const pattern = find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const count = (input.match(new RegExp(pattern, flags)) ?? []).length;
  if (count === 0) return { output: input, count: 0 };
  return { output: input.replace(new RegExp(pattern, flags), replace), count };
}
