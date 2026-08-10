// @vitest-environment node
import { describe, expect, it } from "vitest";
import FontLib from "fonteditor-core";
import { convertFont } from "../src/core/converter/fonts";

// CJS interop (same guard as the module itself).
const F = (FontLib as unknown as { default?: typeof FontLib }).default ?? FontLib;

function magic(bytes: Uint8Array): string {
  return Array.from(bytes.subarray(0, 4))
    .map((b) => String.fromCharCode(b))
    .join("");
}

/** A valid minimal TTF produced by fonteditor's empty font. */
function minimalTtf(): Uint8Array {
  return new Uint8Array((F as { Font: { create(): { write(o: { type: string }): ArrayBuffer } } }).Font.create().write({ type: "ttf" }));
}

describe("converter fonts", () => {
  it("rejects non-font bytes honestly", async () => {
    await expect(convertFont(new TextEncoder().encode("not a font"), "font-woff")).rejects.toThrow(/Could not read this font/);
  });

  it("converts TTF → WOFF → WOFF2 → TTF around the full loop", async () => {
    const ttf = minimalTtf();
    expect(magic(ttf)).toBe("\u0000\u0001\u0000\u0000");

    const woff = await convertFont(ttf, "font-woff");
    expect(magic(woff)).toBe("wOFF");

    const woff2 = await convertFont(woff, "font-woff2");
    expect(magic(woff2)).toBe("wOF2");

    const back = await convertFont(woff2, "font-ttf");
    expect(magic(back)).toBe("\u0000\u0001\u0000\u0000");
    expect(back.length).toBeGreaterThan(1000);
  });

  it("converts WOFF → TTF directly", async () => {
    const woff = await convertFont(minimalTtf(), "font-woff");
    const ttf = await convertFont(woff, "font-ttf");
    expect(magic(ttf)).toBe("\u0000\u0001\u0000\u0000");
  });
});
