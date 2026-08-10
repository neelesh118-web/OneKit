import { browser } from "wxt/browser";
import {
  addClipboardEntry,
  localStorageClipboard
} from "../src/core/clipboard-store";
import { findRejectButton } from "../src/core/cookie-reject";
import { createRecognizer, speechRecognitionAvailable } from "../src/core/dictation";
import {
  addHistoryEntry,
  extractPageText,
  localStorageHistory
} from "../src/core/history-store";
import {
  applyExpansion,
  findExpansionAt,
  isExpansionTrigger,
  listSnippets,
  localStorageSnippets
} from "../src/core/snippets";
import { loadSettings, type OneKitSettings } from "../src/core/settings";
import { countWords, countChars, countCharsNoSpaces } from "../src/core/text-utils";
import { cleanLink } from "../src/core/clean-links";
import {
  draftIdentityForKey,
  draftKeyFor,
  fieldLabelFor,
  listDraftsForOrigin,
  saveDraft,
  localStorageDrafts
} from "../src/core/drafts-store";
import {
  findFieldForDraft,
  rangeForCharOffsets,
  textBeforeCaretIn
} from "../src/core/dom-text";
import {
  isMediaElement,
  pauseMedia,
  shouldPauseMedia
} from "../src/core/autoplay-killer";
import {
  findRangeForText,
  listHighlightsForUrl,
  localStorageHighlights,
  saveHighlight
} from "../src/core/highlights-store";
import { computePageRiskMetaFromDocument } from "../src/core/scam-radar";
import { createCommandPalette } from "../src/core/command-palette";
import { localStorageArea } from "../src/core/storage-utils";
import {
  allowHostnameToday,
  pauseFocusUntil,
  shouldBlockNow,
  localStorageFocus
} from "../src/core/focus";
import { createFocusOverlay, type FocusOverlayHandle } from "../src/core/focus-overlay";
import { recordActiveTime, secondsForOriginToday, localStorageScreenTime } from "../src/core/screen-time";
import { budgetForHostname, listBudgets, localStorageBudgets } from "../src/core/budgets";
import { lookupWord, singleWordFromSelection } from "../src/core/dictionary";
import { isSpeaking, speakText, stopSpeaking } from "../src/core/read-aloud";

/**
 * OneKit content script — runs on every page and powers the on-page tools:
 * history indexing, clipboard capture, cookie auto-reject, autoplay killer,
 * text expander, paste cleaner, dictation, and draft saving.
 *
 * Every tool checks its settings flag at action time, and settings changes
 * are picked up live via storage.onChanged — no reload needed.
 */

let settings: OneKitSettings | null = null;

function invalidateSettingsOnChange(): void {
  try {
    browser.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local") return;
      if (changes["ok.settings"]) {
        settings = null; // force reload on next use
      }
    });
  } catch {
    // Storage events unavailable in this environment — settings are read
    // fresh on every use anyway, so behavior stays correct.
  }
}

async function currentSettings(): Promise<OneKitSettings> {
  if (!settings) settings = await loadSettings();
  return settings;
}

/* ------------------------------------------------------------------ */
/* Toast                                                               */
/* ------------------------------------------------------------------ */

function showToast(message: string, kind: "ok" | "info" = "info"): void {
  const existing = document.getElementById("onekit-toast");
  existing?.remove();
  const toast = document.createElement("div");
  toast.id = "onekit-toast";
  toast.textContent = message;
  toast.style.cssText = [
    "position:fixed",
    "right:16px",
    "bottom:16px",
    "z-index:2147483647",
    "background:#1e293b",
    "color:#f8fafc",
    "padding:10px 14px",
    "border-radius:8px",
    "font:13px/1.4 system-ui,sans-serif",
    "box-shadow:0 4px 16px rgba(0,0,0,.35)",
    "max-width:320px",
    "transition:opacity .3s"
  ].join(";");
  if (kind === "ok") toast.style.borderLeft = "4px solid #22c55e";
  document.documentElement.appendChild(toast);
  window.setTimeout(() => {
    toast.style.opacity = "0";
    window.setTimeout(() => toast.remove(), 350);
  }, 2600);
}

