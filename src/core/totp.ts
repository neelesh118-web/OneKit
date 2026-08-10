/**
 * TOTP authenticator — RFC 6238 one-time passwords, 100% local.
 *
 * - `totpAtTime` is the pure algorithm (HMAC-SHA1) behind every code.
 * - Accounts live in storage.local under `ok.totp.accounts`. Secrets can be
 *   stored in plaintext (default, honest warning in the UI) or encrypted at
 *   rest with AES-GCM when the user sets a passphrase. The passphrase is
 *   never stored — only a PBKDF2 salt + verifier blob, so the key can be
 *   re-derived on unlock and held in memory for the session.
 */

import type { KvStorage } from "./storage-utils";

export interface TotpAccount {
  id: string;
  /** Human label, e.g. "GitHub" or "alice@gmail.com". */
  label: string;
  issuer: string;
  /** Base32 secret (no padding/spaces). */
  secret: string;
  digits: number;
  period: number;
  /** True when the secret is AES-GCM encrypted at rest. */
  encrypted: boolean;
}

export interface TotpCode {
  code: string;
  /** Seconds until this code rotates. */
  remaining: number;
  period: number;
  digits: number;
}

const ACCOUNTS_KEY = "ok.totp.accounts";
const META_KEY = "ok.totp.meta";
const encoder = new TextEncoder();
const decoder = new TextDecoder();

/* Base32 (RFC 4648, case-insensitive, ignores spaces and padding) --------- */

const B32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Decode(input: string): Uint8Array {
  const cleaned = input.toUpperCase().replace(/[\s=-]/g, "");
  if (cleaned.length === 0) throw new Error("Secret is empty.");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of cleaned) {
    const idx = B32_ALPHABET.indexOf(char);
    if (idx === -1) throw new Error(`Invalid base32 character "${char}" in secret.`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

/* HMAC-SHA1 via WebCrypto -------------------------------------------------- */

async function hmacSha1(keyBytes: Uint8Array, message: Uint8Array): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    keyBytes as unknown as BufferSource,
    { name: "HMAC", hash: "SHA-1" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, message as unknown as BufferSource);
  return new Uint8Array(sig);
}

/**
 * RFC 6238 TOTP at a given Unix time (seconds).
 * Throws an honest error when the secret is not valid base32.
 */
export async function totpAtTime(
  secret: string,
  unixSeconds: number,
  digits = 6,
  period = 30
): Promise<TotpCode> {
  const keyBytes = base32Decode(secret);
  const counter = Math.floor(unixSeconds / period);
  const msg = new Uint8Array(8);
  // Big-endian 64-bit counter.
  let c = counter;
  for (let i = 7; i >= 0; i--) {
    msg[i] = c & 0xff;
    c = Math.floor(c / 256);
  }
  const hash = await hmacSha1(keyBytes, msg);
  const offset = hash[hash.length - 1]! & 0x0f;
  const binary =
    ((hash[offset]! & 0x7f) << 24) |
    ((hash[offset + 1]! & 0xff) << 16) |
    ((hash[offset + 2]! & 0xff) << 8) |
    (hash[offset + 3]! & 0xff);
  const code = (binary % 10 ** digits).toString().padStart(digits, "0");
  const remaining = period - (unixSeconds % period);
  return { code, remaining, period, digits };
}

/**
 * Computes codes for every account at one instant — the countdown tick.
 * A broken secret yields `{ code: "invalid", … }` inline rather than
 * throwing, so one bad row can never break the whole list render.
 */
export async function codesForAccounts(
  accounts: TotpAccount[],
  unixSeconds: number
): Promise<Record<string, TotpCode>> {
  const out: Record<string, TotpCode> = {};
  for (const account of accounts) {
    try {
      out[account.id] = await totpAtTime(account.secret, unixSeconds, account.digits, account.period);
    } catch {
      out[account.id] = { code: "invalid", remaining: 0, period: account.period, digits: account.digits };
    }
  }
  return out;
}

/** The three honest lock states the UI can be in. */
export type TotpLockState = "none" | "locked" | "unlocked";

export function totpLockState(hasPassphrase: boolean, hasKey: boolean): TotpLockState {
  if (!hasPassphrase) return "none";
  return hasKey ? "unlocked" : "locked";
}

/* otpauth:// URI parsing --------------------------------------------------- */

export interface ParsedOtpauth {
  label: string;
  issuer: string;
  secret: string;
  digits: number;
  period: number;
}

/** Parses `otpauth://totp/Label?secret=…&issuer=…&digits=6&period=30`. */
export function parseOtpauthUri(uri: string): ParsedOtpauth {
  const trimmed = uri.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("That doesn't look like an otpauth:// link.");
  }
  if (parsed.protocol !== "otpauth:" || parsed.host !== "totp") {
    throw new Error("Only otpauth://totp/ links are supported.");
  }
  const secret = (parsed.searchParams.get("secret") ?? "").replace(/[\s-]/g, "").toUpperCase();
  if (!secret) throw new Error("No secret in that link.");
  // Validate the secret now so a bad paste fails at add-time, not code-time.
  base32Decode(secret);
  const label = decodeURIComponent(parsed.pathname.replace(/^\//, "")) || "Account";
  const issuer = parsed.searchParams.get("issuer") ?? "";
  const digits = Number(parsed.searchParams.get("digits") ?? 6) || 6;
  const period = Number(parsed.searchParams.get("period") ?? 30) || 30;
  return { label, issuer, secret, digits: Math.min(10, Math.max(4, digits)), period };
}

/* Encryption at rest (optional passphrase) ---------------------------------- */

const PBKDF2_ITERATIONS = 150_000;

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

async function deriveTotpKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    "raw",
    encoder.encode(passphrase) as unknown as BufferSource,
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as unknown as BufferSource,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256"
    },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptWithKey(key: CryptoKey, plaintext: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as unknown as BufferSource },
    key,
    encoder.encode(plaintext) as unknown as BufferSource
  );
  const combined = new Uint8Array(iv.length + cipher.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(cipher), iv.length);
  return bytesToBase64(combined);
}

