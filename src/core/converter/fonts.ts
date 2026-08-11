/**
 * Font conversions — TTF ↔ WOFF ↔ WOFF2 via fonteditor-core.
 * WOFF2 encode/decode needs its tiny wasm module; it's initialized once
 * (in the popup with the bundled wasm URL, in Node from the package).
 */
import FontLib from "fonteditor-core";
import { detectFromBytes } from "./detect";
import { toArrayBuffer } from "./util";

// CJS interop guard — works for both the Vite browser bundle and Node.
const F = (FontLib as unknown as { default?: typeof FontLib }).default ?? FontLib;
const anyF = F as unknown as {
  Font: {
    create(buffer?: ArrayBuffer, opts?: { type: string }): { write(opts: { type: string }): ArrayBuffer };
  };
  woff2: { init(url?: string): Promise<void> };
};

export type FontTarget = "font-ttf" | "font-woff" | "font-woff2";

const FONT_TYPE: Record<FontTarget, string> = {
  "font-ttf": "ttf",
  "font-woff": "woff",
  "font-woff2": "woff2"
};

const SOURCE_FONT_TYPE: Record<string, string> = {
  "font-ttf": "ttf",
  "font-woff": "woff",
  "font-woff2": "woff2",
  "font-otf": "otf"
};

let woff2Ready: Promise<void> | null = null;

/** Initializes the WOFF2 wasm module (idempotent). Pass the bundled URL in the popup. */
export function initWoff2(wasmUrl?: string): Promise<void> {
  if (!woff2Ready) {
    woff2Ready = wasmUrl
      ? anyF.woff2.init(wasmUrl).catch((err) => {
          woff2Ready = null;
          throw err;
        })
      : anyF.woff2.init().catch((err) => {
          woff2Ready = null;
          throw err;
        });
  }
  return woff2Ready;
}

export async function convertFont(bytes: Uint8Array, target: FontTarget): Promise<Uint8Array> {
  const source = detectFromBytes(bytes, "unknown");
  const sourceType = SOURCE_FONT_TYPE[source];
  if (!sourceType) {
    throw new Error("Could not read this font — the file is unsupported or corrupt.");
  }
  if (source === "font-woff2" || target === "font-woff2") {
    await initWoff2();
  }
  try {
    const font = anyF.Font.create(toArrayBuffer(bytes), { type: sourceType });
    const out = font.write({ type: FONT_TYPE[target] });
    return new Uint8Array(out);
  } catch (err) {
    throw new Error(`Font conversion failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
