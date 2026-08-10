// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createMemoryStorage } from "../src/core/storage-utils";
import {
  addVaultEntry,
  changeMasterPassword,
  clearMasterPassword,
  clearVaultEntries,
  exportVaultBackup,
  hasMasterPassword,
  importVaultBackup,
  normalizeSite,
  parseVaultBackupFile,
  readVaultEntries,
  removeVaultEntry,
  serializeVaultBackup,
  setMasterPassword,
  siteMatches,
  unlockVault,
  updateVaultEntry,
  validateVaultEntry,
  vaultBackupEntryToInput,
  vaultBackupFilename
} from "../src/core/passwords";
import { PBKDF2_ITERATIONS } from "../src/core/vault-crypto";

const INPUT = { site: "github.com", username: "alice", password: "hunter2", notes: "work" };

describe("site normalization and matching", () => {
  it("normalizes schemes, www and ports", () => {
    expect(normalizeSite("https://GitHub.com/")).toBe("github.com");
    expect(normalizeSite("www.example.com")).toBe("example.com");
    expect(normalizeSite("https://mail.example.com:8080/x")).toBe("mail.example.com");
    expect(normalizeSite("   ")).toBe("");
  });

  it("matches exact hosts and optional subdomains", () => {
    expect(siteMatches("github.com", "github.com", false)).toBe(true);
    expect(siteMatches("github.com", "gist.github.com", false)).toBe(false);
    expect(siteMatches("github.com", "gist.github.com", true)).toBe(true);
    expect(siteMatches("github.com", "evilgithub.com", true)).toBe(false); // not a subdomain
  });

  it("validates entry inputs honestly", () => {
    expect(validateVaultEntry({ ...INPUT, site: " " })).toMatch(/site/);
    expect(validateVaultEntry({ ...INPUT, username: " " })).toMatch(/username/);
    expect(validateVaultEntry({ ...INPUT, password: "" })).toMatch(/password/);
    expect(validateVaultEntry(INPUT)).toBeNull();
  });
});

describe("plaintext mode (no master password)", () => {
  it("stores entries readable without a key", async () => {
    const storage = createMemoryStorage();
    expect(await hasMasterPassword(storage)).toBe(false);
    await addVaultEntry(INPUT, storage, null);
    const entries = await readVaultEntries(storage, null);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.site).toBe("github.com");
    expect(entries[0]!.password).toBe("hunter2");
  });

  it("refuses a duplicate site + username", async () => {
    const storage = createMemoryStorage();
    await addVaultEntry(INPUT, storage, null);
    await expect(addVaultEntry(INPUT, storage, null)).rejects.toThrow(/already exists/);
  });
});

describe("master-password encryption at rest", () => {
  it("encrypts the whole vault; nothing readable without the key", async () => {
    const storage = createMemoryStorage();
    await addVaultEntry(INPUT, storage, null);
    const key = await setMasterPassword("master-pass", storage);
    expect(await hasMasterPassword(storage)).toBe(true);

    const raw = (await storage.get("ok.passwords"))["ok.passwords"];
    expect(typeof raw).toBe("object"); // a blob, not the plaintext JSON string
    expect(JSON.stringify(raw)).not.toContain("hunter2");
    expect(JSON.stringify(raw)).not.toContain("alice");

    await expect(readVaultEntries(storage, null)).rejects.toThrow(/locked/i);
    const open = await readVaultEntries(storage, key);
    expect(open[0]!.password).toBe("hunter2");
  });

  it("unlocks with the right passphrase and refuses the wrong one", async () => {
    const storage = createMemoryStorage();
    await setMasterPassword("master-pass", storage);
    await expect(unlockVault("wrong-pass", storage)).rejects.toThrow(/wrong master password/i);
    const key = await unlockVault("master-pass", storage);
    expect(key).toBeTruthy();
  });

  it("keeps CRUD working under encryption", async () => {
    const storage = createMemoryStorage();
    const key = await setMasterPassword("master-pass", storage);
    const entry = await addVaultEntry(INPUT, storage, key);
    await updateVaultEntry(entry.id, { password: "new-pass" }, storage, key);
    let entries = await readVaultEntries(storage, key);
    expect(entries[0]!.password).toBe("new-pass");
    await removeVaultEntry(entry.id, storage, key);
    entries = await readVaultEntries(storage, key);
    expect(entries).toHaveLength(0);
  });

  it("changes the master password: old stops working, new works", async () => {
    const storage = createMemoryStorage();
    const key = await setMasterPassword("old-pass", storage);
    await addVaultEntry(INPUT, storage, key);
    const newKey = await changeMasterPassword(key, "new-pass", storage);
    await expect(unlockVault("old-pass", storage)).rejects.toThrow(/wrong master password/i);
    const unlocked = await unlockVault("new-pass", storage);
    const entries = await readVaultEntries(storage, unlocked);
    expect(entries[0]!.password).toBe("hunter2");
    expect(unlocked).toEqual(newKey); // same derived key object comparison may fail; check entries instead
    void newKey;
  });

  it("clearing the master password returns the vault to plaintext", async () => {
    const storage = createMemoryStorage();
    const key = await setMasterPassword("master-pass", storage);
    await addVaultEntry(INPUT, storage, key);
    await clearMasterPassword(storage, key);
    expect(await hasMasterPassword(storage)).toBe(false);
    const entries = await readVaultEntries(storage, null);
    expect(entries[0]!.password).toBe("hunter2");
  });

  it("delete-all clears the vault", async () => {
    const storage = createMemoryStorage();
    const key = await setMasterPassword("master-pass", storage);
    await addVaultEntry(INPUT, storage, key);
    await clearVaultEntries(storage, key);
    expect(await readVaultEntries(storage, key)).toHaveLength(0);
  });
});

