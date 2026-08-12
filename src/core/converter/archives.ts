/**
 * Archive conversions — ZIP / TAR / GZIP entirely via fflate.
 * No native code, no network: everything stays on the device.
 */
// The ESM browser build avoids Vite's CJS transform of fflate (which
// mangles its module-scope TextDecoder and breaks unzipSync).
import { gzipSync, gunzipSync, strFromU8, unzipSync, zipSync } from "fflate/browser";
import { sameRealmU8 } from "./zip-realm";
import { fromTar, toTar } from "./tar";

export { toTar as filesToTar };
export { fromTar as untarToFiles };

export function unzipToFiles(bytes: Uint8Array): Record<string, Uint8Array> {
  try {
    return unzipSync(bytes);
  } catch {
    throw new Error("Could not read this ZIP — the file may be corrupt or password-protected.");
  }
}

export function filesToZip(files: Record<string, Uint8Array>): Uint8Array {
  const realmFiles: Record<string, Uint8Array> = {};
  for (const [name, bytes] of Object.entries(files)) realmFiles[name] = sameRealmU8(bytes);
  return zipSync(realmFiles);
}



export function gzipBytes(bytes: Uint8Array): Uint8Array {
  return gzipSync(bytes);
}

export function gunzipToText(bytes: Uint8Array): string {
  try {
    return strFromU8(gunzipSync(bytes));
  } catch {
    throw new Error("Could not decompress this .gz file.");
  }
}

function hasPrefix(bytes: Uint8Array, prefix: number[]): boolean {
  if (bytes.length < prefix.length) return false;
  return prefix.every((b, i) => bytes[i] === b);
}

function asciiAt(bytes: Uint8Array, offset: number, text: string): boolean {
  if (bytes.length < offset + text.length) return false;
  for (let i = 0; i < text.length; i++) {
    if (bytes[offset + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

function isZip(bytes: Uint8Array): boolean {
  return hasPrefix(bytes, [0x50, 0x4b, 0x03, 0x04]) || hasPrefix(bytes, [0x50, 0x4b, 0x05, 0x06]);
}

function isTar(bytes: Uint8Array): boolean {
  return asciiAt(bytes, 257, "ustar");
}

/** Decompresses a .gz that contains a ZIP and returns the inner ZIP bytes. */
export function gunzipAsZip(bytes: Uint8Array): Uint8Array {
  const inner = gunzipSync(bytes);
  if (!isZip(inner)) throw new Error("This .gz file doesn't contain a ZIP archive inside.");
  return inner;
}

/** Decompresses a .gz that contains a TAR and returns the inner TAR bytes. */
export function gunzipAsTar(bytes: Uint8Array): Uint8Array {
  const inner = gunzipSync(bytes);
  if (!isTar(inner)) throw new Error("This .gz file doesn't contain a TAR archive inside.");
  return inner;
}
