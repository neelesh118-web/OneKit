// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  addTotpAccount,
  base32Decode,
  clearTotpPassphrase,
  codesForAccounts,
  hasTotpPassphrase,
  listTotpAccounts,
  parseOtpauthUri,
  removeTotpAccount,
  setTotpPassphrase,
  totpAtTime,
  totpLockState,
  unlockTotp
} from "../src/core/totp";
import { createMemoryStorage } from "../src/core/storage-utils";

// RFC 6238 Appendix B test secret: "12345678901234567890"
const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("TOTP algorithm (RFC 6238 SHA-1 vectors)", () => {
  it("matches the published vectors at 8 digits", async () => {
    const cases: Array<[number, string]> = [
      [59, "94287082"],
      [1111111109, "07081804"],
      [1111111111, "14050471"],
      [1234567890, "89005924"],
      [2000000000, "69279037"],
      [20000000000, "65353130"]
    ];
    for (const [t, expected] of cases) {
      const { code } = await totpAtTime(RFC_SECRET, t, 8, 30);
      expect(code).toBe(expected);
    }
  });

  it("produces 6-digit codes and honest remaining seconds", async () => {
    const { code, remaining, period } = await totpAtTime(RFC_SECRET, 59, 6, 30);
    expect(code).toBe("287082");
    expect(remaining).toBe(1);
    expect(period).toBe(30);
  });
});

describe("base32 decoding", () => {
  it("decodes the RFC secret to 20 bytes", () => {
    const bytes = base32Decode(RFC_SECRET);
    expect(bytes.length).toBe(20);
    expect([...bytes].join(",")).toBe(
      "49,50,51,52,53,54,55,56,57,48,49,50,51,52,53,54,55,56,57,48"
    );
  });

  it("tolerates spaces, dashes and lower case; rejects bad chars", () => {
    expect(base32Decode("gezd gnbv gy3t qojq").length).toBe(10);
    expect(() => base32Decode("GEZD!")).toThrow(/base32/);
    expect(() => base32Decode("")).toThrow(/empty/i);
  });
});

describe("otpauth URI parsing", () => {
  it("parses a standard otpauth://totp link", () => {
    const parsed = parseOtpauthUri(
      "otpauth://totp/GitHub:alice?secret=GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ&issuer=GitHub&digits=6&period=30"
    );
    expect(parsed.label).toBe("GitHub:alice");
    expect(parsed.issuer).toBe("GitHub");
    expect(parsed.secret).toBe(RFC_SECRET);
    expect(parsed.digits).toBe(6);
    expect(parsed.period).toBe(30);
  });

  it("rejects non-totp and secret-less links honestly", () => {
    expect(() => parseOtpauthUri("https://example.com/")).toThrow(/otpauth/);
    expect(() => parseOtpauthUri("otpauth://hotp/x?secret=GEZDGNBVGY3TQOJQ")).toThrow(/totp/);
    expect(() => parseOtpauthUri("otpauth://totp/GitHub?issuer=GitHub")).toThrow(/secret/i);
  });

  it("validates the secret at parse time", () => {
    expect(() => parseOtpauthUri("otpauth://totp/X?secret=NOT-VALID-!!")).toThrow(/base32/);
  });
});

describe("account store", () => {
  it("adds, lists and removes accounts in plaintext mode", async () => {
    const storage = createMemoryStorage();
    const account = await addTotpAccount(
      { label: "GitHub", issuer: "GitHub", secret: RFC_SECRET, digits: 6, period: 30 },
      storage
    );
    expect(account.encrypted).toBe(false);
    const list = await listTotpAccounts(storage);
    expect(list).toHaveLength(1);
    expect(list[0]!.secret).toBe(RFC_SECRET);
    await removeTotpAccount(account.id, storage);
    expect(await listTotpAccounts(storage)).toHaveLength(0);
  });

  it("refuses a duplicate paste and an invalid secret", async () => {
    const storage = createMemoryStorage();
    await addTotpAccount({ label: "GitHub", issuer: "GitHub", secret: RFC_SECRET, digits: 6, period: 30 }, storage);
    await expect(
      addTotpAccount({ label: "GitHub", issuer: "GitHub", secret: RFC_SECRET, digits: 6, period: 30 }, storage)
    ).rejects.toThrow(/already saved/);
    await expect(
      addTotpAccount({ label: "X", issuer: "X", secret: "1", digits: 6, period: 30 }, storage)
    ).rejects.toThrow(/base32/);
  });
});

