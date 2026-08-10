import { analyzePassword } from "../core/password-strength";
import { searchUrls, SEARCH_ENGINES } from "../core/multi-search";
import { applyListOp, type ListOp } from "../core/text-list";
import { checkContrast } from "../core/contrast";
import { barcodeSvg, barcodeDataUrl } from "../core/barcode";
import { inspectLink } from "../core/link-status";
import type { OneKitCapabilities } from "./capabilities";

/**
 * Utilities tab pieces — password strength analyzer, multi-search,
 * text → list tools, WCAG contrast checker, barcode generator, and the
 * link status inspector. All 100% local.
 */
export function createUtilitiesController(caps: OneKitCapabilities): () => void {
  const $ = (id: string): HTMLElement => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Missing element #${id}`);
    return el;
  };

  /* Password strength --------------------------------------------------- */
  const psInput = $("ps-input") as HTMLInputElement;
  const psResult = $("ps-result");
  const psIssues = $("ps-issues");

  function renderStrength(): void {
    const analysis = analyzePassword(psInput.value);
    psResult.textContent = `${analysis.label} — ${analysis.entropyBits} bits entropy · crack time: ${analysis.crackTime}`;
    psResult.className = `strength strength-${analysis.score}`;
    psIssues.innerHTML = "";
    for (const issue of analysis.issues) {
      const li = document.createElement("li");
      li.textContent = issue;
      psIssues.appendChild(li);
    }
  }
  psInput.addEventListener("input", renderStrength);
  renderStrength();

  /* Multi-search --------------------------------------------------------- */
  const msInput = $("ms-input") as HTMLInputElement;
  const msEngines = $("ms-engines");
  const msGo = $("ms-go") as HTMLButtonElement;
  const msStatus = $("ms-status");

  for (const engine of SEARCH_ENGINES) {
    const label = document.createElement("label");
    label.className = "toggle-row";
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = engine.id;
    checkbox.checked = ["google", "youtube", "wikipedia"].includes(engine.id);
    const span = document.createElement("span");
    span.textContent = engine.label;
    label.append(checkbox, span);
    msEngines.appendChild(label);
  }

  msGo.addEventListener("click", () => {
    const query = msInput.value.trim();
    if (!query) {
      msStatus.textContent = "Type a query first.";
      return;
    }
    const selected = [...msEngines.querySelectorAll<HTMLInputElement>("input:checked")].map((c) => c.value);
    const urls = searchUrls(selected, query);
    if (urls.length === 0) {
      msStatus.textContent = "Pick at least one search engine.";
      return;
    }
    for (const url of urls) void caps.openUrl(url);
    msStatus.textContent = `Opened ${urls.length} search${urls.length === 1 ? "" : "es"} in new tabs.`;
  });
  msInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") msGo.click();
  });

  /* Text → list ----------------------------------------------------------- */
  const tlInput = $("tl-input") as HTMLTextAreaElement;
  const tlOp = $("tl-op") as HTMLSelectElement;
  const tlRun = $("tl-run") as HTMLButtonElement;
  const tlOutput = $("tl-output") as HTMLTextAreaElement;
  const tlCopy = $("tl-copy") as HTMLButtonElement;
  const tlStatus = $("tl-status");

  for (const [value, label] of [
    ["splitLines", "Split into lines"],
    ["splitComma", "Split on commas/semicolons"],
    ["dedupe", "Remove duplicates"],
    ["sort", "Sort A→Z"],
    ["reverse", "Reverse order"],
    ["csv", "Convert to CSV"]
  ] as const) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    tlOp.appendChild(option);
  }

  tlRun.addEventListener("click", () => {
    const out = applyListOp(tlInput.value, tlOp.value as ListOp);
    tlOutput.value = out;
    tlCopy.disabled = out.length === 0;
    const lines = out ? out.split("\n").length : 0;
    tlStatus.textContent = out ? `${lines} line${lines === 1 ? "" : "s"} — ready to copy.` : "Nothing to process.";
  });
  tlCopy.addEventListener("click", () => {
    void caps.copyText(tlOutput.value).then(() => {
      tlStatus.textContent = "Copied ✓";
    });
  });

  /* Contrast checker ------------------------------------------------------ */
  const ctFg = $("ct-fg") as HTMLInputElement;
  const ctBg = $("ct-bg") as HTMLInputElement;
  const ctBtn = $("ct-check") as HTMLButtonElement;
  const ctResult = $("ct-result");

  ctBtn.addEventListener("click", () => {
    const result = checkContrast(ctFg.value, ctBg.value);
    if ("error" in result) {
      ctResult.textContent = result.error;
      return;
    }
    const lines = [
      `Contrast ratio: ${result.ratio}:1`,
      `Normal text: ${result.normalText.aa ? "✅ AA" : "❌ AA"} · ${result.normalText.aaa ? "✅ AAA" : "❌ AAA"}`,
      `Large text:  ${result.largeText.aa ? "✅ AA" : "❌ AA"} · ${result.largeText.aaa ? "✅ AAA" : "❌ AAA"}`
    ];
    ctResult.textContent = lines.join("\n");
  });

  /* Barcode generator ------------------------------------------------------ */
  const bcInput = $("bc-input") as HTMLInputElement;
  const bcMake = $("bc-make") as HTMLButtonElement;
  const bcOut = $("bc-output");
  const bcDownload = $("bc-download") as HTMLButtonElement;
  const bcStatus = $("bc-status");
  let currentBarcode = "";

  function renderBarcode(): void {
    const text = bcInput.value.trim();
    bcOut.innerHTML = "";
    if (!text) {
      bcStatus.textContent = "Type text to encode (Code 128 — printable ASCII).";
      return;
    }
    try {
      const { svg } = barcodeSvg(text);
      bcOut.innerHTML = svg;
      currentBarcode = text;
      bcDownload.disabled = false;
      bcStatus.textContent = `${text.length} character${text.length === 1 ? "" : "s"} encoded as Code 128.`;
    } catch (err) {
      bcStatus.textContent = err instanceof Error ? err.message : "Could not encode that text.";
      bcDownload.disabled = true;
    }
  }
  bcMake.addEventListener("click", renderBarcode);
  bcInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") renderBarcode();
  });
  bcDownload.addEventListener("click", () => {
    if (!currentBarcode) return;
    const dataUrl = barcodeDataUrl(currentBarcode);
    caps.downloadDataUrl(dataUrl, `onekit-barcode-${currentBarcode.replace(/[^a-z0-9]+/gi, "-").slice(0, 24)}.svg`);
  });

  /* Link status inspector -------------------------------------------------- */
  const lsInput = $("ls-input") as HTMLInputElement;
  const lsCheck = $("ls-check") as HTMLButtonElement;
  const lsResult = $("ls-result");

  lsCheck.addEventListener("click", () => {
    const status = inspectLink(lsInput.value);
    lsResult.innerHTML = "";
    const headline = document.createElement("strong");
    headline.textContent = status.ok ? "✅ Looks fine structurally." : "⚠️ Issues found:";
    lsResult.appendChild(headline);
    if (status.problems.length === 0) return;
    const list = document.createElement("ul");
    for (const problem of status.problems) {
      const li = document.createElement("li");
      li.textContent = problem;
      list.appendChild(li);
    }
    lsResult.appendChild(list);
  });
  lsInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") lsCheck.click();
  });

  return () => {};
}
