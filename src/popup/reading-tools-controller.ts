import { summarizeText, summaryStats } from "../core/summarizer";
import { allSizeRows, convertSize, type SizeCategory } from "../core/size-charts";
import {
  readBreakSettings,
  writeBreakSettings,
  type BreakReminderSettings
} from "../core/break-reminders";
import { tocToMarkdown } from "../core/page-toc";
import { lockText, unlockText } from "../core/text-locker";
import { buildVaultHealthReport, healthSummary } from "../core/vault-health";
import { hasMasterPassword, readVaultEntries, unlockVault } from "../core/passwords";
import { calculate, CalculatorError, formatResult } from "../core/calculator";
import { decodeQrFromImage, loadImageFromFile, summarizeScan, type QrDecode } from "../core/qr-scanner";
import { readImageInfo } from "../core/exif";
import { extractContacts, contactsToText, contactsToCsv } from "../core/contact-extractor";
import { mergeSavedPools, pickRandomItem } from "../core/random-revisit";
import { listReadLater } from "../core/read-later-store";
import { listHighlights } from "../core/highlights-store";
import type { KvStorage } from "../core/storage-utils";
import type { OneKitCapabilities } from "./capabilities";

/**
 * Reading & utilities round — speed reader, local TL;DR, size chart
 * switcher, break & stretch reminders, page TOC, encrypted text locker,
 * vault health, calculator, QR scanner, EXIF viewer, contact extractor,
 * random revisit. All 100% local.
 */