async function decryptWithKey(key: CryptoKey, data: string): Promise<string> {
  const combined = base64ToBytes(data);
  if (combined.length < 13) throw new Error("Encrypted secret is corrupt.");
  const iv = combined.slice(0, 12);
  const cipher = combined.slice(12);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as unknown as BufferSource },
    key,
    cipher as unknown as BufferSource
  );
  return decoder.decode(plain);
}

interface TotpMeta {
  salt?: string;
  verifier?: string;
}

async function readMeta(storage: KvStorage): Promise<TotpMeta> {
  const raw = await storage.get(META_KEY);
  return (raw[META_KEY] as TotpMeta | undefined) ?? {};
}

async function writeMeta(storage: KvStorage, meta: TotpMeta): Promise<void> {
  await storage.set({ [META_KEY]: meta });
}

/** True when a passphrase is configured (secrets are encrypted at rest). */
export async function hasTotpPassphrase(storage: KvStorage): Promise<boolean> {
  const meta = await readMeta(storage);
  return Boolean(meta.salt && meta.verifier);
}

/** Sets a passphrase: derives a key and stores salt + verifier. Existing
 * plaintext secrets are migrated to encrypted form. */
export async function setTotpPassphrase(passphrase: string, storage: KvStorage): Promise<void> {
  if (passphrase.length < 4) throw new Error("Passphrase must be at least 4 characters.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveTotpKey(passphrase, salt);
  const verifier = await encryptWithKey(key, "ok");
  await writeMeta(storage, { salt: bytesToBase64(salt), verifier });
  await migrateTotpSecrets(storage, key);
}

/** Removes the passphrase; secrets fall back to plaintext (UI warns first). */
export async function clearTotpPassphrase(storage: KvStorage): Promise<void> {
  await writeMeta(storage, {});
}

/** Derives the key from the passphrase and verifies it matches the stored verifier. */
export async function unlockTotp(passphrase: string, storage: KvStorage): Promise<CryptoKey> {
  const meta = await readMeta(storage);
  if (!meta.salt || !meta.verifier) throw new Error("No passphrase is set.");
  const key = await deriveTotpKey(passphrase, base64ToBytes(meta.salt));
  const check = await decryptWithKey(key, meta.verifier).catch(() => "");
  if (check !== "ok") throw new Error("Wrong passphrase.");
  return key;
}

async function migrateTotpSecrets(storage: KvStorage, key: CryptoKey): Promise<void> {
  const accounts = await readAccounts(storage);
  let changed = false;
  for (const account of accounts) {
    if (account.encrypted) continue;
    account.secret = await encryptWithKey(key, account.secret);
    account.encrypted = true;
    changed = true;
  }
  if (changed) await storage.set({ [ACCOUNTS_KEY]: accounts });
}

/* Account store ------------------------------------------------------------- */

async function readAccounts(storage: KvStorage): Promise<TotpAccount[]> {
  const raw = await storage.get(ACCOUNTS_KEY);
  const list = raw[ACCOUNTS_KEY] as TotpAccount[] | undefined;
  return Array.isArray(list) ? list : [];
}

async function writeAccounts(storage: KvStorage, accounts: TotpAccount[]): Promise<void> {
  await storage.set({ [ACCOUNTS_KEY]: accounts });
}

export async function listTotpAccounts(
  storage: KvStorage,
  key?: CryptoKey
): Promise<TotpAccount[]> {
  const accounts = await readAccounts(storage);
  if (!key) return accounts;
  const out: TotpAccount[] = [];
  for (const account of accounts) {
    if (account.encrypted) {
      const secret = await decryptWithKey(key, account.secret).catch(() => "");
      if (!secret) throw new Error("Could not decrypt accounts — wrong passphrase?");
      out.push({ ...account, secret });
    } else {
      out.push(account);
    }
  }
  return out;
}

export async function addTotpAccount(
  input: Omit<TotpAccount, "id" | "encrypted">,
  storage: KvStorage,
  key?: CryptoKey
): Promise<TotpAccount> {
  base32Decode(input.secret); // honest validation at add-time
  const account: TotpAccount = {
    ...input,
    id: `totp-${crypto.randomUUID()}`,
    encrypted: Boolean(key)
  };
  if (key) {
    account.secret = await encryptWithKey(key, account.secret);
  }
  const accounts = await readAccounts(storage);
  // Same label + issuer twice is a paste mistake — refuse honestly.
  const dup = accounts.some(
    (a) =>
      a.label === account.label &&
      a.issuer === account.issuer &&
      a.secret === account.secret
  );
  if (dup) throw new Error("That account is already saved.");
  accounts.push(account);
  await writeAccounts(storage, accounts);
  return account;
}

export async function removeTotpAccount(id: string, storage: KvStorage): Promise<void> {
  const accounts = await readAccounts(storage);
  await writeAccounts(
    storage,
    accounts.filter((a) => a.id !== id)
  );
}