describe("countdown tick (codesForAccounts)", () => {
  it("returns codes and remaining for every account at one instant", async () => {
    const codes = await codesForAccounts(
      [{ id: "a", label: "GitHub", issuer: "GitHub", secret: RFC_SECRET, digits: 6, period: 30, encrypted: false }],
      59
    );
    expect(codes["a"]!.code).toBe("287082");
    expect(codes["a"]!.remaining).toBe(1);
  });

  it("rotates across a period boundary: new code, remaining resets", async () => {
    const before = await codesForAccounts(
      [{ id: "a", label: "GitHub", issuer: "GitHub", secret: RFC_SECRET, digits: 6, period: 30, encrypted: false }],
      59
    );
    const after = await codesForAccounts(
      [{ id: "a", label: "GitHub", issuer: "GitHub", secret: RFC_SECRET, digits: 6, period: 30, encrypted: false }],
      60
    );
    expect(before["a"]!.code).not.toBe(after["a"]!.code);
    expect(after["a"]!.remaining).toBe(30);
    // 30s later, still inside the same period — same code, less remaining.
    const later = await codesForAccounts(
      [{ id: "a", label: "GitHub", issuer: "GitHub", secret: RFC_SECRET, digits: 6, period: 30, encrypted: false }],
      89
    );
    expect(later["a"]!.code).toBe(after["a"]!.code);
    expect(later["a"]!.remaining).toBe(1);
  });

  it("isolates a broken secret instead of throwing", async () => {
    const codes = await codesForAccounts(
      [{ id: "bad", label: "X", issuer: "X", secret: "NOT-BASE32!!", digits: 6, period: 30, encrypted: false }],
      60
    );
    expect(codes["bad"]!.code).toBe("invalid");
  });

  it("honours per-account periods", async () => {
    const codes = await codesForAccounts(
      [
        { id: "a", label: "A", issuer: "A", secret: RFC_SECRET, digits: 6, period: 30, encrypted: false },
        { id: "b", label: "B", issuer: "B", secret: RFC_SECRET, digits: 6, period: 60, encrypted: false }
      ],
      59
    );
    expect(codes["a"]!.remaining).toBe(1);
    expect(codes["b"]!.remaining).toBe(1);
  });
});

describe("lock-state helper", () => {
  it("maps passphrase + key to the three honest states", () => {
    expect(totpLockState(false, false)).toBe("none");
    expect(totpLockState(false, true)).toBe("none"); // key without passphrase can't exist
    expect(totpLockState(true, false)).toBe("locked");
    expect(totpLockState(true, true)).toBe("unlocked");
  });
});

describe("encryption at rest", () => {
  it("encrypts secrets when a passphrase is set and decrypts on unlock", async () => {
    const storage = createMemoryStorage();
    await setTotpPassphrase("correct horse", storage);
    expect(await hasTotpPassphrase(storage)).toBe(true);

    // Real flow: unlock first (the controller holds the key in memory),
    // then add — the new secret is stored encrypted.
    const unlockKey = await unlockTotp("correct horse", storage);
    await addTotpAccount(
      { label: "GitHub", issuer: "GitHub", secret: RFC_SECRET, digits: 6, period: 30 },
      storage,
      unlockKey
    );
    // Without the key: secret must not be readable in plaintext.
    const locked = await listTotpAccounts(storage);
    expect(locked[0]!.encrypted).toBe(true);
    expect(locked[0]!.secret).not.toContain("GEZD");

    const key = await unlockTotp("correct horse", storage);
    const open = await listTotpAccounts(storage, key);
    expect(open[0]!.secret).toBe(RFC_SECRET);

    // Codes still generate correctly after decryption.
    const { code } = await totpAtTime(open[0]!.secret, 59, 6, 30);
    expect(code).toBe("287082");
  });

  it("rejects a wrong passphrase and migrates plaintext secrets on set", async () => {
    const storage = createMemoryStorage();
    await addTotpAccount({ label: "GitHub", issuer: "GitHub", secret: RFC_SECRET, digits: 6, period: 30 }, storage);
    await setTotpPassphrase("hunter2", storage);
    const key = await unlockTotp("hunter2", storage);
    const open = await listTotpAccounts(storage, key);
    expect(open[0]!.secret).toBe(RFC_SECRET); // migrated from plaintext
    await expect(unlockTotp("wrong", storage)).rejects.toThrow(/wrong passphrase/i);
  });

  it("clearing the passphrase returns secrets to plaintext", async () => {
    const storage = createMemoryStorage();
    await setTotpPassphrase("abc12345", storage);
    await addTotpAccount({ label: "GitHub", issuer: "GitHub", secret: RFC_SECRET, digits: 6, period: 30 }, storage);
    await clearTotpPassphrase(storage);
    expect(await hasTotpPassphrase(storage)).toBe(false);
    const list = await listTotpAccounts(storage);
    expect(list[0]!.encrypted).toBe(false);
    expect(list[0]!.secret).toBe(RFC_SECRET);
  });
});
