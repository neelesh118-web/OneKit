/**
 * Convert-and-zip — converts a batch of files to one target format and
 * bundles the results into a single ZIP. Per-file failures are collected
 * and reported honestly; the files that did convert still get zipped.
 */
import { convertFile, type ConvertOptions } from "./convert";
import { filesToZip } from "./archives";
import type { BatchFile } from "./batch";
import type { TargetFormat } from "./matrix";

export interface ZipBatchOutcome {
  zip: Uint8Array;
  converted: { source: string; output: string; size: number; originalSize: number }[];
  failed: { source: string; error: string }[];
}

/** Makes an output name unique inside a zip (a.txt → a-1.txt → a-2.txt…). */
export function uniqueName(name: string, used: Set<string>): string {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  let i = 1;
  while (used.has(`${base}-${i}${ext}`)) i++;
  const out = `${base}-${i}${ext}`;
  used.add(out);
  return out;
}

export async function convertBatchToZip(
  files: BatchFile[],
  target: TargetFormat,
  options: ConvertOptions = {}
): Promise<ZipBatchOutcome> {
  if (files.length === 0) throw new Error("No files to convert.");
  const used = new Set<string>();
  const entries: Record<string, Uint8Array> = {};
  const converted: ZipBatchOutcome["converted"] = [];
  const failed: ZipBatchOutcome["failed"] = [];
  for (const file of files) {
    try {
      const result = await convertFile(
        { bytes: file.bytes, name: file.name, ...(file.mime ? { mime: file.mime } : {}) },
        target,
        options
      );
      const name = uniqueName(result.name, used);
      entries[name] = result.bytes;
      converted.push({ source: file.name, output: name, size: result.bytes.length, originalSize: file.bytes.length });
    } catch (err) {
      failed.push({ source: file.name, error: err instanceof Error ? err.message : String(err) });
    }
  }
  if (converted.length === 0) {
    throw new Error("None of the files could be converted — nothing to zip.");
  }
  return { zip: filesToZip(entries), converted, failed };
}
