/**
 * Camera RAW preview extraction. RAW sensor data (CR2/NEF/ARW/DNG/ORF/PEF/
 * RW2/DCR/ERF/3FR/MOS/RAF) needs a vendor demosaic algorithm to turn into a
 * picture — not feasible in pure TS. But every one of these formats embeds
 * a full real JPEG preview (often near full resolution) for the camera's
 * own LCD and for software that can't decode the sensor data — the same
 * preview desktop RAW converters show before you wait for the real develop
 * pass. Extracting that JPEG is a genuine conversion of real bytes into a
 * real, valid image — not a placeholder — so it's honest to expose it as
 * the source photo, then run it through the same image pipeline as any
 * other JPEG.
 *
 * The extraction itself doesn't parse each vendor's IFD layout (CR2, NEF,
 * ARW, DNG, ORF, PEF, RW2, DCR, ERF and 3FR are TIFF/EP-based with the
 * preview tucked in a SubIFD; RAF wraps a completely different container
 * around the same idea) — it scans the raw bytes for JPEG SOI/EOI marker
 * pairs, which is where the preview lives in all of them, and keeps the
 * largest valid stream (the full-size preview beats the thumbnail).
 */

/** Finds every well-formed JPEG stream (SOI…EOI) in a byte buffer. */
function findJpegStreams(bytes: Uint8Array): Uint8Array[] {
  const streams: Uint8Array[] = [];
  let i = 0;
  let noMoreEoi = false;
  while (i < bytes.length - 3) {
    if (bytes[i] === 0xff && bytes[i + 1] === 0xd8 && bytes[i + 2] === 0xff) {
      if (noMoreEoi) break; // one failed scan-to-end proves none remain
      let end = -1;
      for (let j = i + 2; j < bytes.length - 1; j++) {
        if (bytes[j] === 0xff && bytes[j + 1] === 0xd9) {
          end = j + 2;
          break;
        }
      }
      if (end > 0) {
        streams.push(bytes.subarray(i, end));
        i = end;
        continue;
      }
      noMoreEoi = true;
    }
    i++;
  }
  return streams;
}

/**
 * Extracts the largest embedded JPEG preview from a camera RAW file.
 * Throws honestly when the file carries no readable preview at all.
 */
export function extractRawPreviewJpeg(bytes: Uint8Array): Uint8Array {
  const streams = findJpegStreams(bytes);
  if (streams.length === 0) {
    throw new Error(
      "No embedded preview photo was found in this RAW file. This converter reads the camera's own JPEG preview — it can't decode raw sensor data."
    );
  }
  streams.sort((a, b) => b.length - a.length);
  // Copy out of the source buffer: some consumers (pdf-lib's JPEG embedder
  // among them) read `.buffer` directly and ignore a subarray's byteOffset,
  // which would silently pull bytes from the wrong place in the RAW file.
  return streams[0]!.slice();
}
