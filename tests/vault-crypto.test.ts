import { describe, expect, it } from "vitest";
import {
  decryptVaultJson,
  encryptVaultJson,
  isVaultCryptoBlob,
  readVaultCrypto,
  writeVaultCrypto
} from "../src/core/vault-crypto";
import { createMemoryStorage } from "../src/core/storage-utils";

describe("vault-crypto", () => {
  it("round-trips JSON through PBKDF2 + AES-GCM", async () => {
    const json = JSON.stringify([{ id: "c1", title: "secret chat", messages: [] }]);
    const blob = await encryptVaultJson(json, "correct horse battery staple");
    expect(blob.ciphertext).not.toContain("secret chat");
    const plain = await decryptVaultJson(blob, "correct horse battery staple");
    expect(plain).toBe(json);
  });

  it("produces unique ciphertext per encryption (random salt/iv)", async () => {
    const json = '{"a":1}';
    const a = await encryptVaultJson(json, "pw");
    const b = await encryptVaultJson(json, "pw");
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.salt).not.toBe(b.salt);
  });

  it("fails loudly on a wrong passphrase", async () => {
    const blob = await encryptVaultJson("top secret", "right");
    await expect(decryptVaultJson(blob, "wrong")).rejects.toThrow();
  });

  it("stores and clears the blob via the storage key", async () => {
    const s = createMemoryStorage();
    expect(await readVaultCrypto(s)).toBeNull();
    const blob = await encryptVaultJson("x", "pw");
    await writeVaultCrypto(s, blob);
    const read = await readVaultCrypto(s);
    expect(isVaultCryptoBlob(read)).toBe(true);
    await writeVaultCrypto(s, null);
    expect(await readVaultCrypto(s)).toBeNull();
  });
});
