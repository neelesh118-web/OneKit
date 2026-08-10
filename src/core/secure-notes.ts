import type { KvStorage } from "./storage-utils";
import {
  decryptVaultJson,
  encryptVaultJson,
  isVaultCryptoBlob,
  type VaultCryptoBlob
} from "./vault-crypto";

/**
 * Encrypted secure notes — a small private notes vault reusing the exact
 * same vault-crypto scheme as the AI chat vault (PBKDF2 + AES-GCM, whole
 * blob). When a passphrase is set the notes live in storage as one
 * encrypted blob; the popup holds the decrypted copy in memory only.
 * No recovery — a lost passphrase means lost notes (stated in the UI).
 */

export const SECURE_NOTES_STORAGE_KEY = "ok.secureNotes";

export interface SecureNote {
  id: string;
  title: string;
  body: string;
  updatedAt: number;
}

export interface SecureNotesVault {
  version: 1;
  notes: SecureNote[];
}

export function emptyNotesVault(): SecureNotesVault {
  return { version: 1, notes: [] };
}

export function isNotesVault(value: unknown): value is SecureNotesVault {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (v.version !== 1 || !Array.isArray(v.notes)) return false;
  return v.notes.every(
    (n) =>
      !!n &&
      typeof n === "object" &&
      typeof (n as Record<string, unknown>).id === "string" &&
      typeof (n as Record<string, unknown>).title === "string" &&
      typeof (n as Record<string, unknown>).body === "string" &&
      typeof (n as Record<string, unknown>).updatedAt === "number"
  );
}

/** The stored value is a cipher blob exactly when encryption is on. */
export function notesAreEncrypted(value: unknown): boolean {
  return isVaultCryptoBlob(value);
}

export async function readNotesStorage(storage: KvStorage): Promise<unknown> {
  const raw = await storage.get(SECURE_NOTES_STORAGE_KEY);
  return raw[SECURE_NOTES_STORAGE_KEY];
}

/** Plaintext mode (no passphrase set). */
export async function saveNotesPlain(storage: KvStorage, vault: SecureNotesVault): Promise<void> {
  await storage.set({ [SECURE_NOTES_STORAGE_KEY]: vault });
}

/** Reads the vault when unencrypted; returns null when encrypted or empty. */
export async function loadNotesVault(storage: KvStorage): Promise<SecureNotesVault | null> {
  const value = await readNotesStorage(storage);
  if (value === undefined || value === null) return emptyNotesVault();
  if (isNotesVault(value)) return value;
  return null; // encrypted blob — needs unlock
}

export async function unlockNotes(storage: KvStorage, passphrase: string): Promise<SecureNotesVault> {
  const value = await readNotesStorage(storage);
  if (!isVaultCryptoBlob(value)) {
    throw new Error("Notes are not encrypted.");
  }
  const json = await decryptVaultJson(value, passphrase); // throws on wrong passphrase
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error("The notes file is corrupt.");
  }
  if (!isNotesVault(parsed)) throw new Error("The notes file is corrupt.");
  return parsed;
}

/** Encrypts the vault under a passphrase and stores the blob. */
export async function lockNotes(storage: KvStorage, passphrase: string, vault: SecureNotesVault): Promise<void> {
  const blob = await encryptVaultJson(JSON.stringify(vault), passphrase);
  await storage.set({ [SECURE_NOTES_STORAGE_KEY]: blob });
}

export async function removeNotesEncryption(storage: KvStorage, vault: SecureNotesVault): Promise<void> {
  await saveNotesPlain(storage, vault);
}

export async function clearNotes(storage: KvStorage): Promise<void> {
  await storage.remove(SECURE_NOTES_STORAGE_KEY);
}

/* ------------------------- CRUD on the in-memory vault ------------------------- */

export function newNoteId(now: number): string {
  return `n${now.toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function addNote(vault: SecureNotesVault, title: string, body: string, now: number): SecureNotesVault {
  const next: SecureNotesVault = { version: 1, notes: [...vault.notes] };
  next.notes.unshift({ id: newNoteId(now), title: title.trim() || "Untitled", body, updatedAt: now });
  return next;
}

export function updateNote(
  vault: SecureNotesVault,
  id: string,
  patch: { title?: string; body?: string },
  now: number
): SecureNotesVault {
  const next: SecureNotesVault = { version: 1, notes: vault.notes.map((n) => ({ ...n })) };
  const note = next.notes.find((n) => n.id === id);
  if (!note) return next;
  if (patch.title !== undefined) note.title = patch.title.trim() || "Untitled";
  if (patch.body !== undefined) note.body = patch.body;
  note.updatedAt = now;
  return next;
}

export function removeNote(vault: SecureNotesVault, id: string): SecureNotesVault {
  return { version: 1, notes: vault.notes.filter((n) => n.id !== id) };
}
