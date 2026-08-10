// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  addTotpAccount,
  clearTotpAccounts,
  listTotpAccounts,
  type TotpAccount
} from "../src/core/totp";
import {
  backupEntryToAccountInput,
  exportTotpBackup,
  importTotpBackup,
  isTotpBackupBlob,
  parseTotpBackupFile,
  parseTotpBackupJson,
  serializeTotpBackup,
  totpBackupFilename
} from "../src/core/totp-backup";
import { createMemoryStorage } from "../src/core/storage-utils";

const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";
const ACCOUNTS: TotpAccount[] = [
  {
    id: "totp-a",
    label: "alice@gmail.com",
    issuer: "GitHub",
    secret: RFC_SECRET,
    digits: 6,
    period: 30,
    encrypted: false
  },
  {
    id: "totp-b",
    label: "Work",
    issuer: "Okta",
    secret: "JBSWY3DPEHPK3PXP",
    digits: 8,
    period: 60,
    encrypted: false
  }
];

describe("TOTP backup/export", () => {
  it("exports a self-contained encrypted blob that hides the secrets", async () => {
    const blob = await exportTotpBackup(ACCOUNTS, "backup-pass");
    expect(isTotpBackupBlob(blob)).toBe(true);
    const serialized = serializeTotpBackup(blob);
    expect(serialized).not.toContain(RFC_SECRET);
    expect(serialized).toContain('"ciphertext"');
  });

  it("round-trips: export → import returns the same accounts", async () => {
    const blob = await exportTotpBackup(ACCOUNTS, "backup-pass");
    const entries = await importTotpBackup(blob, "backup-pass");
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({
      label: "alice@gmail.com",
      issuer: "GitHub",
      secret: RFC_SECRET,
      digits: 6,
      period: 30
    });
    expect(entries[1]).toEqual({ label: "Work", issuer: "Okta", secret: "JBSWY3DPEHPK3PXP", digits: 8, period: 60 });
  });

  it("refuses a wrong passphrase honestly", async () => {
    const blob = await exportTotpBackup(ACCOUNTS, "right-pass");
    await expect(importTotpBackup(blob, "wrong-pass")).rejects.toThrow();
  });

  it("rejects a tampered blob (AES-GCM auth fails)", async () => {
    const blob = await exportTotpBackup(ACCOUNTS, "backup-pass");
    const tampered = { ...blob, ciphertext: blob.ciphertext.slice(0, -2) + (blob.ciphertext.endsWith("AA") ? "BB" : "AA") };
    await expect(importTotpBackup(tampered, "backup-pass")).rejects.toThrow();
  });

  it("rejects a short passphrase at export", async () => {
    await expect(exportTotpBackup(ACCOUNTS, "abc")).rejects.toThrow(/4 characters/);
  });

  it("rejects a decrypted payload with an unsupported version", () => {
    expect(() =>
      parseTotpBackupJson(JSON.stringify({ version: 99, exportedAt: "x", accounts: [] }))
    ).toThrow(/version/);
    expect(() => parseTotpBackupJson("not json at all")).toThrow(/JSON/);
    expect(() => parseTotpBackupJson(JSON.stringify({ version: 1, accounts: "nope" }))).toThrow(/account list/);
  });

  it("rejects a malformed backup entry", () => {
    expect(() =>
      parseTotpBackupJson(JSON.stringify({ version: 1, exportedAt: "x", accounts: [{ label: "X", secret: "" }] }))
    ).toThrow(/missing its label or secret/);
  });

  it("parseTotpBackupFile refuses junk and accepts a real file", async () => {
    expect(() => parseTotpBackupFile("hello")).toThrow(/valid OneKit backup/);
    expect(() => parseTotpBackupFile(JSON.stringify({ foo: 1 }))).toThrow(/isn't an OneKit TOTP backup/);
    const blob = await exportTotpBackup(ACCOUNTS, "backup-pass");
    expect(parseTotpBackupFile(serializeTotpBackup(blob))).toEqual(blob);
  });

  it("maps entries onto the account-store input shape", () => {
    const input = backupEntryToAccountInput(ACCOUNTS[1]!);
    expect(input).toEqual({ label: "Work", issuer: "Okta", secret: "JBSWY3DPEHPK3PXP", digits: 8, period: 60 });
  });

  it("delete-all clears the stored vault", async () => {
    const storage = createMemoryStorage();
    await addTotpAccount({ label: "GitHub", issuer: "GitHub", secret: RFC_SECRET, digits: 6, period: 30 }, storage);
    await addTotpAccount({ label: "Okta", issuer: "Okta", secret: "JBSWY3DPEHPK3PXP", digits: 6, period: 30 }, storage);
    expect(await listTotpAccounts(storage)).toHaveLength(2);
    await clearTotpAccounts(storage);
    expect(await listTotpAccounts(storage)).toHaveLength(0);
  });

  it("suggests a dated backup filename", () => {
    expect(totpBackupFilename(new Date("2026-08-10T12:00:00Z"))).toBe("onekit-totp-backup-2026-08-10.json");
  });
});
