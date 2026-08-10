/**
 * Local password vault — whole-blob AES-GCM at rest, reusing vault-crypto.
 *
 * The vault is one self-contained encrypted blob under `ok.passwords`
 * (plaintext JSON string when no master password is set, with the same
 * honest warning as TOTP). The master password is never stored — only a
 * salt + verifier blob, so the key is re-derived on unlock and held in
 * memory for the session. There is no recovery: losing the master password
 * means losing the vault (the backup export is the real recovery story).
 *
 * Fill is deliberately popup-only and click-only — see vault-fill.ts and
 * the controller. Nothing here ever auto-fills or auto-submits.
 */

import type { KvStorage } from "./storage-utils";
import {
  decryptBlobWithKey,
  decryptVaultJson,
  deriveVaultKey,
  encryptBlobWithKey,
  encryptVaultJson,
  isVaultCryptoBlob,
  PBKDF2_ITERATIONS,
  type VaultCryptoBlob
} from "./vault-crypto";

/** Password vaults get a real minimum — this is a password manager, not a toy. */
export const MIN_MASTER_PASSWORD_LENGTH = 8;

export interface PasswordEntry {
  id: string;
  /** Normalized hostname (lowercase, no www., no port). */
  site: string;
  username: string;
  password: string;
  notes: string;
  createdAt: number;
  updatedAt: number;
}

export interface PasswordVault {
  version: 1;
  entries: PasswordEntry[];
}

export interface VaultMeta {
  salt?: string;
  /** The verifier's own IV + ciphertext (AES-GCM needs the exact IV). */
  verifier?: { iv: string; ciphertext: string };
  /** KDF iterations used to derive the key (stored for forward migration). */
  iterations?: number;
}

const VAULT_KEY = "ok.passwords";
const META_KEY = "ok.passwordsMeta";

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* Site matching -------------------------------------------------------------- */

/** Normalizes a site string to a matchable hostname. */
export function normalizeSite(site: string): string {
  let host = site.trim().toLowerCase();
  if (!host) return "";
  if (host.includes("://")) {
    try {
      host = new URL(host).hostname;
    } catch {
      host = site.trim().toLowerCase();
    }
  }
  return host.replace(/^www\./, "").replace(/:\d+$/, "");
}

/** Exact host match, or subdomain match when allowed. */
export function siteMatches(entrySite: string, currentHost: string, allowSubdomains: boolean): boolean {
  const a = normalizeSite(entrySite);
  const b = normalizeSite(currentHost);
  if (!a || !b) return false;
  if (a === b) return true;
  return allowSubdomains && b.endsWith(`.${a}`);
}

/* Payload parse/validate ------------------------------------------------------ */

export function parseVaultJson(json: string): PasswordVault {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("The vault data is corrupt.");
  }
  if (!parsed || typeof parsed !== "object") throw new Error("The vault data is corrupt.");
  const payload = parsed as Partial<PasswordVault>;
  if (payload.version !== 1 || !Array.isArray(payload.entries)) {
    throw new Error("The vault data is corrupt.");
  }
  for (const entry of payload.entries) {
    if (!entry || typeof entry !== "object") throw new Error("The vault data is corrupt.");
    const e = entry as Partial<PasswordEntry>;
    if (
      typeof e.site !== "string" || typeof e.username !== "string" ||
      typeof e.password !== "string" || typeof e.notes !== "string"
    ) {
      throw new Error("The vault data is corrupt.");
    }
  }
  return payload as PasswordVault;
}

/* Master password ------------------------------------------------------------- */

async function readMeta(storage: KvStorage): Promise<VaultMeta> {
  const raw = await storage.get(META_KEY);
  return (raw[META_KEY] as VaultMeta | undefined) ?? {};
}

export async function hasMasterPassword(storage: KvStorage): Promise<boolean> {
  const meta = await readMeta(storage);
  return Boolean(meta.salt && meta.verifier);
}

/**
 * Sets a master password and encrypts any existing plaintext vault.
 * The meta record and the new ciphertext are written in ONE storage call,
 * so a crash or quota failure can never leave verifier and vault on
 * different keys (storage.local set is all-or-nothing per call).
 */
