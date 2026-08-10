import { describe, expect, it } from "vitest";
import { createMemoryStorage } from "../src/core/storage-utils";
import {
  clearMeetingLinks,
  isMeetingUrl,
  listMeetingLinks,
  MAX_MEETING_LINKS,
  providerFor,
  recordMeetingTab
} from "../src/core/meeting-links";

describe("meeting links", () => {
  it("recognizes meeting URLs by provider", () => {
    expect(providerFor("https://zoom.us/j/123456789")).toBe("zoom");
    expect(providerFor("https://meet.google.com/abc-defg-hij")).toBe("meet");
    expect(providerFor("https://teams.microsoft.com/l/meetup-join/19%3ameeting")).toBe("teams");
    expect(providerFor("https://example.com/article")).toBeNull();
    expect(isMeetingUrl("https://zoom.us/j/1")).toBe(true);
  });

  const NOW = 1_800_000_000_000; // a fixed "today" so MAX_AGE never filters entries

  it("records and lists meeting tabs newest-first", async () => {
    const storage = createMemoryStorage();
    await recordMeetingTab(storage, { url: "https://zoom.us/j/111", title: "Team sync" }, NOW);
    await recordMeetingTab(storage, { url: "https://meet.google.com/abc-defg-hij", title: "Client call" }, NOW + 1000);

    const links = await listMeetingLinks(storage, NOW + 2000);
    expect(links).toHaveLength(2);
    expect(links[0]!.url).toContain("meet.google.com");
    expect(links[0]!.provider).toBe("meet");
  });

  it("dedupes the same meeting within 12h", async () => {
    const storage = createMemoryStorage();
    await recordMeetingTab(storage, { url: "https://zoom.us/j/222", title: "A" }, NOW);
    await recordMeetingTab(storage, { url: "https://zoom.us/j/222", title: "A" }, NOW + 1000);
    expect(await listMeetingLinks(storage, NOW + 2000)).toHaveLength(1);
  });

  it("ignores non-meeting tabs", async () => {
    const storage = createMemoryStorage();
    const entry = await recordMeetingTab(storage, { url: "https://example.com/", title: "X" }, NOW);
    expect(entry).toBeNull();
    expect(await listMeetingLinks(storage, NOW)).toHaveLength(0);
  });

  it("caps the list and clears", async () => {
    const storage = createMemoryStorage();
    for (let i = 0; i < MAX_MEETING_LINKS + 5; i++) {
      await recordMeetingTab(storage, { url: `https://zoom.us/j/${i}`, title: `M${i}` }, NOW + i);
    }
    expect(await listMeetingLinks(storage, NOW + 1000)).toHaveLength(MAX_MEETING_LINKS);
    expect(await clearMeetingLinks(storage)).toBe(MAX_MEETING_LINKS);
  });
});