/* ------------------------------------------------------------------ */
/* 1. History indexing                                                 */
/* ------------------------------------------------------------------ */

let historyTimer: number | undefined;

function scheduleHistoryIndex(): void {
  if (historyTimer !== undefined) window.clearTimeout(historyTimer);
  historyTimer = window.setTimeout(() => {
    void indexCurrentPage();
  }, 1500);
}

async function indexCurrentPage(): Promise<void> {
  const s = await currentSettings();
  if (!s.tools.historyIndex) return;
  if (!/^https?:$/.test(window.location.protocol)) return;
  // Skip huge pages (e.g. long documents) — indexing cost should stay small.
  const bodyText = document.body?.innerText ?? document.body?.textContent ?? "";
  if (bodyText.length > 200_000) return;

  const description =
    document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content ?? "";
  const raw = `${document.title} ${description} ${bodyText}`;
  const text = extractPageText(raw);
  if (!text) return;
  await addHistoryEntry(localStorageHistory(), window.location.href, document.title, text);
}

function hookSpaNavigation(): void {
  const history = window.history;
  const originalPush = history.pushState.bind(history);
  const originalReplace = history.replaceState.bind(history);
  history.pushState = function (data, unused, url) {
    const result = originalPush(data, unused, url);
    scheduleHistoryIndex();
    return result;
  };
  history.replaceState = function (data, unused, url) {
    const result = originalReplace(data, unused, url);
    scheduleHistoryIndex();
    return result;
  };
  window.addEventListener("popstate", scheduleHistoryIndex);
}

/* ------------------------------------------------------------------ */
/* 2. Clipboard capture                                               */
/* ------------------------------------------------------------------ */

function captureCopy(event: ClipboardEvent): void {
  // IMPORTANT: never preventDefault here — that would cancel the user's own
  // copy. We only observe the selection and store a copy; the browser still
  // performs the copy exactly as the user expects.
  void (async () => {
    const s = await currentSettings();
    if (!s.tools.clipboardHistory) return;
    const text = window.getSelection()?.toString() ?? "";
    if (!text.trim()) return;
    await addClipboardEntry(localStorageClipboard(), text, Date.now(), window.location.origin);
  })().catch(() => {
    // Best-effort: a storage write failure must never break copy.
  });
}

/* ------------------------------------------------------------------ */
/* 3. Cookie banner auto-reject                                       */
/* ------------------------------------------------------------------ */

let cookieScanTimer: number | undefined;
const clickedRejectButtons = new WeakSet<HTMLElement>();

function scheduleCookieScan(delay = 800): void {
  if (cookieScanTimer !== undefined) window.clearTimeout(cookieScanTimer);
  cookieScanTimer = window.setTimeout(() => void runCookieScan(), delay);
}

async function runCookieScan(): Promise<void> {
  const s = await currentSettings();
  if (!s.tools.cookieReject) return;
  const button = findRejectButton(document);
  if (button && !clickedRejectButtons.has(button)) {
    clickedRejectButtons.add(button);
    button.click();
  }
}

/* ------------------------------------------------------------------ */
/* 4. Autoplay killer                                                 */
/* ------------------------------------------------------------------ */

let lastUserGesture = 0;

function markGesture(): void {
  lastUserGesture = Date.now();
}

function onPlay(event: Event): void {
  void (async () => {
    const s = await currentSettings();
    if (!s.tools.autoplayKiller) return;
    const target = event.target;
    if (!isMediaElement(target)) return;
    const hadGesture = Date.now() - lastUserGesture < 1200;
    if (shouldPauseMedia(target, hadGesture)) {
      pauseMedia(target);
      showToast("Autoplay paused by OneKit", "info");
    }
  })().catch(() => {
    // Best-effort.
  });
}

/* ------------------------------------------------------------------ */
/* 5. Text expander                                                   */
/* ------------------------------------------------------------------ */

let snippetCache: Awaited<ReturnType<typeof listSnippets>> | null = null;

async function snippetsForExpansion(): Promise<Awaited<ReturnType<typeof listSnippets>>> {
  if (!snippetCache) snippetCache = await listSnippets(localStorageSnippets());
  return snippetCache;
}

function editableTarget(target: EventTarget | null): HTMLElement | null {
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return target;
  if (target instanceof HTMLElement && target.isContentEditable) return target;
  return null;
}

