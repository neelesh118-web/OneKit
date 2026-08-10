/**
 * Meeting link launcher — recent Zoom / Meet / Teams / Webex / Jitsi links
 * in one place, so you never dig through chat history for the join link.
 *
 * When a tab opens a known meeting URL, OneKit records it (title + URL +
 * when). The popup lists recent ones newest-first. All local; nothing is
 * ever fetched. Meeting URLs are recognized by hostname/pattern only.
 */

import type { KvStorage } from "./storage-utils";

export const MEETING_LINKS_KEY = "ok.meetingLinks";
export const MAX_MEETING_LINKS = 40;
export const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // keep ~30 days

export interface MeetingLink {
  url: string;
  title: string;
  at: number;
  /** Normalized provider id (zoom, meet, teams, webex, jitsi, other). */
  provider: string;
}

export interface TabLikeForMeetings {
  url?: string;
  title?: string;
}

export function meetingTabLike(tab: { url?: string | undefined; title?: string | undefined }): TabLikeForMeetings {
  return {
    ...(tab.url ? { url: tab.url } : {}),
    ...(tab.title ? { title: tab.title } : {})
  };
}

const PROVIDER_PATTERNS: Array<[string, RegExp]> = [
  ["zoom", /zoom\.us\/j\/|zoom\.us\/w\/|zoom\.gov\/j\//i],
  ["meet", /meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}/i],
  ["teams", /teams\.microsoft\.com\/l\/meetup-join/i],
  ["webex", /webex\.com\/meet\//i],
  ["jitsi", /meet\.jit\.si\//i],
  ["gotomeeting", /gotomeeting\.com\/join/i],
  ["whereby", /whereby\.com\//i]
];

export function providerFor(url: string): string | null {
  for (const [provider, pattern] of PROVIDER_PATTERNS) {
    if (pattern.test(url)) return provider;
  }
  return null;
}

/** True when a tab URL looks like a joinable meeting link. */
export function isMeetingUrl(url: string): boolean {
  return providerFor(url) !== null;
}

function isMeeting(value: unknown): value is MeetingLink {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return typeof v.url === "string" && typeof v.title === "string" && typeof v.at === "number";
}

async function readLinks(storage: KvStorage): Promise<MeetingLink[]> {
  const raw = await storage.get(MEETING_LINKS_KEY);
  const list = raw[MEETING_LINKS_KEY];
  if (!Array.isArray(list)) return [];
  return list.filter(isMeeting);
}

async function writeLinks(storage: KvStorage, links: MeetingLink[]): Promise<void> {
  await storage.set({ [MEETING_LINKS_KEY]: links });
}

/** Records a meeting tab if it's new (same URL not already saved today). */
export async function recordMeetingTab(
  storage: KvStorage,
  tab: TabLikeForMeetings,
  now: number = Date.now()
): Promise<MeetingLink | null> {
  const url = tab.url ?? "";
  const provider = providerFor(url);
  if (!provider) return null;
  const links = await readLinks(storage);
  const dayStart = now - 12 * 60 * 60 * 1000; // dedupe within 12h
  if (links.some((l) => l.url === url && l.at > dayStart)) return null;
  const entry: MeetingLink = {
    url,
    title: tab.title || provider,
    at: now,
    provider
  };
  const next = [entry, ...links].slice(0, MAX_MEETING_LINKS);
  await writeLinks(storage, next);
  return entry;
}

export async function listMeetingLinks(storage: KvStorage, now: number = Date.now()): Promise<MeetingLink[]> {
  const links = await readLinks(storage);
  const fresh = links.filter((l) => now - l.at <= MAX_AGE_MS);
  return fresh.sort((a, b) => b.at - a.at);
}

export async function clearMeetingLinks(storage: KvStorage): Promise<number> {
  const links = await readLinks(storage);
  if (links.length > 0) await writeLinks(storage, []);
  return links.length;
}

export function localStorageMeetingLinks(): KvStorage {
  return localStorageAreaRef();
}

import { localStorageArea as localStorageAreaRef } from "./storage-utils";
