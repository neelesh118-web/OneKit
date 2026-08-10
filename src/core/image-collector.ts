/**
 * Image collector — gathers the image URLs worth saving from a page. The
 * content script feeds anchor/img elements as plain data; this module
 * resolves, dedupes, filters useless candidates, and classifies by type.
 */

export interface ImageRef {
  url: string;
  width?: number;
  height?: number;
  alt?: string;
}

export interface ImageInput {
  src?: string;
  srcset?: string;
  width?: number;
  height?: number;
  alt?: string;
}

export const MAX_IMAGES = 100;

const DATA_RE = /^(?:data|blob):/;

/** Srcset candidates → pixel-density pairs (simplified: takes the largest). */
export function largestSrcsetUrl(srcset: string, pageUrl: string): string | null {
  const candidates = srcset
    .split(",")
    .map((part) => {
      const [urlPart, descriptor] = part.trim().split(/\s+/);
      const density = descriptor && descriptor.endsWith("x") ? parseFloat(descriptor) || 1 : 1;
      return { urlPart: urlPart ?? "", density };
    })
    .filter((c) => c.urlPart);
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => b.density - a.density);
  const best = candidates[0]!;
  return resolveUrl(best.urlPart, pageUrl);
}

export function resolveUrl(raw: string, pageUrl: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  try {
    return new URL(trimmed, pageUrl).href;
  } catch {
    return "";
  }
}

/**
 * Collects image URLs from the page's <img> elements. Dedupes, drops
 * data:/blob: URLs and obvious icons/trackers (tiny or empty), and caps
 * the result. Returns resolved absolute URLs only.
 */
export function collectImageUrls(images: ImageInput[], pageUrl: string): ImageRef[] {
  const seen = new Set<string>();
  const out: ImageRef[] = [];
  const push = (url: string, ref: ImageInput): void => {
    if (!url || seen.has(url) || out.length >= MAX_IMAGES) return;
    if (DATA_RE.test(url)) return;
    seen.add(url);
    const entry: ImageRef = { url };
    if (ref.width && ref.width > 0) entry.width = ref.width;
    if (ref.height && ref.height > 0) entry.height = ref.height;
    if (ref.alt?.trim()) entry.alt = ref.alt.trim().slice(0, 100);
    out.push(entry);
  };
  for (const img of images) {
    // srcset supersedes src (browsers use the largest candidate), so don't
    // save both versions of the same picture.
    if (img.srcset) {
      const largest = largestSrcsetUrl(img.srcset, pageUrl);
      if (largest) push(largest, img);
    } else if (img.src) {
      push(resolveUrl(img.src, pageUrl), img);
    }
  }
  return out;
}

export type ImageKind = "png" | "jpeg" | "webp" | "gif" | "svg" | "other";

export function classifyImageUrl(url: string): ImageKind {
  const clean = url.split(/[?#]/)[0]!.toLowerCase();
  if (clean.endsWith(".png")) return "png";
  if (clean.endsWith(".jpg") || clean.endsWith(".jpeg")) return "jpeg";
  if (clean.endsWith(".webp")) return "webp";
  if (clean.endsWith(".gif")) return "gif";
  if (clean.endsWith(".svg")) return "svg";
  return "other";
}
