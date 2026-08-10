import {
  base64Decode,
  base64Encode,
  formatDate,
  formatJson,
  minifyJson,
  sha256Hex,
  simpleDiff,
  testRegex,
  timestampToDate,
  toCamelCase,
  toKebabCase,
  toSnakeCase,
  toTitleCase,
  urlDecode,
  urlEncode
} from "../core/dev-tools";
import type { OneKitCapabilities } from "./capabilities";

/**
 * Dev tab — the text & dev toolbox: JSON, Base64, URL, case, hash,
 * timestamps, regex and diff. Every tool is a pure local computation.
 */
export function createDevController(_caps: OneKitCapabilities): () => void {
  const $ = (id: string): HTMLElement => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Missing element #${id}`);
    return el;
  };

  /* JSON ------------------------------------------------------------- */
  const jsonInput = $("dev-json-input") as HTMLTextAreaElement;
  const jsonOutput = $("dev-json-output") as HTMLTextAreaElement;
  const runJson = (mode: "format" | "minify"): void => {
    const result = mode === "format" ? formatJson(jsonInput.value) : minifyJson(jsonInput.value);
    jsonOutput.value = result.ok ? result.value : `Error: ${result.error}`;
  };
  $("dev-json-format").addEventListener("click", () => runJson("format"));
  $("dev-json-minify").addEventListener("click", () => runJson("minify"));

  /* Base64 ----------------------------------------------------------- */
  const b64Input = $("dev-b64-input") as HTMLTextAreaElement;
  const b64Output = $("dev-b64-output") as HTMLTextAreaElement;
  $("dev-b64-encode").addEventListener("click", () => {
    b64Output.value = base64Encode(b64Input.value);
  });
  $("dev-b64-decode").addEventListener("click", () => {
    const result = base64Decode(b64Input.value);
    b64Output.value = result.ok ? result.value : `Error: ${result.error}`;
  });

  /* URL -------------------------------------------------------------- */
  const urlInput = $("dev-url-input") as HTMLInputElement;
  const urlOutput = $("dev-url-output") as HTMLInputElement;
  $("dev-url-encode").addEventListener("click", () => {
    urlOutput.value = urlEncode(urlInput.value);
  });
  $("dev-url-decode").addEventListener("click", () => {
    const result = urlDecode(urlInput.value);
    urlOutput.value = result.ok ? result.value : `Error: ${result.error}`;
  });

  /* Case ------------------------------------------------------------- */
  const caseInput = $("dev-case-input") as HTMLInputElement;
  const caseOutput = $("dev-case-output") as HTMLInputElement;
  $("dev-case-title").addEventListener("click", () => (caseOutput.value = toTitleCase(caseInput.value)));
  $("dev-case-camel").addEventListener("click", () => (caseOutput.value = toCamelCase(caseInput.value)));
  $("dev-case-snake").addEventListener("click", () => (caseOutput.value = toSnakeCase(caseInput.value)));
  $("dev-case-kebab").addEventListener("click", () => (caseOutput.value = toKebabCase(caseInput.value)));

  /* Hash ------------------------------------------------------------- */
  const hashInput = $("dev-hash-input") as HTMLInputElement;
  const hashOutput = $("dev-hash-output") as HTMLInputElement;
  $("dev-hash-btn").addEventListener("click", () => {
    void sha256Hex(hashInput.value).then((hash) => {
      hashOutput.value = hash;
    });
  });

  /* Timestamps -------------------------------------------------------- */
  const tsInput = $("dev-ts-input") as HTMLInputElement;
  const tsOutput = $("dev-ts-output") as HTMLInputElement;
  $("dev-ts-btn").addEventListener("click", () => {
    const date = timestampToDate(tsInput.value);
    tsOutput.value = date ? formatDate(date) : "Not a valid timestamp (seconds or milliseconds).";
  });

  /* Regex ------------------------------------------------------------- */
  const regexPattern = $("dev-regex-pattern") as HTMLInputElement;
  const regexFlags = $("dev-regex-flags") as HTMLInputElement;
  const regexText = $("dev-regex-text") as HTMLTextAreaElement;
  const regexOutput = $("dev-regex-output");
  $("dev-regex-btn").addEventListener("click", () => {
    const result = testRegex(regexPattern.value, regexFlags.value, regexText.value);
    if (!result.ok) {
      regexOutput.textContent = `Error: ${result.error}`;
      return;
    }
    const { matches, matchCount } = result.value;
    regexOutput.textContent =
      matchCount === 0
        ? "No matches."
        : `${matchCount} match${matchCount === 1 ? "" : "es"}: ${matches.slice(0, 20).map((m) => `“${m}”`).join(", ")}${matchCount > 20 ? "…" : ""}`;
  });

  /* Diff -------------------------------------------------------------- */
  const diffA = $("dev-diff-a") as HTMLTextAreaElement;
  const diffB = $("dev-diff-b") as HTMLTextAreaElement;
  const diffOutput = $("dev-diff-output");
  $("dev-diff-btn").addEventListener("click", () => {
    const lines = simpleDiff(diffA.value, diffB.value);
    diffOutput.innerHTML = "";
    for (const line of lines.slice(0, 400)) {
      const span = document.createElement("span");
      span.className = line.type;
      span.textContent = `${line.type === "add" ? "+" : line.type === "remove" ? "−" : " "} ${line.line}`;
      diffOutput.appendChild(span);
      diffOutput.appendChild(document.createElement("br"));
    }
    if (lines.length > 400) {
      const more = document.createElement("span");
      more.className = "same";
      more.textContent = `… ${lines.length - 400} more lines truncated`;
      diffOutput.appendChild(more);
    }
  });

  return () => {};
}
