/**
 * Encrypted text locker — AES-GCM encrypt/decrypt any text with a
 * passphrase, on-device via WebCrypto (reuses vault-crypto's scheme).
 *
 * Passwords, tokens, notes, whatever — encrypt here, decrypt anywhere
 * with the passphrase. The output is a self-contained OneKit cipher blob
 * (base64) that travels as plain text. No storage, no account, no cloud:
 * this is a pure encrypt/decrypt tool. No recovery — losing the
 * passphrase means losing the text (the UI says so honestly).
 */

import {
  decryptVaultJson,
  encryptVaultJson,
  isVaultCryptoBlob,
  type VaultCryptoBlob
} from "./vault-crypto";

export const TEXT_LOCKER_MIN_PASSPHRASE = 6;

export function validatePassphrase(passphrase: string): string | null {
  if (passphrase.length < TEXT_LOCKER_MIN_PASSPHRASE) {
    return `Passphrase must be at least ${TEXT_LOCKER_MIN_PASSPHRASE} characters.`;
  }
  return null;
}

/** Encrypts text into a JSON blob string. Throws on a too-short passphrase. */
export async function lockText(text: string, passphrase: string): Promise<string> {
  const error = validatePassphrase(passphrase);
  if (error) throw new Error(error);
  if (!text.trim()) throw new Error("Nothing to encrypt — paste some text first.");
  const blob = await encryptVaultJson(text, passphrase);
  return JSON.stringify(blob);
}

/** Decrypts a blob string. Throws on a wrong passphrase or corrupt input. */
export async function unlockText(blobJson: string, passphrase: string): Promise<string> {
  let blob: VaultCryptoBlob;
  try {
    const parsed = JSON.parse(blobJson) as unknown;
    if (!isVaultCryptoBlob(parsed)) throw new Error("shape");
    blob = parsed;
  } catch {
    throw new Error("That doesn't look like an OneKit encrypted-text blob.");
  }
  try {
    return await decryptVaultJson(blob, passphrase);
  } catch {
    throw new Error("Wrong passphrase, or the blob is corrupted.");
  }
}

/** Locks text into a compact single-line form (for notes/files). */
export function lockTextInline(text: string, passphrase: string): Promise<string> {
  return lockText(text, passphrase).then((json) => {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    return `onekit-lock:${JSON.stringify(parsed)}`;
  });
}

/** Detects and unlocks an inline `onekit-lock:` blob. */
export async function unlockTextInline(raw: string, passphrase: string): Promise<string> {
  const marker = "onekit-lock:";
  const body = raw.startsWith(marker) ? raw.slice(marker.length) : raw;
  return unlockText(body, passphrase);
}

export function isLockedBlob(text: string): boolean {
  if (text.startsWith("onekit-lock:")) return true;
  try {
    return isVaultCryptoBlob(JSON.parse(text));
  } catch {
    return false;
  }
}
