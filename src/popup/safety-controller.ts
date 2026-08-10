import { cleanLink } from "../core/clean-links";
import {
  assessPageRisk,
  assessUrlRisk,
  combineScamCheck,
  type PageRiskMeta,
  type RiskLevel
} from "../core/scam-radar";
import { redactText } from "../core/pii-redact";
import {
  buildCookieEdit,
  classifyCookies,
  cookieSize,
  isSameSiteCookie
} from "../core/cookie-manager";
import {
  addTotpAccount,
  clearTotpPassphrase,
  codesForAccounts,
  hasTotpPassphrase,
  listTotpAccounts,
  parseOtpauthUri,
  removeTotpAccount,
  setTotpPassphrase,
  totpLockState,
  unlockTotp,
  type TotpAccount
} from "../core/totp";
import {
  backupEntryToAccountInput,
  clearStoredTotpAccounts,
  exportTotpBackup,
  importTotpBackup,
  parseTotpBackupFile,
  serializeTotpBackup,
  totpBackupFilename
} from "../core/totp-backup";
import {
  buildSweepPlan,
  filterSweepHosts,
  hasSweepWork,
  type SweepHost
} from "../core/privacy-sweep";
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

  /* Cookie manager ------------------------------------------------------ */
  const cookieRefresh = $("cookie-refresh") as HTMLButtonElement;
  const cookieForget = $("cookie-forget") as HTMLButtonElement;
  const cookieName = $("cookie-name") as HTMLInputElement;
  const cookieValue = $("cookie-value") as HTMLInputElement;
  const cookieDomain = $("cookie-domain") as HTMLInputElement;
  const cookiePath = $("cookie-path") as HTMLInputElement;
  const cookieAdd = $("cookie-add") as HTMLButtonElement;
  const cookieList = $("cookie-list");
  const cookieStatus = $("cookie-status");

  async function currentOrigin(): Promise<string | null> {
    const tab = await caps.getActiveTab();
    if (!tab.url) return null;
    try {
      return new URL(tab.url).origin;
    } catch {
      return null;
    }
  }

  async function renderCookies(): Promise<void> {
    const origin = await currentOrigin();
    if (!origin) {
      cookieStatus.textContent = "Open a normal page first — cookies belong to a site.";
      cookieList.innerHTML = "";
      return;
    }
    const hostname = new URL(origin).hostname;
    const cookies = await caps.getCookies(origin);
    const stats = classifyCookies(cookies);
    cookieList.innerHTML = "";
    if (cookies.length === 0) {
      cookieStatus.textContent = `No cookies for ${hostname}. Add one below.`;
      return;
    }
    cookieStatus.textContent =
      `${stats.total} cookie${stats.total === 1 ? "" : "s"} for ${hostname} — ${stats.session} session, ${stats.secure} secure, ${stats.httpOnly} httpOnly · ${(cookies.reduce((n, c) => n + cookieSize(c), 0) / 1024).toFixed(1)} KB.`;
    for (const cookie of cookies.slice(0, 40)) {
      const row = document.createElement("div");
      row.className = "result-row";
      const title = document.createElement("strong");
      title.className = "result-title";
      title.textContent = cookie.name;
      title.title = cookie.domain + cookie.path;
      const meta = document.createElement("span");
      meta.className = "result-meta";
      meta.textContent = `${cookie.domain} · ${cookie.value.slice(0, 40)}${cookie.value.length > 40 ? "…" : ""}${cookie.secure ? " · secure" : ""}${cookie.httpOnly ? " · httpOnly" : ""}${isSameSiteCookie(cookie, hostname) ? "" : " · third-party"}`;
      const edit = document.createElement("button");
      edit.type = "button";
      edit.className = "mini-btn";
      edit.textContent = "Edit value";
      edit.addEventListener("click", () => {
        cookieName.value = cookie.name;
        cookieValue.value = cookie.value;
        cookieDomain.value = cookie.domain;
        cookiePath.value = cookie.path;
        cookieStatus.textContent = "Editing — set the new value, then Add / update.";
      });
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "mini-btn danger";
      remove.textContent = "Delete";
      remove.addEventListener("click", () => {
        void (async () => {
          await caps.removeCookie(origin, cookie.name);
          await renderCookies();
        })();
      });
      row.append(title, meta, edit, remove);
      cookieList.appendChild(row);
    }
  }

  cookieRefresh.addEventListener("click", () => void renderCookies());

  cookieAdd.addEventListener("click", () => {
    void (async () => {
      const origin = await currentOrigin();
      if (!origin) {
        cookieStatus.textContent = "Open a normal page first.";
        return;
      }
      const edit = buildCookieEdit({
        name: cookieName.value,
        value: cookieValue.value,
        domain: cookieDomain.value,
        path: cookiePath.value
      });
      if (!edit.ok) {
        cookieStatus.textContent = edit.error ?? "Could not build the cookie.";
        return;
      }
      const saved = await caps.setCookie({ url: origin, ...edit.value! });
      cookieStatus.textContent = saved
        ? `Cookie “${saved.name}” saved.`
        : "Could not save that cookie — check the domain.";
      cookieName.value = "";
      cookieValue.value = "";
      await renderCookies();
    })();
  });

  cookieForget.addEventListener("click", () => {
    void (async () => {
      const origin = await currentOrigin();
      if (!origin) {
        cookieStatus.textContent = "Open a normal page first.";
        return;
      }
      const hostname = new URL(origin).hostname;
      if (!window.confirm(`Forget ${hostname}? This clears its cookies, storage and cache — you'll be signed out of that site.`)) {
        return;
      }
      await caps.clearSiteData(origin);
      cookieStatus.textContent = `Forgot ${hostname} — its local data is cleared.`;
      cookieList.innerHTML = "";
    })();
  });

  /* TOTP authenticator --------------------------------------------------- */
  const totpPassphraseInput = $("totp-passphrase-input") as HTMLInputElement;
  const totpPassphraseSet = $("totp-passphrase-set") as HTMLButtonElement;
  const totpPassphraseClear = $("totp-passphrase-clear") as HTMLButtonElement;
  const totpUnlockWrap = $("totp-unlock-wrap");
  const totpUnlockInput = $("totp-unlock-input") as HTMLInputElement;
  const totpUnlockBtn = $("totp-unlock-btn") as HTMLButtonElement;
  const totpAddLabel = $("totp-add-label") as HTMLInputElement;
  const totpAddSecret = $("totp-add-secret") as HTMLInputElement;
  const totpAddBtn = $("totp-add-btn") as HTMLButtonElement;
  const totpList = $("totp-list");
  const totpStatus = $("totp-status");
  let totpKey: CryptoKey | null = null;
  let totpAccounts: TotpAccount[] = [];
  let totpTimer: number | undefined;

  async function refreshTotpUnlockUi(): Promise<void> {
    const hasPassphrase = await hasTotpPassphrase(caps.storage);
    const state = totpLockState(hasPassphrase, totpKey !== null);
    totpUnlockWrap.hidden = state !== "locked";
    totpPassphraseInput.hidden = state === "locked";
    totpPassphraseSet.hidden = state === "locked";
    totpPassphraseClear.hidden = !hasPassphrase;
    if (state === "locked") {
      totpStatus.textContent =
        "Accounts are encrypted with a passphrase. Enter it to see your codes — the key stays in memory for this session only.";
    }
  }

  async function renderTotpCodes(): Promise<void> {
    const rows = totpList.querySelectorAll<HTMLElement>("[data-totp-row]");
    const codes = await codesForAccounts(totpAccounts, Math.floor(Date.now() / 1000));
    for (const row of rows) {
      const id = row.dataset.totpRow!;
      const code = codes[id];
      if (!code) continue;
      row.querySelector<HTMLElement>("[data-totp-code]")!.textContent = code.code;
      row.querySelector<HTMLElement>("[data-totp-remaining]")!.textContent =
        code.code === "invalid" ? "invalid secret" : `${code.remaining}s`;
    }
  }

  async function renderTotpList(): Promise<void> {
    totpList.innerHTML = "";
    // While locked, show the prompt — never render encrypted blobs as rows
    // or overwrite the locked status with a codes message.
    if (totpLockState(await hasTotpPassphrase(caps.storage), totpKey !== null) === "locked") {
      totpList.textContent = "Locked — enter your passphrase above to see your accounts.";
      return;
    }
    try {
      totpAccounts = await listTotpAccounts(caps.storage, totpKey ?? undefined);
    } catch {
      totpAccounts = [];
      totpKey = null;
      await refreshTotpUnlockUi();
      return;
    }
    if (totpAccounts.length === 0) {
      totpList.textContent = "No accounts yet. Add one with its otpauth:// link or secret below — codes are generated on this device.";
      return;
    }
    const plaintext = totpAccounts.some((a) => !a.encrypted);
    for (const account of totpAccounts) {
      const row = document.createElement("div");
      row.className = "result-row totp-row";
      row.dataset.totpRow = account.id;
      const head = document.createElement("div");
      const title = document.createElement("strong");
      title.className = "result-title";
      title.textContent = account.issuer ? `${account.issuer} — ${account.label}` : account.label;
      const meta = document.createElement("span");
      meta.className = "result-meta";
      meta.textContent = `${account.digits} digits · every ${account.period}s${account.encrypted ? " · encrypted" : ""}`;
      head.append(title, meta);
      const code = document.createElement("code");
      code.className = "totp-code";
      code.dataset.totpCode = "";
      const remaining = document.createElement("span");
      remaining.className = "totp-remaining";
      remaining.dataset.totpRemaining = "";
      const copy = document.createElement("button");
      copy.type = "button";
      copy.className = "mini-btn";
      copy.textContent = "Copy";
      copy.addEventListener("click", () => {
        void caps.copyText(code.textContent ?? "").then(() => {
          totpStatus.textContent = `Copied ${account.label} code ✓`;
        });
      });
      const del = document.createElement("button");
      del.type = "button";
      del.className = "mini-btn danger";
      del.textContent = "Delete";
      del.addEventListener("click", () => {
        void removeTotpAccount(account.id, caps.storage).then(() => void renderTotpList());
      });
      row.append(head, code, remaining, copy, del);
      totpList.appendChild(row);
    }
    totpStatus.textContent = plaintext
      ? "Heads-up: no passphrase is set, so secrets are stored in plaintext on this device. Set one to encrypt them."
      : "Codes refresh every 30 seconds. Everything is generated locally.";
    await renderTotpCodes();
  }

  totpPassphraseSet.addEventListener("click", () => {
    void (async () => {
      const passphrase = totpPassphraseInput.value;
      try {
        await setTotpPassphrase(passphrase, caps.storage);
        totpKey = await unlockTotp(passphrase, caps.storage);
        totpPassphraseInput.value = "";
        totpStatus.textContent = "Passphrase set — existing and new secrets are now encrypted.";
        await refreshTotpUnlockUi();
        await renderTotpList();
      } catch (err) {
        totpStatus.textContent = err instanceof Error ? err.message : "Could not set passphrase.";
      }
    })();
  });

  totpPassphraseClear.addEventListener("click", () => {
    void (async () => {
      if (!window.confirm("Remove the passphrase? Secrets will be stored in plaintext again on this device.")) return;
      await clearTotpPassphrase(caps.storage);
      totpKey = null;
      totpStatus.textContent = "Passphrase removed — secrets are plaintext again. Set one to re-encrypt.";
      await refreshTotpUnlockUi();
      await renderTotpList();
    })();
  });

  totpUnlockBtn.addEventListener("click", () => {
    void (async () => {
      try {
        totpKey = await unlockTotp(totpUnlockInput.value, caps.storage);
        totpUnlockInput.value = "";
        await refreshTotpUnlockUi();
        await renderTotpList();
      } catch (err) {
        totpStatus.textContent = err instanceof Error ? err.message : "Wrong passphrase.";
      }
    })();
  });

  /* Backup / restore / delete-all ------------------------------------------ */
  const totpExport = $("totp-export") as HTMLButtonElement;
  const totpImport = $("totp-import") as HTMLButtonElement;
  const totpImportFile = $("totp-import-file") as HTMLInputElement;
  const totpDeleteAll = $("totp-delete-all") as HTMLButtonElement;

  function readTextFile(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") resolve(reader.result);
        else reject(new Error("Could not read that file."));
      };
      reader.onerror = () => reject(new Error("Could not read that file."));
      reader.readAsText(file);
    });
  }

  totpExport.addEventListener("click", () => {
    void (async () => {
      if (totpLockState(await hasTotpPassphrase(caps.storage), totpKey !== null) === "locked") {
        totpStatus.textContent = "Unlock the vault first — a backup must contain real secrets, not the encrypted blobs.";
        return;
      }
      if (totpAccounts.length === 0) {
        totpStatus.textContent = "Nothing to export yet — add an account first.";
        return;
      }
      const passphrase = window.prompt(
        "Backup passphrase (min 4 characters). Use the same passphrase as your vault for one-passphrase simplicity. Keep it safe — it's the only way to open this backup.",
        ""
      );
      if (passphrase === null) return; // cancelled
      const blob = await exportTotpBackup(totpAccounts, passphrase);
      caps.saveFile(
        new TextEncoder().encode(serializeTotpBackup(blob)),
        totpBackupFilename(),
        "application/json"
      );
      totpStatus.textContent =
        `Exported ${totpAccounts.length} account${totpAccounts.length === 1 ? "" : "s"} to an encrypted backup — keep the file and passphrase safe.`;
    })().catch((err) => {
      totpStatus.textContent = err instanceof Error ? err.message : "Could not export.";
    });
  });

  totpImport.addEventListener("click", () => totpImportFile.click());

  totpImportFile.addEventListener("change", () => {
    void (async () => {
      const file = totpImportFile.files?.[0];
      if (!file) return;
      try {
        const text = await readTextFile(file);
        const blob = parseTotpBackupFile(text);
        const passphrase = window.prompt("Passphrase for this backup file:", "");
        if (passphrase === null) return;
        const entries = await importTotpBackup(blob, passphrase);
        if (entries.length === 0) {
          totpStatus.textContent = "That backup contains no accounts.";
          return;
        }
        const current = totpAccounts.length;
        if (
          !window.confirm(
            `Restore ${entries.length} account${entries.length === 1 ? "" : "s"} from this backup? This replaces your ${current} current account${current === 1 ? "" : "s"}.`
          )
        ) {
          return;
        }
        if (totpLockState(await hasTotpPassphrase(caps.storage), totpKey !== null) === "locked") {
          totpStatus.textContent = "Unlock the vault first so the restored accounts can be encrypted.";
          return;
        }
        await clearStoredTotpAccounts(caps.storage);
        for (const entry of entries) {
          await addTotpAccount(backupEntryToAccountInput(entry), caps.storage, totpKey ?? undefined);
        }
        totpStatus.textContent = `Restored ${entries.length} account${entries.length === 1 ? "" : "s"} from the backup.`;
        await renderTotpList();
      } catch (err) {
        totpStatus.textContent = err instanceof Error ? err.message : "Could not restore that backup.";
      } finally {
        totpImportFile.value = "";
      }
    })();
  });

  totpDeleteAll.addEventListener("click", () => {
    void (async () => {
      const count = totpAccounts.length;
      if (count === 0) {
        totpStatus.textContent = "No accounts to delete.";
        return;
      }
      if (
        !window.confirm(
          `Delete all ${count} account${count === 1 ? "" : "s"}? This cannot be undone — export a backup first.`
        )
      ) {
        return;
      }
      await clearStoredTotpAccounts(caps.storage);
      totpAccounts = [];
      totpStatus.textContent = `Deleted all ${count} account${count === 1 ? "" : "s"}.`;
      await renderTotpList();
    })().catch((err) => {
      totpStatus.textContent = err instanceof Error ? err.message : "Could not delete accounts.";
    });
  });

  /* QR scan — jsQR is imported lazily so it never touches the boot chunk. */
  const totpQrBtn = $("totp-qr-btn") as HTMLButtonElement;
  const totpQrFile = $("totp-qr-file") as HTMLInputElement;

  function readFileDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") resolve(reader.result);
        else reject(new Error("Could not read that image."));
      };
      reader.onerror = () => reject(new Error("Could not read that image."));
      reader.readAsDataURL(file);
    });
  }

  function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Could not decode that image."));
      img.src = src;
    });
  }

  totpQrBtn.addEventListener("click", () => totpQrFile.click());

  totpQrFile.addEventListener("change", () => {
    void (async () => {
      const file = totpQrFile.files?.[0];
      if (!file) return;
      totpStatus.textContent = "Reading QR code…";
      try {
        const dataUrl = await readFileDataUrl(file);
        const img = await loadImage(dataUrl);
        // Downscale to ≤1024px for fast decoding; keep a 21px floor.
        const scale = Math.min(1, 1024 / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(21, Math.round(img.naturalWidth * scale));
        const h = Math.max(21, Math.round(img.naturalHeight * scale));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Could not process that image here.");
        ctx.drawImage(img, 0, 0, w, h);
        const imageData = ctx.getImageData(0, 0, w, h);
        const { decodeQrImage } = await import("../core/qr-decode");
        const text = decodeQrImage(imageData.data, w, h);
        if (!text) {
          totpStatus.textContent = "No QR code found in that image — try a clearer screenshot.";
          return;
        }
        if (!text.startsWith("otpauth://")) {
          totpStatus.textContent = "That QR isn't a TOTP link (only otpauth://totp is supported).";
          return;
        }
        const parsed = parseOtpauthUri(text);
        await addTotpAccount(
          { label: parsed.label, issuer: parsed.issuer, secret: parsed.secret, digits: parsed.digits, period: parsed.period },
          caps.storage,
          totpKey ?? undefined
        );
        totpStatus.textContent = `Account “${parsed.label}” added from QR — your first code is below.`;
        await renderTotpList();
      } catch (err) {
        totpStatus.textContent = err instanceof Error ? err.message : "Could not read that QR code.";
      } finally {
        totpQrFile.value = "";
      }
    })();
  });

  totpAddBtn.addEventListener("click", () => {
    void (async () => {
      const raw = totpAddSecret.value.trim();
      let parsed;
      if (raw.startsWith("otpauth://")) {
        try {
          parsed = parseOtpauthUri(raw);
        } catch (err) {
          totpStatus.textContent = err instanceof Error ? err.message : "Could not parse that link.";
          return;
        }
      } else if (raw) {
        parsed = { label: totpAddLabel.value.trim() || "Account", issuer: "", secret: raw.replace(/\s/g, "").toUpperCase(), digits: 6, period: 30 };
      } else {
        totpStatus.textContent = "Paste an otpauth:// link or a base32 secret.";
        return;
      }
      try {
        await addTotpAccount(
          { label: parsed.label, issuer: parsed.issuer, secret: parsed.secret, digits: parsed.digits, period: parsed.period },
          caps.storage,
          totpKey ?? undefined
        );
        totpAddLabel.value = "";
        totpAddSecret.value = "";
        totpStatus.textContent = "Account saved — your first code is below.";
        await renderTotpList();
      } catch (err) {
        totpStatus.textContent = err instanceof Error ? err.message : "Could not save that account.";
      }
    })();
  });

  void refreshTotpUnlockUi().then(() => void renderTotpList());
  if (totpTimer !== undefined) window.clearInterval(totpTimer);
  totpTimer = window.setInterval(() => void renderTotpCodes(), 1000);

  /* Privacy sweep ---------------------------------------------------------- */
  const sweepScan = $("sweep-scan") as HTMLButtonElement;
  const sweepFilter = $("sweep-filter") as HTMLInputElement;
  const sweepList = $("sweep-list");
  const sweepStatus = $("sweep-status");
  const sweepClearCache = $("sweep-clear-cache") as HTMLButtonElement;
  let sweepHosts: SweepHost[] = [];

  function renderSweepList(): void {
    const filtered = filterSweepHosts(sweepHosts, sweepFilter.value);
    sweepList.innerHTML = "";
    if (filtered.length === 0) {
      sweepList.textContent = sweepHosts.length === 0 ? "Scan first — nothing to show yet." : "No hosts match that filter.";
      return;
    }
    for (const host of filtered.slice(0, 30)) {
      const row = document.createElement("div");
      row.className = "result-row";
      const head = document.createElement("div");
      const title = document.createElement("strong");
      title.className = "result-title";
      title.textContent = host.host;
      const meta = document.createElement("span");
      meta.className = "result-meta";
      const parts: string[] = [];
      if (host.historyVisits > 0) parts.push(`${host.historyVisits} visit${host.historyVisits === 1 ? "" : "s"}`);
      if (host.cookieCount > 0) parts.push(`${host.cookieCount} cookie${host.cookieCount === 1 ? "" : "s"}`);
      meta.textContent = parts.join(" · ");
      head.append(title, meta);
      const clearHistory = document.createElement("button");
      clearHistory.type = "button";
      clearHistory.className = "mini-btn";
      clearHistory.textContent = "Clear history";
      clearHistory.disabled = host.historyVisits === 0;
      clearHistory.addEventListener("click", () => {
        void (async () => {
          const deleted = await caps.deleteHistoryForHost(host.host);
          host.historyVisits = 0;
          sweepStatus.textContent = `Removed ${deleted} history entr${deleted === 1 ? "y" : "ies"} for ${host.host}.`;
          renderSweepList();
        })();
      });
      const clearCookies = document.createElement("button");
      clearCookies.type = "button";
      clearCookies.className = "mini-btn";
      clearCookies.textContent = "Clear cookies";
      clearCookies.disabled = host.cookieCount === 0;
      clearCookies.addEventListener("click", () => {
        void (async () => {
          const origin = `https://${host.host}`;
          const cookies = await caps.getCookies(origin);
          for (const cookie of cookies) {
            await caps.removeCookie(origin, cookie.name).catch(() => {
              // A cookie may vanish mid-loop; keep going.
            });
          }
          host.cookieCount = 0;
          sweepStatus.textContent = `Removed ${cookies.length} cookie${cookies.length === 1 ? "" : "s"} for ${host.host}.`;
          renderSweepList();
        })();
      });
      const forget = document.createElement("button");
      forget.type = "button";
      forget.className = "mini-btn danger";
      forget.textContent = "Forget site";
      forget.addEventListener("click", () => {
        void (async () => {
          if (!window.confirm(`Forget ${host.host}? This clears its cookies, storage and cache — you'll be signed out there.`)) return;
          await caps.clearSiteData(`https://${host.host}`).catch(() => {
            // Browsing-data removal can fail for odd origins; cookies still go.
          });
          const origin = `https://${host.host}`;
          const cookies = await caps.getCookies(origin);
          for (const cookie of cookies) {
            await caps.removeCookie(origin, cookie.name).catch(() => {});
          }
          await caps.deleteHistoryForHost(host.host);
          host.historyVisits = 0;
          host.cookieCount = 0;
          sweepStatus.textContent = `Forgot ${host.host} — history, cookies, storage and cache cleared.`;
          renderSweepList();
        })();
      });
      row.append(head, clearHistory, clearCookies, forget);
      sweepList.appendChild(row);
    }
  }

  sweepScan.addEventListener("click", () => {
    void (async () => {
      sweepStatus.textContent = "Scanning history and cookies…";
      const [history, cookieHosts] = await Promise.all([caps.getHistoryDomains(7), caps.getAllCookieHosts()]);
      const plan = buildSweepPlan(history, cookieHosts);
      sweepHosts = plan.hosts;
      if (!hasSweepWork(plan)) {
        sweepStatus.textContent = "Nothing to clear in the last 7 days — clean slate.";
      } else {
        sweepStatus.textContent =
          `${plan.totalHosts} site${plan.totalHosts === 1 ? "" : "s"} · ${plan.totalHistoryVisits} history entr${plan.totalHistoryVisits === 1 ? "y" : "ies"} · ${plan.totalCookies} cookie${plan.totalCookies === 1 ? "" : "s"}. Everything below is on this device.`;
      }
      renderSweepList();
    })().catch(() => {
      sweepStatus.textContent = "Could not scan — check the history/browsingData permissions.";
    });
  });

  sweepFilter.addEventListener("input", () => renderSweepList());

  sweepClearCache.addEventListener("click", () => {
    void (async () => {
      await caps.clearCacheAll();
      sweepStatus.textContent = "Cached files cleared.";
    })().catch(() => {
      sweepStatus.textContent = "Could not clear the cache — check the browsingData permission.";
    });
  });

  return () => {
    if (totpTimer !== undefined) window.clearInterval(totpTimer);
  };
}
