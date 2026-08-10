import { describe, expect, it } from "vitest";
import {
  isLockedBlob,
  lockText,
  lockTextInline,
  unlockText,
  unlockTextInline,
  validatePassphrase
} from "../src/core/text-locker";

describe("text locker", () => {
  it("validates passphrase length", () => {
    expect(validatePassphrase("short")).toBeTruthy();
    expect(validatePassphrase("longenough")).toBeNull();
  });

  it("rejects empty text", async () => {
    await expect(lockText("   ", "longenough")).rejects.toThrow();
  });

  it("round-trips text through lock/unlock", async () => {
    const blob = await lockText("super-secret-token", "correct horse battery staple");
    expect(blob).not.toContain("super-secret-token");
    const text = await unlockText(blob, "correct horse battery staple");
    expect(text).toBe("super-secret-token");
  });

  it("fails on a wrong passphrase", async () => {
    const blob = await lockText("secret", "longenoughpass");
    await expect(unlockText(blob, "wrongpass123")).rejects.toThrow(/Wrong passphrase/);
  });

  it("rejects garbage input", async () => {
    await expect(unlockText("not a blob", "longenoughpass")).rejects.toThrow(/doesn't look like/);
  });

  it("supports inline onekit-lock blobs", async () => {
    const inline = await lockTextInline("note text", "alongpassphrase");
    expect(inline.startsWith("onekit-lock:")).toBe(true);
    expect(isLockedBlob(inline)).toBe(true);
    expect(isLockedBlob("plain text")).toBe(false);
    const text = await unlockTextInline(inline, "alongpassphrase");
    expect(text).toBe("note text");
  });
});
