// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildReport, findDuplicates, findOld, removableIds } from "../src/core/downloads-cleaner";
import type { DownloadHistoryEntry } from "../src/core/downloads";

const NOW = 1_800_000_000_000;
const DAY = 86_400_000;

function entry(id: string, filename: string, ts: number): DownloadHistoryEntry {
  return { id, filename, url: "", category: "Documents", ts };
}

const history: DownloadHistoryEntry[] = [
  entry("a", "report.pdf", NOW - 200 * DAY), // old
  entry("b", "report.pdf", NOW - DAY),       // duplicate (newer)
  entry("c", "photo.png", NOW - 10 * DAY),
  entry("d", "notes.txt", NOW - 2 * DAY)
];

describe("findDuplicates", () => {
  it("groups repeated filenames", () => {
    const groups = findDuplicates(history);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.filename).toBe("report.pdf");
    expect(groups[0]!.entries).toHaveLength(2);
  });
});

describe("findOld", () => {
  it("finds entries older than the cutoff", () => {
    const old = findOld(history, NOW, 90);
    expect(old.map((e) => e.id)).toEqual(["a"]);
  });
});

describe("buildReport + removableIds", () => {
  it("keeps the newest duplicate and removes old entries", () => {
    const report = buildReport(history, NOW, 90);
    const ids = removableIds(report);
    // Duplicate: keep "b" (newer), remove "a"; old: "a" is already counted.
    expect(ids).toContain("a");
    expect(ids).not.toContain("b");
    expect(ids).not.toContain("c");
    expect(ids).not.toContain("d");
  });
  it("reports duplicate counts honestly", () => {
    const report = buildReport(history, NOW, 90);
    expect(report.duplicates[0]!.entries.length).toBe(2);
    expect(report.oldEntries).toHaveLength(1);
  });
});