export async function setMasterPassword(passphrase: string, storage: KvStorage): Promise<CryptoKey> {
  if (passphrase.length < MIN_MASTER_PASSWORD_LENGTH) {
    throw new Error(`Master password must be at least ${MIN_MASTER_PASSWORD_LENGTH} characters.`);
  }
  const entries = await readVaultEntries(storage, null);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveVaultKey(passphrase, salt);
  const verifier = await encryptBlobWithKey(key, "ok", salt);
  // Encrypt with the SAME key derived from meta.salt — the blob's own salt
  // is recorded but informational (decryption always uses meta.salt).
  const blob = await encryptBlobWithKey(key, JSON.stringify({ version: 1, entries } satisfies PasswordVault), salt);
  await storage.set({
    [META_KEY]: {
      salt: bytesToBase64(salt),
      verifier: { iv: verifier.iv, ciphertext: verifier.ciphertext },
      iterations: PBKDF2_ITERATIONS
    },
    [VAULT_KEY]: blob
  });
  return key;
}

/** Derives + verifies the key from the passphrase. Throws on a wrong one. */
export async function unlockVault(passphrase: string, storage: KvStorage): Promise<CryptoKey> {
  const meta = await readMeta(storage);
  if (!meta.salt || !meta.verifier) throw new Error("No master password is set.");
  // Use the stored KDF iterations when present so vaults encrypted under an
  // older/future KDF setting stay unlockable; the constant is the fallback.
  const key = await deriveVaultKey(passphrase, base64ToBytes(meta.salt), meta.iterations ?? PBKDF2_ITERATIONS);
  const check = await decryptBlobWithKey(
    { kdf: "pbkdf2", iterations: meta.iterations ?? PBKDF2_ITERATIONS, salt: meta.salt, iv: meta.verifier.iv, ciphertext: meta.verifier.ciphertext },
    key
  ).catch(() => "");
  if (check !== "ok") throw new Error("Wrong master password.");
  return key;
}

/** Removes the master password; the vault falls back to plaintext (UI warns). */
export async function clearMasterPassword(storage: KvStorage, key: CryptoKey): Promise<void> {
  const entries = await readVaultEntries(storage, key);
  await writeVaultEntries(storage, entries, null);
  await storage.remove(META_KEY);
}

/**
 * Changes the master password while unlocked. Like setMasterPassword, the
 * new meta + new ciphertext are written in one atomic storage call — a
 * failure midway leaves the OLD key fully intact and usable.
 */
export async function changeMasterPassword(
  key: CryptoKey,
  newPassphrase: string,
  storage: KvStorage
): Promise<CryptoKey> {
  if (newPassphrase.length < MIN_MASTER_PASSWORD_LENGTH) {
    throw new Error(`Master password must be at least ${MIN_MASTER_PASSWORD_LENGTH} characters.`);
  }
  const entries = await readVaultEntries(storage, key);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const newKey = await deriveVaultKey(newPassphrase, salt);
  const verifier = await encryptBlobWithKey(newKey, "ok", salt);
  const blob = await encryptBlobWithKey(
    newKey,
    JSON.stringify({ version: 1, entries } satisfies PasswordVault),
    salt
  );
  await storage.set({
    [META_KEY]: {
      salt: bytesToBase64(salt),
      verifier: { iv: verifier.iv, ciphertext: verifier.ciphertext },
      iterations: PBKDF2_ITERATIONS
    },
    [VAULT_KEY]: blob
  });
  return newKey;
}

/* Vault read/write ------------------------------------------------------------- */

/**
 * Reads the vault. `key` must be non-null when the vault is encrypted.
 * Pass `null` explicitly for plaintext-only access.
 */
export async function readVaultEntries(storage: KvStorage, key: CryptoKey | null): Promise<PasswordEntry[]> {
  const raw = await storage.get(VAULT_KEY);
  const value = raw[VAULT_KEY];
  if (value === undefined) return [];
  if (isVaultCryptoBlob(value)) {
    if (!key) throw new Error("Vault is locked.");
    const json = await decryptBlobWithKey(value, key);
    return parseVaultJson(json).entries;
  }
  if (typeof value === "string") {
    return parseVaultJson(value).entries;
  }
  throw new Error("The vault data is corrupt.");
}

/** Writes the vault; encrypted when a key is given, plaintext otherwise. */
export async function writeVaultEntries(
  storage: KvStorage,
  entries: PasswordEntry[],
  key: CryptoKey | null
): Promise<void> {
  const payload: PasswordVault = { version: 1, entries };
  const json = JSON.stringify(payload);
  if (key) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const blob = await encryptBlobWithKey(key, json, salt);
    await storage.set({ [VAULT_KEY]: blob });
  } else {
    await storage.set({ [VAULT_KEY]: json });
  }
}

/** Removes every entry (delete-all and restore-replace). */
export async function clearVaultEntries(storage: KvStorage, key: CryptoKey | null): Promise<void> {
  await writeVaultEntries(storage, [], key);
}

/* CRUD ------------------------------------------------------------------------- */

export interface VaultEntryInput {
  site: string;
  username: string;
  password: string;
  notes: string;
}