describe("backup export/import", () => {
  it("round-trips and hides secrets in the file", async () => {
    const storage = createMemoryStorage();
    await addVaultEntry(INPUT, storage, null);
    const entries = await readVaultEntries(storage, null);
    const blob = await exportVaultBackup(entries, "backup-pass");
    const serialized = serializeVaultBackup(blob);
    expect(serialized).not.toContain("hunter2");
    const restored = await importVaultBackup(blob, "backup-pass");
    expect(restored[0]!.site).toBe("github.com");
    expect(restored[0]!.password).toBe("hunter2");
  });

  it("refuses a wrong passphrase and junk files", async () => {
    const storage = createMemoryStorage();
    await addVaultEntry(INPUT, storage, null);
    const blob = await exportVaultBackup(await readVaultEntries(storage, null), "backup-pass");
    await expect(importVaultBackup(blob, "wrong")).rejects.toThrow();
    expect(() => parseVaultBackupFile("hello")).toThrow(/valid OneKit backup/);
    expect(() => parseVaultBackupFile(JSON.stringify({ foo: 1 }))).toThrow(/password-vault backup/);
    expect(parseVaultBackupFile(serializeVaultBackup(blob))).toEqual(blob);
  });

  it("rejects a tampered backup (AES-GCM auth)", async () => {
    const storage = createMemoryStorage();
    await addVaultEntry(INPUT, storage, null);
    const blob = await exportVaultBackup(await readVaultEntries(storage, null), "backup-pass");
    const tampered = { ...blob, ciphertext: blob.ciphertext.slice(0, -2) + (blob.ciphertext.endsWith("AA") ? "BB" : "AA") };
    await expect(importVaultBackup(tampered, "backup-pass")).rejects.toThrow();
  });

  it("maps backup entries onto the store input and names files by date", () => {
    expect(vaultBackupEntryToInput({ site: "x.com", username: "u", password: "p", notes: "n" })).toEqual({
      site: "x.com",
      username: "u",
      password: "p",
      notes: "n"
    });
    expect(vaultBackupFilename(new Date("2026-08-10T12:00:00Z"))).toBe("onekit-password-vault-backup-2026-08-10.json");
  });
});

describe("master-password transaction safety (audit F-05)", () => {
  it("enforces a real minimum length", async () => {
    const storage = createMemoryStorage();
    await expect(setMasterPassword("short", storage)).rejects.toThrow(/at least 8/);
  });

  it("writes meta and ciphertext in ONE storage.set call (atomic re-key)", async () => {
    const storage = createMemoryStorage();
    await addVaultEntry(INPUT, storage, null);
    const sets: Array<Record<string, unknown>> = [];
    const original = storage.set.bind(storage);
    storage.set = async (items) => {
      sets.push(items);
      await original(items);
    };
    await setMasterPassword("master-pass", storage);
    const rekeySets = sets.filter((s) => Object.keys(s).length >= 2);
    expect(rekeySets.length).toBeGreaterThanOrEqual(1);
    const atomic = rekeySets[0]!;
    expect(Object.keys(atomic).sort()).toEqual(["ok.passwords", "ok.passwordsMeta"]);
  });

  it("records and honors the stored KDF iterations", async () => {
    const storage = createMemoryStorage();
    const key = await setMasterPassword("master-pass", storage);
    await addVaultEntry(INPUT, storage, key);
    const raw = await storage.get(["ok.passwordsMeta"]);
    const meta = raw["ok.passwordsMeta"] as { iterations?: number };
    expect(meta.iterations).toBe(PBKDF2_ITERATIONS);
    // Wrong passphrase still fails.
    await expect(unlockVault("wrong-pass", storage)).rejects.toThrow(/Wrong master password/);
    // Correct passphrase unlocks using the recorded iteration count.
    const unlocked = await unlockVault("master-pass", storage);
    expect(unlocked).toBeTruthy();
  });

  it("changeMasterPassword leaves the old key usable if the write fails", async () => {
    const storage = createMemoryStorage();
    const key = await setMasterPassword("master-pass", storage);
    await addVaultEntry(INPUT, storage, key);
    // Copy the seeded state into a storage whose multi-key writes fail once.
    const broken = createMemoryStorage();
    const raw = await storage.get(null);
    await broken.set(raw);
    const original = broken.set.bind(broken);
    let failNext = true;
    broken.set = async (items) => {
      if (failNext && Object.keys(items).length >= 2) {
        failNext = false;
        throw new Error("quota exceeded");
      }
      await original(items);
    };
    await expect(changeMasterPassword(key, "new-pass-here", broken)).rejects.toThrow();
    // Storage is untouched: the old master password still unlocks everything.
    expect(await hasMasterPassword(broken)).toBe(true);
    const oldKey = await unlockVault("master-pass", broken);
    expect(await readVaultEntries(broken, oldKey)).toHaveLength(1);
  });
});
