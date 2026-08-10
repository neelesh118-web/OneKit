/**
 * Batch conversion planning — pure logic the Convert tab uses when
 * several files are selected at once. Files whose detected format doesn't
 * match the dominant type are reported honestly as skipped, never
 * silently converted wrong.
 */
import { detectFile, TYPE_LABELS, type FileType } from "./detect";

export interface BatchFile {
  name: string;
  bytes: Uint8Array;
  mime?: string;
}

export interface SkippedFile {
  file: BatchFile;
  reason: string;
}

export interface BatchDecision {
  /** The detected type shared by the files that will be converted. */
  sourceType: FileType;
  convert: BatchFile[];
  skipped: SkippedFile[];
  /** True when every selected file shares the dominant type. */
  allSame: boolean;
}

export function planBatch(files: BatchFile[]): BatchDecision {
  if (files.length === 0) throw new Error("No files selected.");
  const detected = files.map((file) => ({
    file,
    type: detectFile(file.bytes, file.name, file.mime).type
  }));

  const counts = new Map<FileType, number>();
  for (const d of detected) counts.set(d.type, (counts.get(d.type) ?? 0) + 1);

  // The dominant type wins; ties break by first-encountered order.
  let dominant: FileType = "unknown";
  let best = 0;
  for (const [type, n] of counts) {
    if (n > best) {
      dominant = type;
      best = n;
    }
  }

  const convert = detected.filter((d) => d.type === dominant).map((d) => d.file);
  const skipped: SkippedFile[] = detected
    .filter((d) => d.type !== dominant)
    .map((d) => ({
      file: d.file,
      reason:
        d.type === "unknown"
          ? "format couldn't be detected"
          : `detected as ${TYPE_LABELS[d.type]}, not ${TYPE_LABELS[dominant]}`
    }));

  return { sourceType: dominant, convert, skipped, allSame: skipped.length === 0 };
}
