/**
 * Text case converter — pure transforms, no DOM, no network.
 */

export type CaseStyle =
  | "upper"
  | "lower"
  | "title"
  | "sentence"
  | "camel"
  | "pascal"
  | "kebab"
  | "snake"
  | "constant"
  | "dot";

export const CASE_STYLES: Array<{ id: CaseStyle; label: string; example: string }> = [
  { id: "upper", label: "UPPER CASE", example: "HELLO WORLD" },
  { id: "lower", label: "lower case", example: "hello world" },
  { id: "title", label: "Title Case", example: "Hello World" },
  { id: "sentence", label: "Sentence case", example: "Hello world" },
  { id: "camel", label: "camelCase", example: "helloWorld" },
  { id: "pascal", label: "PascalCase", example: "HelloWorld" },
  { id: "kebab", label: "kebab-case", example: "hello-world" },
  { id: "snake", label: "snake_case", example: "hello_world" },
  { id: "constant", label: "CONSTANT_CASE", example: "HELLO_WORLD" },
  { id: "dot", label: "dot.case", example: "hello.world" }
];

/** Splits any input into lowercase words, tolerating mixed separators. */
export function splitWords(text: string): string[] {
  const words = text
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2") // camelCase boundary
    .replace(/[^a-zA-Z0-9]+/g, " ") // any separator → space
    .trim()
    .toLowerCase()
    .split(/\s+/);
  return words.filter(Boolean);
}

const SMALL_WORDS = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "in", "nor", "of", "on", "or", "the", "to", "up", "via", "with"]);

/** Title case: capitalises significant words, keeping small words lower
 * unless they open the string. */
export function toTitleCase(text: string): string {
  const words = splitWords(text);
  return words
    .map((word, i) => {
      if (i > 0 && SMALL_WORDS.has(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

/** Sentence case: first letter of the first word capitalised, rest lower. */
export function toSentenceCase(text: string): string {
  const words = splitWords(text);
  if (words.length === 0) return "";
  return words[0]!.charAt(0).toUpperCase() + words[0]!.slice(1) + (words.length > 1 ? " " + words.slice(1).join(" ") : "");
}

export function convertCase(text: string, style: CaseStyle): string {
  const words = splitWords(text);
  switch (style) {
    case "upper":
      return text.toUpperCase();
    case "lower":
      return text.toLowerCase();
    case "title":
      return toTitleCase(text);
    case "sentence":
      return toSentenceCase(text);
    case "camel":
      return words
        .map((w, i) => (i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1)))
        .join("");
    case "pascal":
      return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("");
    case "kebab":
      return words.join("-");
    case "snake":
      return words.join("_");
    case "constant":
      return words.join("_").toUpperCase();
    case "dot":
      return words.join(".");
  }
}
