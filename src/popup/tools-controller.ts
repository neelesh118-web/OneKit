import {
  DEFAULT_PASSWORD_OPTIONS,
  estimateStrength,
  generatePassword,
  type PasswordOptions
} from "../core/password-gen";
import type { OneKitCapabilities } from "./capabilities";

/**
 * Tools tab — QR generator, password generator, and page screenshot.
 * Everything here is computed locally (QR via a bundled encoder, passwords
 * via crypto, screenshot via the browser's own capture API).
 */
export function createToolsController(caps: OneKitCapabilities): () => void {
  const $ = (id: string): HTMLElement => {
    const el = document.getElementById(id);
    if (!el) throw new Error(`Missing element #${id}`);
    return el;
  };

  /* QR --------------------------------------------------------------- */
  const qrInput = $("qr-input") as HTMLInputElement;
  const qrBtn = $("qr-btn") as HTMLButtonElement;
  const qrOutput = $("qr-output");
  const qrStatus = $("qr-status");

  function makeQr(): void {
    const text = qrInput.value.trim();
    qrOutput.innerHTML = "";
    if (!text) {
      qrStatus.textContent = "Enter a URL or any text to encode.";
      return;
    }
    try {
      const { dataUrl, sizePx, modules } = caps.makeQr(text);
      const img = document.createElement("img");
      img.src = dataUrl;
      img.alt = "QR code";
      img.width = Math.min(sizePx, 220);
      img.height = Math.min(sizePx, 220);
      qrOutput.appendChild(img);
      qrStatus.textContent = `QR ready (${modules}×${modules} modules) — scan it with any phone camera.`;
    } catch (error) {
      qrStatus.textContent = error instanceof Error ? error.message : "Could not generate QR.";
    }
  }

  qrBtn.addEventListener("click", makeQr);
  qrInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") makeQr();
  });

  /* Password --------------------------------------------------------- */
  const pwLength = $("pw-length") as HTMLInputElement;
  const pwUpper = $("pw-upper") as HTMLInputElement;
  const pwLower = $("pw-lower") as HTMLInputElement;
  const pwDigits = $("pw-digits") as HTMLInputElement;
  const pwSymbols = $("pw-symbols") as HTMLInputElement;
  const pwAmbig = $("pw-ambig") as HTMLInputElement;
  const pwGenerate = $("pw-generate") as HTMLButtonElement;
  const pwOutput = $("pw-output") as HTMLInputElement;
  const pwStrength = $("pw-strength");
  const pwCopy = $("pw-copy") as HTMLButtonElement;

  function readOptions(): PasswordOptions {
    return {
      length: Math.max(4, Math.min(128, Number(pwLength.value) || DEFAULT_PASSWORD_OPTIONS.length)),
      upper: pwUpper.checked,
      lower: pwLower.checked,
      digits: pwDigits.checked,
      symbols: pwSymbols.checked,
      excludeAmbiguous: pwAmbig.checked
    };
  }

  function generate(): void {
    const password = generatePassword(readOptions());
    pwOutput.value = password;
    const strength = estimateStrength(password);
    pwStrength.textContent = `Strength: ${strength.label} (~${strength.entropyBits} bits entropy)`;
    pwStrength.className = `strength strength-${strength.score}`;
    pwCopy.disabled = false;
  }

  pwGenerate.addEventListener("click", generate);
  pwCopy.addEventListener("click", () => {
    void caps.copyText(pwOutput.value).then(() => {
      pwStrength.textContent = "Copied to clipboard ✓";
      window.setTimeout(() => void generate(), 1200);
    });
  });
  generate();

  /* Screenshot ------------------------------------------------------- */
  const screenshotBtn = $("screenshot-btn") as HTMLButtonElement;
  const screenshotStatus = $("screenshot-status");

  screenshotBtn.addEventListener("click", () => {
    void (async () => {
      screenshotStatus.textContent = "Capturing…";
      const dataUrl = await caps.captureVisibleTab();
      const filename = `onekit-screenshot-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.png`;
      caps.downloadDataUrl(dataUrl, filename);
      screenshotStatus.textContent = `Saved ${filename}.`;
    })().catch(() => {
      screenshotStatus.textContent = "Could not capture — try again on a normal web page.";
    });
  });

  return () => {};
}
