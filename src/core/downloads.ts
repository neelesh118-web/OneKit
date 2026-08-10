import { localStorageArea, type KvStorage } from "./storage-utils";

/**
 * Download organizer — classifies downloads by type, routes them into
 * folders, dedupes names, and keeps a local history. Everything is local;
 * the only browser power used is the downloads API, never the network.
 */

export const DOWNLOAD_HISTORY_KEY = "ok.downloads";
export const MAX_DOWNLOAD_HISTORY = 200;

export type DownloadCategory =
  | "Images"
  | "Documents"
  | "Audio"
  | "Video"
  | "Archives"
  | "Code"
  | "Fonts"
  | "Other";

export const DOWNLOAD_CATEGORIES: DownloadCategory[] = [
  "Images",
  "Documents",
  "Audio",
  "Video",
  "Archives",
  "Code",
  "Fonts",
  "Other"
];

const CATEGORY_EXTENSIONS: Record<DownloadCategory, string[]> = {
  Images: ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "ico", "avif"],
  Documents: ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "rtf", "odt", "csv", "epub"],
  Audio: ["mp3", "wav", "ogg", "flac", "m4a", "aac", "opus"],
  Video: ["mp4", "mkv", "webm", "mov", "avi", "m4v"],
  Archives: ["zip", "rar", "7z", "tar", "gz", "bz2", "xz", "tgz"],
  Code: ["js", "ts", "py", "rb", "go", "rs", "java", "c", "cpp", "h", "json", "xml", "yaml", "yml", "sh", "sql", "html", "css"],
  Fonts: ["ttf", "otf", "woff", "woff2", "eot"],
  Other: []
};

export function extensionOf(filename: string): string {
  const base = filename.split("/").pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot <= 0 || dot === base.length - 1) return "";
  return base.slice(dot + 1).toLowerCase();
}

/** Classifies a download by its filename (falls back to the URL path). */
export function classifyDownload(filename: string, url: string = ""): DownloadCategory {
  const ext = extensionOf(filename) || extensionOf(decodeURIComponent(url.split("?")[0] ?? ""));
  for (const category of DOWNLOAD_CATEGORIES) {
    if (category === "Other") continue;
    if (CATEGORY_EXTENSIONS[category].includes(ext)) return category;
  }
  return "Other";
}

/** "photo.png" → "photo (1).png", skipping names already in use. */
export function dedupeName(filename: string, existingNames: Set<string>): string {
  if (!existingNames.has(filename)) return filename;
  const base = filename.split("/").pop() ?? filename;
  const dot = base.lastIndexOf(".");
  const stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot) : "";
  let n = 1;
  while (existingNames.has(`${stem} (${n})${ext}`)) n++;
  return `${stem} (${n})${ext}`;
}

/** Builds the routed filename for a download ("Images/photo (1).png"). */
export function routedFilename(
  filename: string,
  url: string,
  existingNames: Set<string>
): string {
  const category = classifyDownload(filename, url);
  const name = dedupeName(filename, existingNames);
  return category === "Other" ? name : `${category}/${name}`;
}

export interface DownloadHistoryEntry {
  id: string;
  filename: string;
  url: string;
  category: DownloadCategory;
  ts: number;
}

function isEntry(value: unknown): value is DownloadHistoryEntry {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.filename === "string" &&
    typeof v.url === "string" &&
    typeof v.ts === "number"
  );
}

async function readHistory(storage: KvStorage): Promise<DownloadHistoryEntry[]> {
  const raw = await storage.get(DOWNLOAD_HISTORY_KEY);
  const list = raw[DOWNLOAD_HISTORY_KEY];
  if (!Array.isArray(list)) return [];
  return list.filter(isEntry);
}

async function writeHistory(storage: KvStorage, entries: DownloadHistoryEntry[]): Promise<void> {
  await storage.set({ [DOWNLOAD_HISTORY_KEY]: entries });
}

/** Records a download in local history (capped). */
export async function addDownloadEntry(
  storage: KvStorage,
  entry: Omit<DownloadHistoryEntry, "id">,
  now: number = Date.now()
): Promise<void> {
  const id = `dl-${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const entries = await readHistory(storage);
  entries.unshift({ ...entry, id });
  await writeHistory(storage, entries.slice(0, MAX_DOWNLOAD_HISTORY));
}

export async function listDownloadHistory(storage: KvStorage): Promise<DownloadHistoryEntry[]> {
  const entries = await readHistory(storage);
  return entries.sort((a, b) => b.ts - a.ts);
}

export async function clearDownloadHistory(storage: KvStorage): Promise<void> {
  await storage.remove(DOWNLOAD_HISTORY_KEY);
}

export function localStorageDownloads(): KvStorage {
  return localStorageArea();
}
