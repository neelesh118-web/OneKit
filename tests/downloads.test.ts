import { describe, expect, it } from "vitest";
import {
  addDownloadEntry,
  classifyDownload,
  clearDownloadHistory,
  dedupeName,
  extensionOf,
  listDownloadHistory,
  routedFilename
} from "../src/core/downloads";
import { createMemoryStorage } from "../src/core/storage-utils";

const storage = () => createMemoryStorage();

describe("downloads", () => {
  it("classifies by extension", () => {
    expect(classifyDownload("photo.PNG")).toBe("Images");
    expect(classifyDownload("report.pdf")).toBe("Documents");
    expect(classifyDownload("song.mp3")).toBe("Audio");
    expect(classifyDownload("movie.mp4")).toBe("Video");
    expect(classifyDownload("backup.zip")).toBe("Archives");
    expect(classifyDownload("app.js")).toBe("Code");
    expect(classifyDownload("font.woff2")).toBe("Fonts");
    expect(classifyDownload("mystery.xyz")).toBe("Other");
    expect(classifyDownload("noext")).toBe("Other");
  });

  it("falls back to the URL when the filename has no extension", () => {
    expect(classifyDownload("download", "https://cdn.example.com/file.pdf")).toBe("Documents");
  });

  it("extracts lower-case extensions safely", () => {
    expect(extensionOf("a/b/c.PDF")).toBe("pdf");
    expect(extensionOf("archive.tar.gz")).toBe("gz");
    expect(extensionOf("noext")).toBe("");
    expect(extensionOf(".hidden")).toBe("");
  });

  it("dedupes names against existing ones", () => {
    const used = new Set(["photo.png", "photo (1).png"]);
    expect(dedupeName("photo.png", used)).toBe("photo (2).png");
    expect(dedupeName("fresh.png", used)).toBe("fresh.png");
  });

  it("routes into folders, keeping Other flat", () => {
    expect(routedFilename("photo.png", "", new Set())).toBe("Images/photo.png");
    expect(routedFilename("x.pdf", "", new Set())).toBe("Documents/x.pdf");
    expect(routedFilename("weird.zzz", "", new Set())).toBe("weird.zzz");
  });

  it("records and lists history, capped and clearable", async () => {
    const s = storage();
    await addDownloadEntry(s, { filename: "a.pdf", url: "https://x.com/a.pdf", category: "Documents", ts: 1 });
    await addDownloadEntry(s, { filename: "b.png", url: "https://x.com/b.png", category: "Images", ts: 2 });
    const list = await listDownloadHistory(s);
    expect(list).toHaveLength(2);
    expect(list[0]?.filename).toBe("b.png"); // newest first
    await clearDownloadHistory(s);
    expect(await listDownloadHistory(s)).toHaveLength(0);
  });
});