function onExpanderKeydown(event: KeyboardEvent): void {
  void (async () => {
    const s = await currentSettings();
    if (!s.tools.textExpander) return;
    const key = event.key;
    if (key !== " " && key !== "Enter" && key !== "Tab") return;
    const el = editableTarget(event.target);
    if (!el) return;
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      if (el.selectionStart === null || el.selectionEnd === null) return;
      const beforeCaret = el.value.slice(0, el.selectionStart);
      const snippets = await snippetsForExpansion();
      const match = findExpansionAt(beforeCaret, snippets);
      if (!match) return;
      event.preventDefault();
      // Enter inserts a newline in multiline fields, but nothing in a
      // single-line input (where it would normally submit the form).
      const isMultiline =
        el instanceof HTMLTextAreaElement || el.isContentEditable;
      const trigger =
        key === "Enter" ? (isMultiline ? "\n" : "") : key === "Tab" ? "\t" : key;
      const { text, caret } = applyExpansion(el.value, match, trigger);
      el.value = text;
      el.selectionStart = el.selectionEnd = caret;
      el.dispatchEvent(new Event("input", { bubbles: true }));
    } else if (el instanceof HTMLElement && el.isContentEditable) {
      // Rich editors (Claude, Gmail, WordPress…) keep the text in the DOM.
      const beforeCaret = textBeforeCaretIn(el);
      if (beforeCaret === null) return;
      const snippets = await snippetsForExpansion();
      const match = findExpansionAt(beforeCaret, snippets);
      if (!match) return;
      event.preventDefault();
      const trigger =
        key === "Enter" ? "\n" : key === "Tab" ? "\t" : key;
      const range = rangeForCharOffsets(el, match.start, beforeCaret.length);
      if (!range) return;
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      // Replaces the selected ";alias" and leaves the caret after the
      // inserted text — same behavior as the input/textarea path.
      document.execCommand("insertText", false, match.replacement + trigger);
    }
  })().catch(() => {
    // Best-effort.
  });
}

/* ------------------------------------------------------------------ */
/* 6. Paste cleaner                                                   */
/* ------------------------------------------------------------------ */

function onPaste(event: ClipboardEvent): void {
  void (async () => {
    const s = await currentSettings();
    if (!s.tools.pasteCleaner) return;
    const target = editableTarget(event.target);
    if (!target) return;
    const plain = event.clipboardData?.getData("text/plain");
    if (plain === undefined) return;
    event.preventDefault();
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      const start = target.selectionStart ?? target.value.length;
      const end = target.selectionEnd ?? start;
      target.setRangeText(plain, start, end, "end");
      target.dispatchEvent(new Event("input", { bubbles: true }));
    } else if (target instanceof HTMLElement && target.isContentEditable) {
      document.execCommand("insertText", false, plain);
    }
  })().catch(() => {
    // Best-effort.
  });
}

/* ------------------------------------------------------------------ */
/* 7. Dictation                                                       */
/* ------------------------------------------------------------------ */

let dictationButton: HTMLButtonElement | null = null;
let dictationStatus: HTMLDivElement | null = null;

async function renderDictationButton(): Promise<void> {
  const s = await currentSettings();
  if (!s.tools.dictation || !speechRecognitionAvailable()) return;
  if (dictationButton) return;
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = "🎙";
  button.title = "OneKit dictation — click, then speak into the focused field";
  button.style.cssText = [
    "position:fixed",
    "right:16px",
    "bottom:64px",
    "z-index:2147483646",
    "width:44px",
    "height:44px",
    "border-radius:50%",
    "border:none",
    "background:#4f46e5",
    "color:#fff",
    "font-size:20px",
    "cursor:pointer",
    "box-shadow:0 4px 16px rgba(0,0,0,.3)"
  ].join(";");
  button.addEventListener("click", () => void toggleDictation(button));
  dictationButton = button;
  document.documentElement.appendChild(button);
}

let activeRecognizer: ReturnType<typeof createRecognizer> | null = null;

function dictationField(): HTMLElement | null {
  const active = document.activeElement;
  return active instanceof HTMLElement && (active.isContentEditable || active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement)
    ? active
    : null;
}