export function validateVaultEntry(input: VaultEntryInput): string | null {
  if (!normalizeSite(input.site)) return "Enter the site (e.g. github.com).";
  if (!input.username.trim()) return "Enter a username or email.";
  if (!input.password) return "Enter a password (or generate one).";
  return null;
}

export async function addVaultEntry(
  input: VaultEntryInput,
  storage: KvStorage,
  key: CryptoKey | null
): Promise<PasswordEntry> {
  const entries = await readVaultEntries(storage, key);
  const site = normalizeSite(input.site);
  const dup = entries.some((e) => e.site === site && e.username.toLowerCase() === input.username.trim().toLowerCase());
  if (dup) throw new Error("An entry for that site + username already exists.");
  const now = Date.now();
  const entry: PasswordEntry = {
    id: `pw-${crypto.randomUUID()}`,
    site,
    username: input.username.trim(),
    password: input.password,
    notes: input.notes.trim(),
    createdAt: now,
    updatedAt: now
  };
  entries.push(entry);
  await writeVaultEntries(storage, entries, key);
  return entry;
}

export async function updateVaultEntry(
  id: string,
  patch: Partial<VaultEntryInput>,
  storage: KvStorage,
  key: CryptoKey | null
): Promise<void> {
  const entries = await readVaultEntries(storage, key);
  const entry = entries.find((e) => e.id === id);
  if (!entry) throw new Error("Entry not found.");
  if (patch.site !== undefined) entry.site = normalizeSite(patch.site) || entry.site;
  if (patch.username !== undefined) entry.username = patch.username.trim();
  if (patch.password !== undefined) entry.password = patch.password;
  if (patch.notes !== undefined) entry.notes = patch.notes.trim();
  entry.updatedAt = Date.now();
  await writeVaultEntries(storage, entries, key);
}

export async function removeVaultEntry(id: string, storage: KvStorage, key: CryptoKey | null): Promise<void> {
  const entries = await readVaultEntries(storage, key);
  await writeVaultEntries(
    storage,
    entries.filter((e) => e.id !== id),
    key
  );
}

/* Backup (same vault-crypto blob format) --------------------------------------- */

export interface VaultBackupEntry {
  site: string;
  username: string;
  password: string;
  notes: string;
}

export interface VaultBackupPayload {
  version: 1;
  exportedAt: string;
  entries: VaultBackupEntry[];
}

/** Encrypts the entries into a self-contained backup blob. */
export async function exportVaultBackup(
  entries: PasswordEntry[],
  passphrase: string
): Promise<VaultCryptoBlob> {
  if (!passphrase || passphrase.length < 4) {
    throw new Error("Backup passphrase must be at least 4 characters.");
  }
  const payload: VaultBackupPayload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    entries: entries.map((e) => ({
      site: e.site,
      username: e.username,
      password: e.password,
      notes: e.notes
    }))
  };
  return encryptVaultJson(JSON.stringify(payload), passphrase);
}

/** Decrypts a backup blob and validates the payload. */
export async function importVaultBackup(blob: VaultCryptoBlob, passphrase: string): Promise<VaultBackupEntry[]> {
  const json = await decryptVaultJson(blob, passphrase);
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("That backup file is corrupt.");
  }
  const payload = parsed as Partial<VaultBackupPayload>;
  if (payload.version !== 1 || !Array.isArray(payload.entries)) {
    throw new Error("That backup has the wrong shape or an unsupported version.");
  }
  for (const entry of payload.entries) {
    const e = entry as Partial<VaultBackupEntry>;
    if (typeof e.site !== "string" || typeof e.username !== "string" || typeof e.password !== "string") {
      throw new Error("A backup entry is malformed.");
    }
  }
  return payload.entries as VaultBackupEntry[];
}

/** Parses a saved backup file into a blob (honest error on junk). */
export function parseVaultBackupFile(text: string): VaultCryptoBlob {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("That file isn't a valid OneKit backup.");
  }
  if (!isVaultCryptoBlob(parsed)) {
    throw new Error("That file isn't an OneKit password-vault backup.");
  }
  return parsed;
}

export function serializeVaultBackup(blob: VaultCryptoBlob): string {
  return JSON.stringify(blob, null, 2);
}

export function vaultBackupFilename(now = new Date()): string {
  return `onekit-password-vault-backup-${now.toISOString().slice(0, 10)}.json`;
}

export function vaultBackupEntryToInput(entry: VaultBackupEntry): VaultEntryInput {
  return { site: entry.site, username: entry.username, password: entry.password, notes: entry.notes ?? "" };
}

export function storageUsesEncryption(value: unknown): boolean {
  return isVaultCryptoBlob(value);
}
