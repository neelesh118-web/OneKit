// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  base64ToText,
  hexToText,
  textToBase64,
  textToHex,
  textToUrl,
  urlToText
} from "../src/core/converter/text";

describe("converter text encodings", () => {
  it("round-trips Base64 including unicode", () => {
    const original = "héllo wörld 🚀";
    const encoded = textToBase64(original);
    expect(base64ToText(encoded)).toEqual({ ok: true, value: original });
  });

  it("rejects invalid Base64 honestly", () => {
    const result = base64ToText("not base64!!!");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.length).toBeGreaterThan(0);
  });

  it("round-trips hex", () => {
    const original = "abc123";
    const hex = textToHex(original);
    expect(hex).toBe("616263313233");
    expect(hexToText(hex)).toEqual({ ok: true, value: original });
  });

  it("rejects odd-length hex", () => {
    expect(hexToText("abc").ok).toBe(false);
    expect(hexToText("zz").ok).toBe(false);
  });

  it("round-trips URL encoding", () => {
    const original = "a b&c=d/e?f";
    expect(urlToText(textToUrl(original))).toEqual({ ok: true, value: original });
  });
});