function insertDictated(text: string): void {
  const el = dictationField();
  if (!el) {
    showToast("Focus a text field first, then dictate.", "info");
    return;
  }
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const start = el.selectionStart ?? el.value.length;
    el.setRangeText(text, start, el.selectionEnd ?? start, "end");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  } else if (el.isContentEditable) {
    document.execCommand("insertText", false, text);
  }
}

function setDictationStatus(text: string | null): void {
  if (!dictationStatus && text) {
    dictationStatus = document.createElement("div");
    dictationStatus.style.cssText = [
      "position:fixed",
      "right:16px",
      "bottom:112px",
      "z-index:2147483646",
      "background:#0f172a",
      "color:#e2e8f0",
      "padding:8px 12px",
      "border-radius:8px",
      "font:12px/1.4 system-ui,sans-serif",
      "box-shadow:0 4px 16px rgba(0,0,0,.3)",
      "max-width:280px"
    ].join(";");
    document.documentElement.appendChild(dictationStatus);
  }
  if (dictationStatus) dictationStatus.textContent = text ?? "";
  if (!text) {
    dictationStatus?.remove();
    dictationStatus = null;
  }
}

async function toggleDictation(button: HTMLButtonElement): Promise<void> {
  if (activeRecognizer) {
    activeRecognizer.stop();
    return;
  }
  if (!dictationField()) {
    showToast("Click into a text field first, then press 🎙.", "info");
    return;
  }
  // Track how much final text has already been inserted so interim-result
  // events never re-insert the same words.
  let insertedChars = 0;
  const handle = createRecognizer({
    onResult: (finalText, interim) => {
      const tail = interim.trim();
      setDictationStatus(tail ? `${finalText}${tail ? " " + tail : ""}` : null);
      if (finalText.length > insertedChars) {
        insertDictated(finalText.slice(insertedChars));
        insertedChars = finalText.length;
      }
    },
    onEnd: () => {
      activeRecognizer = null;
      button.style.background = "#4f46e5";
      button.textContent = "🎙";
      setDictationStatus(null);
    },
    onError: (message) => {
      activeRecognizer = null;
      button.style.background = "#4f46e5";
      button.textContent = "🎙";
      setDictationStatus(null);
      showToast(message, "info");
    }
  });
  if (!handle) {
    showToast("Dictation is not supported in this browser.", "info");
    return;
  }
  activeRecognizer = handle;
  button.style.background = "#dc2626";
  button.textContent = "⏹";
  handle.start();
}

/* ------------------------------------------------------------------ */
/* 9. Screen-time tracking                                            */
/* ------------------------------------------------------------------ */

const SCREEN_TIME_TICK_MS = 5000;
const SCREEN_TIME_FLUSH_MS = 30000;

let screenPendingSeconds = 0;
let screenTickTimer: number | undefined;
let screenFlushTimer: number | undefined;
let screenOrigin = window.location.origin;

function screenTimeVisible(): boolean {
  return document.visibilityState === "visible" && !document.hidden;
}

async function flushScreenTime(): Promise<void> {
  const seconds = screenPendingSeconds;
  screenPendingSeconds = 0;
  if (seconds <= 0) return;
  const s = await currentSettings();
  if (!s.tools.screenTime) return;
  await recordActiveTime(localStorageScreenTime(), screenOrigin, seconds).catch(() => {
    // Best-effort: a storage failure must never break the page.
  });
}

function onScreenTick(): void {
  void (async () => {
    const s = await currentSettings();
    if (!s.tools.screenTime) return;
    if (screenTimeVisible()) {
      screenPendingSeconds += SCREEN_TIME_TICK_MS / 1000;
    }
  })().catch(() => {
    // Best-effort.
  });
}

function startScreenTimeTracking(): void {
  screenOrigin = window.location.origin;
  screenTickTimer = window.setInterval(onScreenTick, SCREEN_TIME_TICK_MS);
  screenFlushTimer = window.setInterval(() => void flushScreenTime(), SCREEN_TIME_FLUSH_MS);
  document.addEventListener("visibilitychange", () => {
    if (!screenTimeVisible()) void flushScreenTime();
  });
  window.addEventListener("pagehide", () => void flushScreenTime());
}

