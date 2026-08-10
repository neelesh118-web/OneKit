/**
 * TOTP backup & restore — the #1 authenticator data-loss gap (phone lost =
 * accounts locked forever). Exports every account (plaintext base32 secrets)
 * as a single self-contained encrypted blob using the same vault-crypto
 * format as the AI chat vault, so there is exactly one encryption scheme in
 * OneKit. The backup is protected by its own passphrase — use the vault's
 * passphrase for one-passphrase simplicity, or any other.
 */

import type { KvStorage } from "./storage-utils";
import { clearTotpAccounts, type TotpAccount } from "./totp";
import {
  decryptVaultJson,
  encryptVaultJson,
  isVaultCryptoBlob,
  type VaultCryptoBlob
} from "./vault-crypto";

/** Bump only on a breaking format change. */
export const TOTP_BACKUP_VERSION = 1;

export interface TotpBackupEntry {
  label: string;
  issuer: string;
  secret: string;
  digits: number;
  period: number;
}

export interface TotpBackupPayload {
  version: number;
  exportedAt: string;
  accounts: TotpBackupEntry[];
}

/** Encrypts the given accounts into a self-contained backup blob. */
export async function exportTotpBackup(
  accounts: TotpAccount[],
  passphrase: string
): Promise<VaultCryptoBlob> {
  if (!passphrase || passphrase.length < 4) {
    throw new Error("Backup passphrase must be at least 4 characters.");
  }
  const payload: TotpBackupPayload = {
    version: TOTP_BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    accounts: accounts.map((a) => ({
      label: a.label,
      issuer: a.issuer,
      secret: a.secret,
      digits: a.digits,
      period: a.period
    }))
  };
  return encryptVaultJson(JSON.stringify(payload), passphrase);
}

/**
 * Parses and validates the decrypted backup JSON. Throws an honest error for
 * anything that doesn't look like a TOTP backup — never silently imports
 * garbage.
 */
export function parseTotpBackupJson(json: string): TotpBackupPayload {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("That backup file is corrupt — it isn't valid JSON.");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("That backup file has the wrong shape.");
  }
  const payload = parsed as Partial<TotpBackupPayload>;
  if (payload.version !== TOTP_BACKUP_VERSION) {
    throw new Error(`Unsupported backup version (${String(payload.version)}) — expected ${TOTP_BACKUP_VERSION}.`);
  }
  if (!Array.isArray(payload.accounts)) {
    throw new Error("That backup contains no account list.");
  }
  for (const entry of payload.accounts) {
    if (!entry || typeof entry !== "object") {
      throw new Error("A backup entry is malformed.");
    }
    const e = entry as Partial<TotpBackupEntry>;
    if (typeof e.label !== "string" || typeof e.secret !== "string" || !e.secret) {
      throw new Error("A backup entry is missing its label or secret.");
    }
    if (typeof e.digits !== "number" || typeof e.period !== "number") {
      throw new Error("A backup entry has invalid code settings.");
    }
  }
  return payload as TotpBackupPayload;
}

/** Decrypts a blob, validates the payload, and returns the accounts. */
export async function importTotpBackup(
  blob: VaultCryptoBlob,
  passphrase: string
): Promise<TotpBackupEntry[]> {
  const json = await decryptVaultJson(blob, passphrase);
  const payload = parseTotpBackupJson(json);
  return payload.accounts;
}

/** True when a value looks like a OneKit TOTP backup blob. */
export function isTotpBackupBlob(value: unknown): value is VaultCryptoBlob {
  return isVaultCryptoBlob(value);
}

/** Suggested backup filename with today's date. */
export function totpBackupFilename(now = new Date()): string {
  const date = now.toISOString().slice(0, 10);
  return `onekit-totp-backup-${date}.json`;
}

/** Serializes a blob to the JSON string saved to disk. */
export function serializeTotpBackup(blob: VaultCryptoBlob): string {
  return JSON.stringify(blob, null, 2);
}

/** Parses a saved backup file back into a blob (honest error on junk). */
export function parseTotpBackupFile(text: string): VaultCryptoBlob {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("That file isn't a valid OneKit backup.");
  }
  if (!isTotpBackupBlob(parsed)) {
    throw new Error("That file isn't an OneKit TOTP backup — check you picked the right file.");
  }
  return parsed;
}

/** Maps a backup entry onto the account store shape (no id yet). */
export function backupEntryToAccountInput(
  entry: TotpBackupEntry
): Omit<TotpAccount, "id" | "encrypted"> {
  return {
    label: entry.label,
    issuer: entry.issuer,
    secret: entry.secret,
    digits: Math.min(10, Math.max(4, entry.digits)),
    period: Math.max(1, entry.period)
  };
}

/** Deletes every stored account (used by restore-replace and delete-all). */
export async function clearStoredTotpAccounts(storage: KvStorage): Promise<void> {
  await clearTotpAccounts(storage);
}
