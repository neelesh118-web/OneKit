/** Copies the exact bytes of a typed-array view into a standalone ArrayBuffer. */
export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Honest before/after readout for conversion results — shows both sizes
 * and the percentage saved (or grown, when a conversion is bigger).
 */
export function formatSizeDelta(originalBytes: number, outputBytes: number): string {
  const before = formatBytes(originalBytes);
  const after = formatBytes(outputBytes);
  if (!Number.isFinite(originalBytes) || originalBytes <= 0) return `${before} → ${after}`;
  const ratio = outputBytes / originalBytes;
  if (ratio <= 0.995) return `${before} → ${after} (−${Math.round((1 - ratio) * 100)}%)`;
  if (ratio >= 1.005) return `${before} → ${after} (+${Math.round((ratio - 1) * 100)}%)`;
  return `${before} → ${after} (same size)`;
}