/* ------------------------------------------------------------------ */
/* 10. Distraction blocker                                            */
/* ------------------------------------------------------------------ */

let focusOverlay: FocusOverlayHandle | null = null;

/**
 * Decides whether the current page should be covered right now: either a
 * scheduled window or a daily budget that today's screen time has reached
 * (budgets only apply while the blocker is on).
 */
async function focusBlockReason(): Promise<"schedule" | "budget" | null> {
  if (!/^https?:$/.test(window.location.protocol)) return null;
  const hostname = window.location.hostname;
  const now = new Date();
  if (await shouldBlockNow(localStorageFocus(), hostname, now)) return "schedule";
  const budgets = await listBudgets(localStorageBudgets());
  const rule = budgetForHostname(budgets, hostname);
  if (!rule) return null;
  const seconds = await secondsForOriginToday(localStorageScreenTime(), window.location.origin, now);
  return seconds >= rule.minutesPerDay * 60 ? "budget" : null;
}

async function updateFocusBlocker(): Promise<void> {
  const s = await currentSettings();
  if (!s.tools.focusBlocker) {
    focusOverlay?.dismiss();
    focusOverlay = null;
    return;
  }
  const reason = await focusBlockReason();
  if (reason && !focusOverlay?.isVisible()) {
    focusOverlay = createFocusOverlay(
      window.location.hostname,
      {
        onPause: () => {
          void pauseFocusUntil(localStorageFocus(), Date.now() + 10 * 60 * 1000);
        },
        onAllowToday: () => {
          void allowHostnameToday(localStorageFocus(), window.location.hostname, new Date());
        }
      },
      { reason }
    );
  } else if (!reason && focusOverlay?.isVisible()) {
    focusOverlay.dismiss();
    focusOverlay = null;
  }
}

function startFocusBlocker(): void {
  void updateFocusBlocker();
  window.setInterval(() => void updateFocusBlocker(), 15_000);
  document.addEventListener("visibilitychange", () => {
    if (screenTimeVisible()) void updateFocusBlocker();
  });
}

/* ------------------------------------------------------------------ */
/* 8. Draft vault                                                     */
/* ------------------------------------------------------------------ */

const draftTimers = new Map<string, number>();

function onDraftInput(event: Event): void {
  void (async () => {
    const s = await currentSettings();
    if (!s.tools.draftVault) return;
    const el = event.target;
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement)) return;
    if (el instanceof HTMLInputElement && el.type === "password") return;
    // Fields with no name AND no id can't be identified or restored — and
    // two unnamed fields on one page would silently overwrite each other's
    // draft under the same "unnamed" key. Skip them entirely.
    if (!el.name?.trim() && !el.id?.trim()) return;
    const key = draftKeyFor(window.location.origin, el.name, el.id);
    const timer = draftTimers.get(key);
    if (timer !== undefined) window.clearTimeout(timer);
    draftTimers.set(
      key,
      window.setTimeout(() => {
        draftTimers.delete(key);
        void saveDraft(
          localStorageDrafts(),
          {
            key,
            origin: window.location.origin,
            fieldLabel: fieldLabelFor(el.name, el.id),
            value: el.value
          },
          Date.now()
        ).catch(() => {
          // Best-effort.
        });
      }, 800)
    );
  })().catch(() => {
    // Best-effort.
  });
}

/* ------------------------------------------------------------------ */
/* Draft restore — fill empty saved fields after a refresh.           */
/* ------------------------------------------------------------------ */

async function restoreDrafts(): Promise<void> {
  const s = await currentSettings();
  if (!s.tools.draftVault) return;
  if (!/^https?:$/.test(window.location.protocol)) return;
  const drafts = await listDraftsForOrigin(localStorageDrafts(), window.location.origin);
  if (drafts.length === 0) return;
  let restored = 0;
  for (const draft of drafts) {
    const identity = draftIdentityForKey(draft.key, draft.origin);
    if (!identity) continue;
    const field = findFieldForDraft(identity);
    if (!field) continue;
    if (
      !(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement)
    ) continue;
    if (field instanceof HTMLInputElement && field.type === "password") continue;
    if (field.value !== "") continue; // never overwrite what the user typed
    field.value = draft.value;
    field.dispatchEvent(new Event("input", { bubbles: true }));
    restored++;
  }
  if (restored > 0) {
    showToast(`OneKit restored ${restored} saved field${restored === 1 ? "" : "s"} from your drafts.`, "ok");
  }
}

