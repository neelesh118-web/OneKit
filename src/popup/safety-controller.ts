import { cleanLink } from "../core/clean-links";
import {
  assessPageRisk,
  assessUrlRisk,
  combineScamCheck,
  type PageRiskMeta,
  type RiskLevel
} from "../core/scam-radar";
import { redactText } from "../core/pii-redact";
import type { OneKitCapabilities } from "./capabilities";

/**
 * Safety tab — Clean Link (strip tracking parameters), the cookie
 * auto-reject toggle hint, and the scam-site radar check. The actual
 * cookie rejection and page-meta computation run in the content script.
 */
export function createSafetyController(caps: OneKitCapabilities): () => void {
  const $ = (id: string): HTMLElement => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Missing element #${id}`);
    return el;
  };

  const input = $("cleanlink-input") as HTMLInputElement;
  const btn = $("cleanlink-btn") as HTMLButtonElement;
  const output = $("cleanlink-output") as HTMLInputElement;
  const status = $("cleanlink-status");
  const copyBtn = $("cleanlink-copy") as HTMLButtonElement;

  function runClean(): void {
    const raw = input.value;
    if (!raw.trim()) {
      output.value = "";
      status.textContent = "Paste a link with tracking parameters (utm_*, fbclid…) to clean it.";
      copyBtn.disabled = true;
      return;
    }
    const cleaned = cleanLink(raw);
    output.value = cleaned;
    if (cleaned === raw.trim()) {
      status.textContent = "No tracking parameters found — link unchanged.";
    } else {
      status.textContent = "Tracking parameters removed. Copy or open the clean link.";
    }
    copyBtn.disabled = false;
  }

  btn.addEventListener("click", runClean);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") runClean();
  });
  copyBtn.addEventListener("click", () => {
    void caps.copyText(output.value).then(() => {
      status.textContent = "Copied ✓";
      window.setTimeout(() => status.textContent = "", 1500);
    });
  });

  /* Scam radar ------------------------------------------------------- */
  const scamCheck = $("scam-check") as HTMLButtonElement;
  const scamResult = $("scam-result");
  const scamStatus = $("scam-status");

  const LEVEL_LABEL: Record<RiskLevel, string> = {
    ok: "Looks fine",
    caution: "Proceed with care",
    warning: "High risk — be very careful"
  };

  async function runScamCheck(): Promise<void> {
    scamResult.innerHTML = "";
    scamStatus.textContent = "Checking…";
    const tab = await caps.getActiveTab();
    const url = tab.url ?? "";
    let parsed: URL | null = null;
    try {
      parsed = new URL(url);
    } catch {
      // Not a page we can check.
    }
    if (!parsed || (parsed.protocol !== "http:" && parsed.protocol !== "https:")) {
      scamStatus.textContent = "Open a normal web page first, then run the check here.";
      return;
    }

    const urlRisk = assessUrlRisk(url);
    let pageRisk: { points: number; reasons: string[] } = { points: 0, reasons: [] };
    let pageNotes = "";
    if (tab.id !== undefined) {
      try {
        const meta = (await caps.sendMessage(tab.id, {
          type: "ok:page-risk-meta"
        })) as PageRiskMeta | undefined;
        if (meta) pageRisk = assessPageRisk(meta);
      } catch {
        pageNotes = " (could not read the page — URL check only)";
      }
    }

    const result = combineScamCheck(urlRisk, pageRisk);
    const score = result.score;
    const block = document.createElement("div");
    block.className = `scam-block scam-${result.level}`;
    const head = document.createElement("strong");
    head.textContent = `${LEVEL_LABEL[result.level]} — risk ${score}/10`;
    block.appendChild(head);
    for (const reason of result.reasons) {
      const li = document.createElement("div");
      li.className = "scam-reason";
      li.textContent = `• ${reason}`;
      block.appendChild(li);
    }
    if (result.reasons.length === 0) {
      const li = document.createElement("div");
      li.className = "scam-reason";
      li.textContent = "No red flags from the local checks. (This is a tripwire, not a guarantee.)";
      block.appendChild(li);
    }
    scamResult.appendChild(block);
    scamStatus.textContent = `Checked ${parsed.hostname}${pageNotes}. All checks ran on this device.`;
  }

  scamCheck.addEventListener("click", () => {
    void runScamCheck().catch(() => {
      scamStatus.textContent = "Could not check the page.";
    });
  });

  /* PII redactor ------------------------------------------------------ */
  const piiInput = $("pii-input") as HTMLTextAreaElement;
  const piiScan = $("pii-scan") as HTMLButtonElement;
  const piiFindings = $("pii-findings");
  const piiOutput = $("pii-output") as HTMLTextAreaElement;
  const piiCopy = $("pii-copy") as HTMLButtonElement;
  const piiStatus = $("pii-status");

  function runPiiScan(): void {
    const text = piiInput.value;
    if (!text.trim()) {
      piiStatus.textContent = "Paste some text first to scan it.";
      piiOutput.value = "";
      piiFindings.innerHTML = "";
      piiCopy.disabled = true;
      return;
    }
    const result = redactText(text);
    const total = result.findings.length;
    piiFindings.innerHTML = "";
    if (total === 0) {
      piiFindings.textContent = "No personal data or secrets found.";
      piiOutput.value = text;
      piiCopy.disabled = false;
      piiStatus.textContent = "Nothing to redact — the text is unchanged.";
      return;
    }
    for (const [kind, count] of Object.entries(result.counts)) {
      if (!count) continue;
      const row = document.createElement("div");
      row.className = "result-row";
      row.textContent = `${count}× ${kind}`;
      piiFindings.appendChild(row);
    }
    piiOutput.value = result.text;
    piiCopy.disabled = false;
    piiStatus.textContent = `${total} item${total === 1 ? "" : "s"} redacted. The redacted version is ready to copy — original values never leave your device.`;
  }

  piiScan.addEventListener("click", runPiiScan);
  piiCopy.addEventListener("click", () => {
    void caps.copyText(piiOutput.value).then(() => {
      piiStatus.textContent = "Redacted text copied ✓";
      window.setTimeout(() => (piiStatus.textContent = ""), 1500);
    });
  });

  return () => {};
}
