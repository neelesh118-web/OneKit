import { localStorageArea, type KvStorage } from "./storage-utils";

/**
 * Vault encryption — password-protects the AI chat vault entirely on-device
 * with WebCrypto: PBKDF2 (SHA-256) key derivation + AES-GCM. When enabled,
 * the plaintext vault is removed from storage and replaced by an encrypted
 * blob; the popup decrypts it in memory after the user enters the password.
 * There is no recovery — losing the password means losing the vault.
 */

export const VAULT_CRYPTO_STORAGE_KEY = "ok.vaultCrypto";
const PBKDF2_ITERATIONS = 150_000;

export interface VaultCryptoBlob {
  kdf: "pbkdf2";
  iterations: number;
  salt: string; // base64
  iv: string; // base64
  ciphertext: string; // base64
}

export function isVaultCryptoBlob(value: unknown): value is VaultCryptoBlob {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    v.kdf === "pbkdf2" &&
    typeof v.iterations === "number" &&
    typeof v.salt === "string" &&
    typeof v.iv === "string" &&
    typeof v.ciphertext === "string"
  );
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/** Copies a Uint8Array into a fresh ArrayBuffer (TS's BufferSource typing). */
function toBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function deriveKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: toBuffer(salt), iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/** Encrypts a JSON string into a self-contained blob (salt + iv + ciphertext). */
export async function encryptVaultJson(json: string, passphrase: string): Promise<VaultCryptoBlob> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(passphrase, salt);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: toBuffer(iv) },
    key,
    new TextEncoder().encode(json)
  );
  return {
    kdf: "pbkdf2",
    iterations: PBKDF2_ITERATIONS,
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext))
  };
}

/** Decrypts a blob. Throws on a wrong passphrase or corrupt data. */
export async function decryptVaultJson(blob: VaultCryptoBlob, passphrase: string): Promise<string> {
  const key = await deriveKey(passphrase, base64ToBytes(blob.salt));
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toBuffer(base64ToBytes(blob.iv)) },
    key,
    toBuffer(base64ToBytes(blob.ciphertext))
  );
  return new TextDecoder().decode(plain);
}

export async function readVaultCrypto(storage: KvStorage): Promise<VaultCryptoBlob | null> {
  const raw = await storage.get(VAULT_CRYPTO_STORAGE_KEY);
  const value = raw[VAULT_CRYPTO_STORAGE_KEY];
  return isVaultCryptoBlob(value) ? value : null;
}

export async function writeVaultCrypto(storage: KvStorage, blob: VaultCryptoBlob | null): Promise<void> {
  if (blob === null) await storage.remove(VAULT_CRYPTO_STORAGE_KEY);
  else await storage.set({ [VAULT_CRYPTO_STORAGE_KEY]: blob });
}

export function localStorageVaultCrypto(): KvStorage {
  return localStorageArea();
}