/* ------------------------------------------------------------------ */
/* Highlights — wrap a selection, save it, re-apply on revisit        */
/* ------------------------------------------------------------------ */

function wrapRange(range: Range, color: string, highlightId: string): void {
  const mark = document.createElement("mark");
  mark.style.backgroundColor = color;
  mark.style.color = "inherit";
  mark.dataset.onekitHighlight = highlightId;
  try {
    range.surroundContents(mark);
  } catch {
    // surroundContents fails on partially-selected non-text nodes — wrap
    // the extracted fragment instead.
    const fragment = range.extractContents();
    mark.appendChild(fragment);
    range.insertNode(mark);
  }
}

async function highlightCurrentSelection(fallbackText?: string): Promise<void> {
  const selection = window.getSelection();
  let range: Range | null = null;
  let text = "";
  if (selection && selection.rangeCount > 0 && !selection.isCollapsed) {
    range = selection.getRangeAt(0);
    text = selection.toString();
  } else if (fallbackText) {
    text = fallbackText;
    range = findRangeForText(document, fallbackText);
  }
  if (!range || !text.trim()) {
    showToast("Select some text first, then right-click → Highlight selection.", "info");
    return;
  }
  const saved = await saveHighlight(localStorageHighlights(), window.location.href, text);
  if (!saved) {
    showToast("Could not save that highlight.", "info");
    return;
  }
  wrapRange(range, saved.color, saved.id);
  try {
    selection?.removeAllRanges();
  } catch {
    // Ignore.
  }
  showToast("Highlight saved locally ✓", "ok");
}

async function reapplyHighlights(): Promise<void> {
  if (!/^https?:$/.test(window.location.protocol)) return;
  const highlights = await listHighlightsForUrl(localStorageHighlights(), window.location.href);
  if (highlights.length === 0) return;
  for (const highlight of highlights) {
    // Skip ones already applied (e.g. after a re-render).
    if (document.querySelector(`mark[data-onekit-highlight="${CSS.escape(highlight.id)}"]`)) {
      continue;
    }
    const range = findRangeForText(document, highlight.text);
    if (range) wrapRange(range, highlight.color, highlight.id);
  }
}

/* ------------------------------------------------------------------ */
/* Word lookup — double-click a word to see its offline meaning       */
/* ------------------------------------------------------------------ */

let lookupTooltip: HTMLElement | null = null;

function dismissLookupTooltip(): void {
  lookupTooltip?.remove();
  lookupTooltip = null;
}

function showLookupTooltip(entry: { word: string; partOfSpeech: string; definition: string }, x: number, y: number): void {
  dismissLookupTooltip();
  const tooltip = document.createElement("div");
  tooltip.id = "onekit-lookup-tooltip";
  tooltip.style.cssText = [
    "position:fixed",
    `left:${Math.max(8, Math.min(x, window.innerWidth - 280))}px`,
    `top:${Math.max(8, y - 8)}px`,
    "z-index:2147483646",
    "background:#1e293b",
    "color:#f1f5f9",
    "padding:10px 12px",
    "border-radius:8px",
    "font:13px/1.5 system-ui,sans-serif",
    "box-shadow:0 4px 16px rgba(0,0,0,.35)",
    "max-width:280px"
  ].join(";");
  const word = document.createElement("strong");
  word.textContent = entry.word;
  const pos = document.createElement("em");
  pos.textContent = ` (${entry.partOfSpeech})`;
  pos.style.color = "#94a3b8";
  const def = document.createElement("div");
  def.textContent = entry.definition;
  def.style.marginTop = "4px";
  tooltip.append(word, pos, def);
  document.documentElement.appendChild(tooltip);
  lookupTooltip = tooltip;
}

