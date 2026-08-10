/**
 * Text encodings — Base64 (unicode-safe), hex, and URL encoding.
 * Pure functions, fully local, fully testable.
 */

export function textToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}

export type TextResult = { ok: true; value: string } | { ok: false; error: string };

export function base64ToText(b64: string): TextResult {
  const cleaned = b64.trim();
  if (!cleaned) return { ok: false, error: "Nothing to decode." };
  try {
    const bin = atob(cleaned);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { ok: true, value: new TextDecoder().decode(bytes) };
  } catch {
    return { ok: false, error: "Not valid Base64." };
  }
}

export function textToHex(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

export function hexToText(hex: string): TextResult {
  const cleaned = hex.trim().toLowerCase();
  if (cleaned.length % 2 !== 0 || !/^[0-9a-f]*$/.test(cleaned)) {
    return { ok: false, error: "Not valid hex — expected an even number of 0-9a-f characters." };
  }
  const bytes = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(cleaned.slice(i * 2, i * 2 + 2), 16);
  }
  return { ok: true, value: new TextDecoder().decode(bytes) };
}

export function textToUrl(text: string): string {
  return encodeURIComponent(text);
}

export function urlToText(url: string): TextResult {
  try {
    return { ok: true, value: decodeURIComponent(url.trim()) };
  } catch {
    return { ok: false, error: "Not valid percent-encoded text." };
  }
}
