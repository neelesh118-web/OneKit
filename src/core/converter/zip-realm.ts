/**
 * Zip-entry bytes always created in fflate's own module realm.
 *
 * fflate's zipSync checks `val instanceof u8` (its module-scope Uint8Array)
 * to tell a file's bytes apart from a nested-directory object. Under vitest's
 * threads + jsdom pool, Uint8Arrays created by the environment's TextEncoder
 * (including fflate's own strToU8, which encodes via TextEncoder) live in a
 * different realm and fail that check, so fflate recursed into the bytes as
 * if they were a filesystem and emitted hundreds of garbage entries
 * ("a.txt/0/", "a.txt/1/", …). Tests that only asserted `keys.length > 1`
 * passed on that garbage.
 *
 * These helpers always return arrays built with fflate's own `u8`
 * constructor (captured from the latin1 path of strToU8, which allocates
 * with `new u8(...)`), so zips produced under the test runner are
 * byte-identical to ones produced in the browser.
 */
import { strToU8 } from "fflate/browser";

const u8Ctor = strToU8("", true).constructor as typeof Uint8Array;

/** UTF-8 text → a Uint8Array in fflate's realm. */
export function zipText(text: string): Uint8Array {
  const raw = new TextEncoder().encode(text);
  const out = new u8Ctor(raw.length);
  out.set(raw);
  return out;
}

/** Copies arbitrary bytes (any realm) into fflate's realm. */
export function sameRealmU8(bytes: Uint8Array): Uint8Array {
  if (bytes.constructor === u8Ctor) return bytes;
  const out = new u8Ctor(bytes.length);
  out.set(bytes);
  return out;
}