function onLookupDoubleClick(event: MouseEvent): void {
  void (async () => {
    const s = await currentSettings();
    if (!s.tools.wordLookup) return;
    const selection = window.getSelection()?.toString() ?? "";
    const word = singleWordFromSelection(selection);
    if (!word) return;
    const entry = lookupWord(word);
    if (!entry) return;
    event.preventDefault();
    showLookupTooltip(entry, event.clientX, event.clientY);
  })().catch(() => {
    // Best-effort.
  });
}

/* ------------------------------------------------------------------ */
/* Read aloud — right-click a selection or page                       */
/* ------------------------------------------------------------------ */

let readAloudChip: HTMLElement | null = null;

function updateReadAloudChip(): void {
  if (isSpeaking() && !readAloudChip) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.id = "onekit-read-aloud-chip";
    chip.textContent = "⏹ Stop reading";
    chip.title = "Stop OneKit read-aloud";
    chip.style.cssText = [
      "position:fixed",
      "right:16px",
      "bottom:16px",
      "z-index:2147483646",
      "background:#dc2626",
      "color:#fff",
      "border:none",
      "padding:8px 14px",
      "border-radius:8px",
      "font:600 13px/1 system-ui,sans-serif",
      "cursor:pointer",
      "box-shadow:0 4px 16px rgba(0,0,0,.35)"
    ].join(";");
    chip.addEventListener("click", () => {
      stopSpeaking();
      chip.remove();
      readAloudChip = null;
    });
    document.documentElement.appendChild(chip);
    readAloudChip = chip;
  } else if (!isSpeaking() && readAloudChip) {
    readAloudChip.remove();
    readAloudChip = null;
  }
}

function pageReadableText(): string {
  const text = document.body?.innerText ?? document.body?.textContent ?? "";
  // Prefer the main article-ish block when it exists.
  const main = document.querySelector<HTMLElement>("article, main, [role='main']");
  return (main?.innerText ?? text).replace(/\s+/g, " ").trim();
}

/* ------------------------------------------------------------------ */
/* Ctrl+Shift+K unified search palette                               */
/* ------------------------------------------------------------------ */

let palette: ReturnType<typeof createCommandPalette> | null = null;

function ensurePalette(): ReturnType<typeof createCommandPalette> | null {
  if (palette) return palette;
  try {
    palette = createCommandPalette({
      storage: localStorageArea(),
      now: () => Date.now(),
      sendMessage: (message) => browser.runtime.sendMessage(message),
      copyText: (text) => copyToClipboard(text),
      openUrl: (url) =>
        browser.runtime.sendMessage({ type: "ok:open-tab", url }).then(() => undefined),
      activateTab: (tabId) =>
        browser.runtime.sendMessage({ type: "ok:activate-tab", tabId }).then(() => undefined),
      toast: (message) => showToast(message, "ok")
    });
  } catch {
    palette = null;
  }
  return palette;
}

function onPaletteShortcut(event: KeyboardEvent): void {
  void (async () => {
    const s = await currentSettings();
    if (!s.tools.commandPalette) return;
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && (event.key === "K" || event.key === "k")) {
      event.preventDefault();
      event.stopPropagation();
      ensurePalette()?.open();
    }
  })().catch(() => {
    // Best-effort.
  });
}

/* ------------------------------------------------------------------ */
/* Messages from background (right-click actions)                     */
/* ------------------------------------------------------------------ */

