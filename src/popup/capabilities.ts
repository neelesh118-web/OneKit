import type { KvStorage } from "../core/storage-utils";
import type { TabLike } from "../core/tab-tools";

/**
 * Browser capabilities injected into every popup controller. Controllers
 * never call browser.* directly — tests inject fakes.
 */
export interface OneKitCapabilities {
  storage: KvStorage;
  now(): number;
  /** Copies text to the clipboard (clipboardWrite permission). */
  copyText(text: string): Promise<void>;
  /** All open tabs (url/title/index/windowId). */
  queryTabs(): Promise<TabLike[]>;
  closeTabs(ids: number[]): Promise<void>;
  activateTab(id: number): Promise<void>;
  /** PNG data URL of the visible tab. */
  captureVisibleTab(): Promise<string>;
  /** Saves a data URL as a file. */
  downloadDataUrl(dataUrl: string, filename: string): void;
  openUrl(url: string): Promise<void>;
  /** Active tab in the current window (for the scam check). */
  getActiveTab(): Promise<TabLike>;
  /** Sends a message to a tab's content script (scam check reads page meta). */
  sendMessage(tabId: number, message: unknown): Promise<unknown>;
  /** Suspends (discards) the given tabs to free memory. */
  discardTabs(ids: number[]): Promise<void>;
  /** Builds a data URL for a PNG (used by the QR tool). */
  makeQr(text: string): { dataUrl: string; sizePx: number; modules: number };
  /** Downloads a text file (chat export, etc.). */
  downloadText(text: string, filename: string): void;
  /** Groups open tabs by site (background applies chrome.tabs.group). */
  groupTabs(): Promise<{ grouped: number }>;
  /** Asks the active tab's content script to scroll-capture the full page. */
  captureFullPage(): Promise<void>;
  /** The full bookmarks tree (browser.bookmarks.getTree). */
  getBookmarks(): Promise<BookmarkNodeLike[]>;
  /** Removes bookmarks by id (browser.bookmarks.remove). */
  removeBookmarks(ids: string[]): Promise<void>;
  /** Saves raw bytes as a file (PDF merge/split results). */
  downloadBytes(bytes: Uint8Array, filename: string): void;
  /** Saves raw bytes as a file with an explicit MIME type (converter output). */
  saveFile(bytes: Uint8Array, filename: string, mime: string): void;
  /** All cookies for a URL (browser.cookies.getAll). */
  getCookies(url: string): Promise<CookieLike[]>;
  /** Sets a cookie (browser.cookies.set). Returns the cookie or null. */
  setCookie(details: {
    url: string;
    name: string;
    value: string;
    domain: string;
    path: string;
  }): Promise<CookieLike | null>;
  /** Removes a cookie (browser.cookies.remove). */
  removeCookie(url: string, name: string): Promise<void>;
  /** Clears all storage + cookies for an origin (browsingData). */
  clearSiteData(origin: string): Promise<void>;
  /** Asks the active tab to open the EyeDropper and pick a color. */
  pickColor(): Promise<{ color?: string; error?: string }>;
  /** Asks the active tab to collect + download its images. Returns saved count. */
  downloadPageImages(): Promise<number>;
}

import type { CookieLike } from "../core/cookie-manager";

import type { BookmarkNodeLike } from "../core/bookmark-cleaner";
