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
  /** Builds a data URL for a PNG (used by the QR tool). */
  makeQr(text: string): { dataUrl: string; sizePx: number; modules: number };
  /** Downloads a text file (chat export, etc.). */
  downloadText(text: string, filename: string): void;
}