browser.runtime.onMessage.addListener(
  (message: unknown, _sender, sendResponse) => {
    const msg = message as { type?: string; url?: string; text?: string };
    if (msg.type === "ok:copy-clean-link" && typeof msg.url === "string") {
    const cleaned = cleanLink(msg.url);
    void copyToClipboard(cleaned).then(() => {
      showToast(`Copied clean link: ${cleaned}`, "ok");
    });
    return;
  }
  if (msg.type === "ok:count-selection") {
    const text = msg.text ?? "";
    if (!text.trim()) {
      showToast("Select some text first, then right-click → Count words.", "info");
      return;
    }
    const stats = `Words: ${countWords(text)} · Characters: ${countChars(text)} · No spaces: ${countCharsNoSpaces(text)}`;
    void copyToClipboard(stats).then(() => {
      showToast(`Selection: ${stats} (copied)`, "ok");
    });
    return;
  }
  if (msg.type === "ok:highlight-selection") {
    void highlightCurrentSelection(msg.text ?? "").catch(() => {
      showToast("Could not highlight that text.", "info");
    });
    return;
  }
  if (msg.type === "ok:page-risk-meta") {
    // Synchronous reply — works on both the polyfill and native API.
    sendResponse(computePageRiskMetaFromDocument(document));
    return;
  }
  if (msg.type === "ok:read-selection") {
    const text = msg.text ?? "";
    if (!text.trim()) {
      showToast("Select some text first, then right-click → Read selection aloud.", "info");
      return;
    }
    if (!speakText(text)) {
      showToast("Speech is not available in this browser.", "info");
      return;
    }
    showToast("Reading aloud — click the red chip to stop.", "info");
    window.setTimeout(updateReadAloudChip, 300);
    return;
  }
  if (msg.type === "ok:read-page") {
    const text = pageReadableText();
    if (!text) {
      showToast("Nothing readable found on this page.", "info");
      return;
    }
    if (!speakText(text)) {
      showToast("Speech is not available in this browser.", "info");
      return;
    }
    showToast("Reading page aloud — click the red chip to stop.", "info");
    window.setTimeout(updateReadAloudChip, 300);
    return;
  }
  }
);

async function copyToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Fallback for pages without clipboard access (older browsers).
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}

/* ------------------------------------------------------------------ */
/* Boot                                                               */
/* ------------------------------------------------------------------ */

function boot(): void {
  invalidateSettingsOnChange();

  // Re-apply saved highlights when revisiting a page.
  void reapplyHighlights().catch(() => {
    // Best-effort.
  });

  // History: index on load + SPA navigation.
  scheduleHistoryIndex();
  hookSpaNavigation();

  // Ctrl+Shift+K unified search palette.
  document.addEventListener("keydown", onPaletteShortcut, true);

  // Word lookup (double-click a word → offline definition).
  document.addEventListener("dblclick", onLookupDoubleClick, true);
  document.addEventListener("click", dismissLookupTooltip, true);
  document.addEventListener("scroll", dismissLookupTooltip, true);

  // Read-aloud chip watcher while speech is running.
  window.setInterval(updateReadAloudChip, 2000);

  // Clipboard capture.
  document.addEventListener("copy", captureCopy, true);
  document.addEventListener("cut", captureCopy, true);

  // Cookie auto-reject: immediate + retries (banners appear late).
  void runCookieScan();
  scheduleCookieScan(1500);
  scheduleCookieScan(4000);
  const cookieObserver = new MutationObserver(() => scheduleCookieScan(600));
  cookieObserver.observe(document.documentElement, { childList: true, subtree: true });

  // Autoplay killer.
  document.addEventListener("pointerdown", markGesture, true);
  document.addEventListener("keydown", markGesture, true);
  document.addEventListener("play", onPlay, true);

  // Text expander.
  document.addEventListener("keydown", onExpanderKeydown, true);

  // Paste cleaner.
  document.addEventListener("paste", onPaste, true);

  // Draft vault: save while typing, and restore empty saved fields a few
  // times (SPA forms render late). Only empty fields are ever filled, so
  // the retries are safe and never clobber user input.
  document.addEventListener("input", onDraftInput, true);
  void restoreDrafts().catch(() => {});
  window.setTimeout(() => void restoreDrafts().catch(() => {}), 1500);
  window.setTimeout(() => void restoreDrafts().catch(() => {}), 4000);

  // Dictation button + distraction blocker — one listener for settings and
  // focus-state changes, so a toggle from the popup applies without reload.
  void renderDictationButton();
  browser.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;
    if (changes["ok.settings"]) {
      dictationButton?.remove();
      dictationButton = null;
      void renderDictationButton();
    }
    if (changes["ok.settings"] || changes["ok.focusRules"] || changes["ok.focusPause"] || changes["ok.focusAllowToday"]) {
      void updateFocusBlocker();
    }
  });

  // Screen-time tracking (local per-site active time).
  if (/^https?:$/.test(window.location.protocol)) {
    startScreenTimeTracking();
  }

  // Distraction blocker — checks now and on every visibility return.
  startFocusBlocker();
}

export default defineContentScript({
  matches: ["<all_urls>"],
  main() {
    boot();
  }
});
