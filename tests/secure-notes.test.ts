// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  addNote,
  clearNotes,
  emptyNotesVault,
  isNotesVault,
  loadNotesVault,
  lockNotes,
  notesAreEncrypted,
  readNotesStorage,
  removeNote,
  removeNotesEncryption,
  saveNotesPlain,
  SECURE_NOTES_STORAGE_KEY,
  unlockNotes,
  updateNote
} from "../src/core/secure-notes";
import { createMemoryStorage } from "../src/core/storage-utils";

const NOW = 1_800_000_000_000;

describe("vault CRUD", () => {
  it("adds, updates and removes notes", () => {
    let vault = emptyNotesVault();
    vault = addNote(vault, "Idea", "Ship OneKit 77", NOW);
    expect(vault.notes).toHaveLength(1);
    const id = vault.notes[0]!.id;
    expect(vault.notes[0]!.title).toBe("Idea");

    vault = updateNote(vault, id, { body: "Ship OneKit 77 by Friday" }, NOW + 1000);
    expect(vault.notes[0]!.body).toBe("Ship OneKit 77 by Friday");
    expect(vault.notes[0]!.updatedAt).toBe(NOW + 1000);

    vault = removeNote(vault, id);
    expect(vault.notes).toHaveLength(0);
  });

  it("defaults empty titles to Untitled", () => {
    let vault = emptyNotesVault();
    vault = addNote(vault, "   ", "body", NOW);
    expect(vault.notes[0]!.title).toBe("Untitled");
  });

  it("updateNote is a no-op for unknown ids", () => {
    const vault = addNote(emptyNotesVault(), "a", "b", NOW);
    expect(updateNote(vault, "missing", { body: "x" }, NOW)).toEqual(vault);
  });
});

describe("plaintext storage", () => {
  it("round-trips through storage", async () => {
    const store = createMemoryStorage();
    let vault = emptyNotesVault();
    vault = addNote(vault, "Note", "Body", NOW);
    await saveNotesPlain(store, vault);
    const loaded = await loadNotesVault(store);
    expect(loaded).toEqual(vault);
    expect(notesAreEncrypted(await readNotesStorage(store))).toBe(false);
  });

  it("returns an empty vault when nothing is stored", async () => {
    const store = createMemoryStorage();
    expect(await loadNotesVault(store)).toEqual(emptyNotesVault());
  });

  it("clearNotes empties the store", async () => {
    const store = createMemoryStorage();
    await saveNotesPlain(store, addNote(emptyNotesVault(), "a", "b", NOW));
    await clearNotes(store);
    expect(await loadNotesVault(store)).toEqual(emptyNotesVault());
  });
});

describe("encryption", () => {
  it("locks and unlocks with the same passphrase", async () => {
    const store = createMemoryStorage();
    let vault = emptyNotesVault();
    vault = addNote(vault, "Secret", "The combination is 1234", NOW);
    await lockNotes(store, "hunter2", vault);

    const stored = await readNotesStorage(store);
    expect(notesAreEncrypted(stored)).toBe(true);
    // No plaintext anywhere in storage
    expect(JSON.stringify(stored)).not.toContain("combination");

    const unlocked = await unlockNotes(store, "hunter2");
    expect(unlocked.notes[0]!.title).toBe("Secret");
    expect(unlocked.notes[0]!.body).toContain("1234");
  });

  it("rejects a wrong passphrase", async () => {
    const store = createMemoryStorage();
    const vault = addNote(emptyNotesVault(), "Secret", "Body", NOW);
    await lockNotes(store, "correct horse", vault);
    await expect(unlockNotes(store, "battery staple")).rejects.toThrow();
  });

  it("unlockNotes on plaintext storage is honest", async () => {
    const store = createMemoryStorage();
    await saveNotesPlain(store, emptyNotesVault());
    await expect(unlockNotes(store, "x")).rejects.toThrow(/not encrypted/);
  });

  it("detects tampering (AES-GCM auth)", async () => {
    const store = createMemoryStorage();
    const vault = addNote(emptyNotesVault(), "Secret", "Body", NOW);
    await lockNotes(store, "pass", vault);
    const stored = (await readNotesStorage(store)) as { ciphertext: string };
    stored.ciphertext = "AAAA" + stored.ciphertext.slice(4);
    await store.set({ [SECURE_NOTES_STORAGE_KEY]: stored });
    await expect(unlockNotes(store, "pass")).rejects.toThrow();
  });

  it("removeNotesEncryption writes plaintext back", async () => {
    const store = createMemoryStorage();
    const vault = addNote(emptyNotesVault(), "Secret", "Body", NOW);
    await lockNotes(store, "pass", vault);
    await removeNotesEncryption(store, vault);
    expect(notesAreEncrypted(await readNotesStorage(store))).toBe(false);
    expect((await loadNotesVault(store))?.notes).toHaveLength(1);
  });
});

describe("isNotesVault", () => {
  it("validates shape", () => {
    expect(isNotesVault(emptyNotesVault())).toBe(true);
    expect(isNotesVault({ version: 2, notes: [] })).toBe(false);
    expect(isNotesVault({ version: 1, notes: [{ id: 1 }] })).toBe(false);
    expect(isNotesVault(null)).toBe(false);
  });
});