export function createReadingToolsController(caps: OneKitCapabilities): () => void {
  const $ = (id: string): HTMLElement => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Missing element #${id}`);
    return el;
  };
  const storage: KvStorage = caps.storage;

  /* Speed reader ---------------------------------------------------------- */
  const srStart = $("sr-start") as HTMLButtonElement;
  const srStop = $("sr-stop") as HTMLButtonElement;
  const srWpm = $("sr-wpm") as HTMLInputElement;
  const srStatus = $("sr-status");

  srStart.addEventListener("click", () => {
    void (async () => {
      const tab = await caps.getActiveTab();
      if (!tab.id) {
        srStatus.textContent = "Open a web page first.";
        return;
      }
      await caps.sendMessage(tab.id, { type: "ok:speed-reader-start", wpm: Number(srWpm.value) }).catch(() => {});
      srStatus.textContent = "Reading started — the overlay is on the page. Adjust WPM there or stop here.";
    })();
  });
  srStop.addEventListener("click", () => {
    void (async () => {
      const tab = await caps.getActiveTab();
      if (tab.id) await caps.sendMessage(tab.id, { type: "ok:speed-reader-stop" }).catch(() => {});
      srStatus.textContent = "Speed reader stopped.";
    })();
  });

  /* Local TL;DR ------------------------------------------------------------ */
  const sumRun = $("sum-run") as HTMLButtonElement;
  const sumOutput = $("sum-output");
  const sumStats = $("sum-stats");

  sumRun.addEventListener("click", () => {
    void (async () => {
      const tab = await caps.getActiveTab();
      if (!tab.id) {
        sumStats.textContent = "Open a web page first.";
        return;
      }
      sumStats.textContent = "Summarizing…";
      try {
        const res = (await caps.sendMessage(tab.id, {
          type: "ok:summarize-page"
        })) as { ok: boolean; summary?: string; stats?: { words: number; coverage: number }; reason?: string };
        if (!res?.ok || !res.summary) {
          sumStats.textContent = res?.reason ?? "Could not summarize this page.";
          return;
        }
        sumOutput.innerHTML = "";
        const block = document.createElement("div");
        block.className = "result-row";
        block.textContent = res.summary;
        sumOutput.appendChild(block);
        sumStats.textContent = `Heuristic summary — ${res.stats?.words ?? 0} words covering ${Math.round(
          (res.stats?.coverage ?? 0) * 100
        )}% of the page.`;
      } catch {
        sumStats.textContent = "Could not reach this page.";
      }
    })();
  });

  /* Size chart switcher ------------------------------------------------------ */
  const scCat = $("sc-cat") as HTMLSelectElement;
  const scFromSys = $("sc-from-sys") as HTMLSelectElement;
  const scValue = $("sc-value") as HTMLInputElement;
  const scToSys = $("sc-to-sys") as HTMLSelectElement;
  const scSizes = $("sc-sizes") as HTMLDataListElement;
  const scStatus = $("sc-status");

  // Populate the datalist with every size label in the current category.
  function refreshSizeOptions(): void {
    scSizes.innerHTML = "";
    const rows = allSizeRows().find((r) => r.category === scCat.value)?.rows ?? [];
    const seen = new Set<string>();
    for (const row of rows) {
      for (const value of [row.us, row.uk, row.eu, row.intl]) {
        if (value && !seen.has(value)) {
          seen.add(value);
          const opt = document.createElement("option");
          opt.value = value;
          scSizes.appendChild(opt);
        }
      }
    }
  }
  scCat.addEventListener("change", refreshSizeOptions);
  refreshSizeOptions();

  function convertSizeNow(): void {
    const category = scCat.value as SizeCategory;
    const from = scFromSys.value as "us" | "uk" | "eu" | "intl";
    const to = scToSys.value as "us" | "uk" | "eu" | "intl";
    const value = scValue.value.trim();
    if (!value) {
      scStatus.textContent = "Type or pick a size first.";
      return;
    }
    if (from === to) {
      scStatus.textContent = `${value} (${to.toUpperCase()}) — same system.`;
      return;
    }
    const row = convertSize(category, from, value);
    if (!row) {
      scStatus.textContent = `No ${from.toUpperCase()} size “${value}” in the ${scCat.options[scCat.selectedIndex]?.text ?? "chart"}. Try another.`;
      return;
    }
    const converted = row[to];
    scStatus.textContent = converted
      ? `${value} ${from.toUpperCase()} → ${converted} ${to.toUpperCase()} (${row.label})`
      : `No ${to.toUpperCase()} equivalent for ${row.label} in this chart.`;
  }
  scValue.addEventListener("change", () => convertSizeNow());
  scFromSys.addEventListener("change", () => convertSizeNow());
  scToSys.addEventListener("change", () => convertSizeNow());

  /* Break & stretch reminders ------------------------------------------------- */
  const brInterval = $("br-interval") as HTMLInputElement;
  const brStart = $("br-start") as HTMLButtonElement;
  const brStop = $("br-stop") as HTMLButtonElement;
  const brStatus = $("br-status");

  async function renderBreakStatus(): Promise<void> {
    const s = await readBreakSettings(storage);
    brStatus.textContent = s.enabled
      ? `Reminders every ${s.intervalMinutes} minutes — active. Stretch suggestions come with each one.`
      : "Off. Pick an interval (minutes), then Start — OneKit notifies you to stand up and stretch.";
    brStop.disabled = !s.enabled;
    brStart.disabled = s.enabled;
  }
  void renderBreakStatus();

  brStart.addEventListener("click", () => {
    void (async () => {
      const settings: BreakReminderSettings = {
        intervalMinutes: Number(brInterval.value) || 45,
        enabled: true,
        snoozedUntil: 0
      };
      await writeBreakSettings(storage, settings);
      await renderBreakStatus();
    })();
  });
  brStop.addEventListener("click", () => {
    void (async () => {
      const settings = await readBreakSettings(storage);
      await writeBreakSettings(storage, { ...settings, enabled: false, snoozedUntil: 0 });
      await renderBreakStatus();
    })();
  });

  /* Page TOC ------------------------------------------------------------------ */
  const ptcToggle = $("ptc-toggle") as HTMLButtonElement;
  const ptcMd = $("ptc-md") as HTMLButtonElement;
  const ptcStatus = $("ptc-status");

  ptcToggle.addEventListener("click", () => {
    void (async () => {
      const tab = await caps.getActiveTab();
      if (!tab.id) {
        ptcStatus.textContent = "Open a web page first.";
        return;
      }
      const res = (await caps
        .sendMessage(tab.id, { type: "ok:toc-toggle" })
        .catch(() => null)) as { entries?: number; open?: boolean } | null;
      ptcStatus.textContent =
        res?.entries && res.entries > 0 ? `Outline ${res.open ? "shown" : "hidden"} — ${res.entries} headings.` : "No headings found on this page.";
    })();
  });
  ptcMd.addEventListener("click", () => {
    void (async () => {
      const tab = await caps.getActiveTab();
      if (!tab.id) {
        ptcStatus.textContent = "Open a web page first.";
        return;
      }
      try {
        const res = (await caps.sendMessage(tab.id, { type: "ok:page-toc-md" })) as {
          markdown?: string;
          entries?: number;
        } | null;
        if (!res?.markdown || (res.entries ?? 0) === 0) {
          ptcStatus.textContent = "No headings found on this page.";
          return;
        }
        await caps.copyText(res.markdown);
        ptcStatus.textContent = `Copied ${res.entries} headings as Markdown ✓`;
      } catch {
        ptcStatus.textContent = "Could not read this page.";
      }
    })();
  });

  /* Encrypted text locker ------------------------------------------------------ */
  const tlMode = $("tl-mode") as HTMLSelectElement;
  const tlPass = $("tl-pass") as HTMLInputElement;
  const tlInput = $("tl-input") as HTMLTextAreaElement;
  const tlOutput = $("tl-output") as HTMLTextAreaElement;
  const tlRun = $("tl-run") as HTMLButtonElement;
  const tlStatus = $("tl-status");

  tlRun.addEventListener("click", () => {
    void (async () => {
      const pass = tlPass.value;
      const text = tlInput.value;
      tlStatus.textContent = "";
      try {
        if (tlMode.value === "lock") {
          const blob = await lockText(text, pass);
          tlOutput.value = blob;
          tlStatus.textContent = "Encrypted ✓ — copy the blob; it decrypts anywhere with the passphrase.";
        } else {
          const out = await unlockText(text.trim() || tlOutput.value, pass);
          tlOutput.value = out;
          tlStatus.textContent = "Decrypted ✓ — this text exists only in your clipboard and this box.";
        }
      } catch (err) {
        tlStatus.textContent = err instanceof Error ? err.message : "That failed.";
      }
    })();
  });

  /* Vault health ---------------------------------------------------------------- */
  const vhPass = $("vh-pass") as HTMLInputElement;
  const vhRefresh = $("vh-refresh") as HTMLButtonElement;
  const vhScore = $("vh-score");
  const vhList = $("vh-list");
  const vhStatus = $("vh-status");

  vhRefresh.addEventListener("click", () => {
    void (async () => {
      vhStatus.textContent = "Scanning…";
      try {
        let key: CryptoKey | null = null;
        if (await hasMasterPassword(storage)) {
          const pass = vhPass.value;
          if (!pass) {
            vhStatus.textContent = "Your vault is encrypted — enter the master passphrase to scan it.";
            return;
          }
          key = await unlockVault(pass, storage);
        }
        const entries = await readVaultEntries(storage, key);
        if (entries.length === 0) {
          vhScore.textContent = "No passwords in the vault yet — add some to get a health report.";
          vhList.innerHTML = "";
          vhStatus.textContent = "";
          return;
        }
        const report = buildVaultHealthReport(entries);
        vhScore.textContent = healthSummary(report);
        vhList.innerHTML = "";
        const sections: Array<[string, string[]]> = [];
        if (report.weak.length > 0) {
          sections.push(["Weak passwords", report.weak.map((w) => `${w.site} — ${w.label}`)]);
        }
        if (report.reused.length > 0) {
          sections.push([
            `Reused passwords (${report.reused.length} group${report.reused.length === 1 ? "" : "s"})`,
            report.reused.map((r) => `${r.password} — used on ${r.sites.length} sites`)
          ]);
        }
        if (report.common.length > 0) {
          sections.push(["Common passwords", report.common.map((c) => `${c.site} — “${c.password}”`)]);
        }
        for (const [titleText, rows] of sections) {
          const title = document.createElement("div");
          title.className = "result-title";
          title.textContent = titleText;
          vhList.appendChild(title);
          for (const text of rows) {
            const row = document.createElement("div");
            row.className = "result-row";
            row.textContent = text;
            vhList.appendChild(row);
          }
        }
        vhStatus.textContent = `Scan complete — ${report.strong} of ${report.total} strong.`;
      } catch (err) {
        vhStatus.textContent = err instanceof Error ? err.message : "Could not scan the vault.";
      }
    })();
  });

  /* Calculator ------------------------------------------------------------------ */
  const calcInput = $("calc-input") as HTMLInputElement;
  const calcEval = $("calc-eval") as HTMLButtonElement;
  const calcResult = $("calc-result");
  const calcStatus = $("calc-status");

  function evaluate(): void {
    const raw = calcInput.value.trim();
    if (!raw) {
      calcStatus.textContent = "Type an expression first.";
      return;
    }
    try {
      calcResult.textContent = `= ${formatResult(calculate(raw))}`;
      calcStatus.textContent = "";
    } catch (err) {
      calcResult.textContent = "";
      calcStatus.textContent = err instanceof CalculatorError ? err.message : "That expression didn't parse.";
    }
  }
  calcEval.addEventListener("click", evaluate);
  calcInput.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") evaluate();
  });

  /* QR scanner -------------------------------------------------------------------- */
  const qrFile = $("qr-file") as HTMLInputElement;
  const qrTab = $("qr-tab") as HTMLButtonElement;
  const qrResult = $("qr-result");
  const qrStatus = $("qr-status");

  function renderQr(decode: QrDecode): void {
    qrResult.innerHTML = "";
    if (!decode.ok) {
      qrStatus.textContent = decode.error === "no-qr" ? "No QR code found in that image." : "Could not read that image.";
      return;
    }
    const row = document.createElement("div");
    row.className = "result-row";
    const strong = document.createElement("strong");
    strong.className = "result-title";
    strong.textContent = summarizeScan(decode.result);
    const copyBtn = document.createElement("button");
    copyBtn.type = "button";
    copyBtn.className = "mini-btn";
    copyBtn.textContent = "Copy";
    copyBtn.addEventListener("click", () => {
      void caps.copyText(decode.result.text);
      qrStatus.textContent = "Copied ✓";
    });
    row.append(strong, copyBtn);
    qrResult.appendChild(row);
    qrStatus.textContent = "Decoded on-device.";
  }

  qrFile.addEventListener("change", () => {
    void (async () => {
      const file = qrFile.files?.[0];
      if (!file) return;
      try {
        const img = await loadImageFromFile(file);
        renderQr(decodeQrFromImage(img));
      } catch {
        qrStatus.textContent = "Could not read that image file.";
      }
    })();
  });
  qrTab.addEventListener("click", () => {
    void (async () => {
      qrStatus.textContent = "Capturing the visible tab…";
      try {
        const dataUrl = await caps.captureVisibleTab();
        const img = new Image();
        img.onload = () => renderQr(decodeQrFromImage(img));
        img.onerror = () => {
          qrStatus.textContent = "Could not capture the tab.";
        };
        img.src = dataUrl;
      } catch {
        qrStatus.textContent = "Could not capture the tab (permission or tab error).";
      }
    })();
  });

  /* EXIF viewer ---------------------------------------------------------------------- */
  const exifFile = $("exif-file") as HTMLInputElement;
  const exifResult = $("exif-result");
  const exifStatus = $("exif-status");

  exifFile.addEventListener("change", () => {
    void (async () => {
      const file = exifFile.files?.[0];
      if (!file) return;
      try {
        const buffer = await file.arrayBuffer();
        const info = readImageInfo(new Uint8Array(buffer));
        exifResult.innerHTML = "";
        const head = document.createElement("div");
        head.className = "result-title";
        head.textContent = `${info.format} · ${info.width}×${info.height}`;
        exifResult.appendChild(head);
        const exifEntries = Object.entries(info.exif);
        if (exifEntries.length === 0) {
          const row = document.createElement("div");
          row.className = "result-row";
          row.textContent = "No EXIF tags in this file — most web downloads are stripped. Dimensions still work.";
          exifResult.appendChild(row);
        } else {
          for (const [tag, value] of exifEntries) {
            const row = document.createElement("div");
            row.className = "result-row";
            row.textContent = `${tag}: ${value}`;
            exifResult.appendChild(row);
          }
        }
        exifStatus.textContent = "Read locally.";
      } catch {
        exifStatus.textContent = "Could not read that file.";
      }
    })();
  });

  /* Contact extractor ---------------------------------------------------------------- */
  const ceCopy = $("ce-copy") as HTMLButtonElement;
  const ceCsv = $("ce-csv") as HTMLButtonElement;
  const ceList = $("ce-list");
  const ceStatus = $("ce-status");

  async function contactsFromActiveTab(): Promise<ReturnType<typeof extractContacts> | null> {
    const tab = await caps.getActiveTab();
    if (!tab.id) return null;
    try {
      const res = (await caps.sendMessage(tab.id, { type: "ok:page-text" })) as { text?: string } | undefined;
      return extractContacts(res?.text ?? "");
    } catch {
      return null;
    }
  }

  function renderContacts(contacts: ReturnType<typeof extractContacts>): void {
    ceList.innerHTML = "";
    const total = contacts.emails.length + contacts.phones.length;
    if (total === 0) {
      ceStatus.textContent = "No emails or phones found on this page.";
      return;
    }
    for (const email of contacts.emails) {
      const row = document.createElement("div");
      row.className = "result-row";
      row.textContent = email;
      ceList.appendChild(row);
    }
    for (const phone of contacts.phones) {
      const row = document.createElement("div");
      row.className = "result-row";
      row.textContent = phone;
      ceList.appendChild(row);
    }
    ceStatus.textContent = `${total} contact${total === 1 ? "" : "s"} found — copy as list or CSV.`;
  }

  ceCopy.addEventListener("click", () => {
    void (async () => {
      const contacts = await contactsFromActiveTab();
      if (!contacts) {
        ceStatus.textContent = "Open a web page first.";
        return;
      }
      renderContacts(contacts);
      if (contacts.emails.length + contacts.phones.length > 0) {
        await caps.copyText(contactsToText(contacts));
        ceStatus.textContent = `Copied ${contacts.emails.length + contacts.phones.length} contacts as text ✓`;
      }
    })();
  });
  ceCsv.addEventListener("click", () => {
    void (async () => {
      const contacts = await contactsFromActiveTab();
      if (!contacts) {
        ceStatus.textContent = "Open a web page first.";
        return;
      }
      renderContacts(contacts);
      if (contacts.emails.length + contacts.phones.length > 0) {
        await caps.copyText(contactsToCsv(contacts));
        ceStatus.textContent = `Copied ${contacts.emails.length + contacts.phones.length} contacts as CSV ✓`;
      }
    })();
  });

  /* Random revisit -------------------------------------------------------------------- */
  const rvPick = $("rv-pick") as HTMLButtonElement;
  const rvResult = $("rv-result");
  const rvStatus = $("rv-status");

  rvPick.addEventListener("click", () => {
    void (async () => {
      const [readLater, highlights] = await Promise.all([
        listReadLater(storage),
        listHighlights(storage)
      ]);
      const pool = mergeSavedPools(readLater, highlights);
      const pick = pickRandomItem(pool);
      rvResult.innerHTML = "";
      if (!pick) {
        rvStatus.textContent = "Nothing saved yet — save a page (Read later) or a highlight first.";
        return;
      }
      const row = document.createElement("div");
      row.className = "result-row";
      const link = document.createElement("a");
      link.href = pick.url;
      link.target = "_blank";
      link.rel = "noreferrer";
      link.textContent = pick.title || pick.url;
      link.style.color = "inherit";
      const meta = document.createElement("span");
      meta.className = "result-meta";
      meta.textContent = pick.read ? "already read" : "unread";
      row.append(link, meta);
      rvResult.appendChild(row);
      rvStatus.textContent = "Open it, or roll again.";
    })();
  });

  return () => {
    // The popup lives as long as the popup page — nothing to tear down.
  };
}
