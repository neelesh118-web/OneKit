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
import { replaceAllMatches, replaceSummary } from "../src/core/find-replace";
import { fillTargets, findCredentialFields } from "../src/core/vault-fill";
import { readingMetrics } from "../src/core/readability";
import { cleanLink } from "../src/core/clean-links";
import {
  applySpeedToVideo,
  clearSiteSpeed,
  getSiteSpeed,
  nextSpeed,
  normalizeHost,
  setSiteSpeed,
  speedLabel
} from "../src/core/video-speed";
import { canUseDocumentPip, canUseNativePip, pickVideoForPip } from "../src/core/video-pip";
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
import {
  hasCardData,
  isFieldEmpty,
  matchField,
  readContactCard,
  localStorageContactCard
} from "../src/core/autofill";
import {
  endFocusSession,
  focusSessionRemainingMs,
  formatRemaining,
  sessionBlocksHostname,
  localStorageFocusSession
} from "../src/core/focus-session";
import {
  DARK_MODE_CSS,
  shouldApplyDarkMode,
  localStorageDarkMode
} from "../src/core/dark-mode";
import { saveArchiveItem, localStorageArchive } from "../src/core/web-archive";
import { planCaptureFrames } from "../src/core/fullpage-screenshot";
import {
  addWebNote,
  listNotesForOrigin,
  removeWebNote,
  updateWebNote,
  localStorageWebNotes
} from "../src/core/web-notes";
import {
  pathLength,
  recognizeGesture,
  type GestureId,
  type Point
} from "../src/core/mouse-gestures";
import {
  isArticleLike,
  progressPercent,
  readProgress,
  saveProgress,
  localStorageReadingProgress
} from "../src/core/reading-progress";
import {
  extractLinks,
  linkToMarkdown,
  linksToMarkdown,
  selectionToMarkdown
} from "../src/core/markdown";
import { collectImageUrls, type ImageRef } from "../src/core/image-collector";
import {
  localStoragePomodoro,
  readPomodoro,
  POMODORO_STORAGE_KEY
} from "../src/core/pomodoro";
import { cssForHostname, hostnameOf, localStorageCustomCss } from "../src/core/custom-css";
import { autoRefreshFor, clearAutoRefresh, localStorageAutoRefresh, setAutoRefresh } from "../src/core/auto-refresh";
import { measureElementAt, type RulerBox } from "../src/core/page-ruler";
import { classifyField, fakePerson, valueForKind } from "../src/core/fake-filler";
import { tableToCsv } from "../src/core/table-csv";
import { addVideoNote, listVideoNotes, removeVideoNote, localStorageVideoNotes } from "../src/core/video-notes";
import { normalizeWpm, planReading, readerTextFromDocument } from "../src/core/speed-reader";
import { summarizeText, summaryStats } from "../src/core/summarizer";
import { extractToc, tocIndent, tocStats, tocToMarkdown } from "../src/core/page-toc";

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
/**
 * Decides whether the current page should be covered right now. Priority:
 * active focus session > scheduled window > daily budget. A focus session
 * blocks even when the per-site blocker toggle is off (it's a deliberate,
 * temporary, global block).
 */
async function focusBlockReason(): Promise<"session" | "schedule" | "budget" | null> {
  if (!/^https?:$/.test(window.location.protocol)) return null;
  const hostname = window.location.hostname;
  if (await sessionBlocksHostname(localStorageFocusSession(), hostname, Date.now())) return "session";
  const s = await currentSettings();
  if (!s.tools.focusBlocker) return null;
  const now = new Date();
  if (await shouldBlockNow(localStorageFocus(), hostname, now)) return "schedule";
  const budgets = await listBudgets(localStorageBudgets());
  const rule = budgetForHostname(budgets, hostname);
  if (!rule) return null;
  const seconds = await secondsForOriginToday(localStorageScreenTime(), window.location.origin, now);
  return seconds >= rule.minutesPerDay * 60 ? "budget" : null;
}

let sessionCountdownTimer: number | undefined;

async function updateFocusBlocker(): Promise<void> {
  const s = await currentSettings();
  const reason = await focusBlockReason();
  if (reason && !focusOverlay?.isVisible()) {
    if (reason === "session") {
      const remaining = await focusSessionRemainingMs(localStorageFocusSession());
      focusOverlay = createFocusOverlay(
        window.location.hostname,
        {
          onPause: () => undefined,
          onAllowToday: () => undefined
        },
        {
          reason: "session",
          sessionNote: `Session ends in ${formatRemaining(remaining)}`,
          onEndSession: () => {
            void endFocusSession(localStorageFocusSession());
          }
        }
      );
      if (sessionCountdownTimer === undefined) {
        sessionCountdownTimer = window.setInterval(() => {
          void (async () => {
            if (!focusOverlay?.isVisible()) {
              if (sessionCountdownTimer !== undefined) {
                window.clearInterval(sessionCountdownTimer);
                sessionCountdownTimer = undefined;
              }
              return;
            }
            const ms = await focusSessionRemainingMs(localStorageFocusSession());
            focusOverlay.setNote(ms > 0 ? `Session ends in ${formatRemaining(ms)}` : "Session ended — this site is free again.");
          })();
        }, 1000);
      }
    } else if (reason === "schedule" || reason === "budget") {
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
    }
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
/* Autofill — a small fill chip on focused form fields                */
/* ------------------------------------------------------------------ */

let autofillChip: HTMLElement | null = null;

function dismissAutofillChip(): void {
  autofillChip?.remove();
  autofillChip = null;
}

function onFieldFocus(event: FocusEvent): void {
  void (async () => {
    dismissAutofillChip();
    const s = await currentSettings();
    if (!s.tools.autofill) return;
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) return;
    if (target instanceof HTMLInputElement && target.type === "password") return;
    const card = await readContactCard(localStorageContactCard());
    if (!hasCardData(card)) return;
    const field = matchField(target);
    if (!field) return;
    if (!isFieldEmpty(target)) return;

    const chip = document.createElement("button");
    chip.type = "button";
    chip.textContent = "🔑 Fill";
    chip.title = `OneKit autofill — fill this field with your ${field}`;
    chip.style.cssText = [
      "position:fixed",
      "z-index:2147483646",
      "background:#4f46e5",
      "color:#fff",
      "border:none",
      "padding:6px 10px",
      "border-radius:6px",
      "font:600 12px/1 system-ui,sans-serif",
      "cursor:pointer",
      "box-shadow:0 4px 12px rgba(0,0,0,.3)"
    ].join(";");
    chip.addEventListener("click", () => {
      const value = card[field];
      if (!value) return;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        target.value = value;
        target.dispatchEvent(new Event("input", { bubbles: true }));
      } else if (target instanceof HTMLSelectElement) {
        const option = [...target.options].find((o) => o.text.toLowerCase().includes(value.toLowerCase()));
        if (option) {
          target.value = option.value;
          target.dispatchEvent(new Event("change", { bubbles: true }));
        }
      }
      dismissAutofillChip();
      showToast("Filled from your contact card ✓", "ok");
    });
    const rect = target.getBoundingClientRect();
    chip.style.left = `${Math.max(4, Math.min(rect.right - 60, window.innerWidth - 70))}px`;
    chip.style.top = `${Math.max(4, rect.top - 34)}px`;
    document.documentElement.appendChild(chip);
    autofillChip = chip;
  })().catch(() => {
    // Best-effort.
  });
}

/* ------------------------------------------------------------------ */
/* Dark mode — per-site CSS filter                                    */
/* ------------------------------------------------------------------ */

async function applyDarkMode(): Promise<void> {
  const apply = await shouldApplyDarkMode(localStorageDarkMode(), window.location.hostname);
  const existing = document.getElementById("onekit-dark-style");
  if (apply && !existing) {
    const style = document.createElement("style");
    style.id = "onekit-dark-style";
    style.textContent = DARK_MODE_CSS;
    document.documentElement.appendChild(style);
  } else if (!apply && existing) {
    existing.remove();
  }
}

/* ------------------------------------------------------------------ */
/* Full-page screenshot — scroll + capture + stitch                   */
/* ------------------------------------------------------------------ */

async function captureFullPage(): Promise<void> {
  const viewportHeight = Math.max(1, window.innerHeight);
  const scrollHeight = Math.max(viewportHeight, document.documentElement.scrollHeight || document.body.scrollHeight || 0);
  const plan = planCaptureFrames(scrollHeight, viewportHeight);
  const frames: string[] = [];
  for (const y of plan.scrollY) {
    window.scrollTo(0, y);
    await new Promise((resolve) => window.setTimeout(resolve, 260)); // let scroll settle
    try {
      const shot = (await browser.runtime.sendMessage({ type: "ok:capture-visible" })) as string | undefined;
      if (shot) frames.push(shot);
    } catch {
      // A capture can fail (e.g. the tab changed) — continue with what we have.
    }
  }
  window.scrollTo(0, 0);
  if (frames.length === 0) {
    showToast("Could not capture the page.", "info");
    return;
  }

  // Stitch the frames into one image (24px overlap removed between frames).
  const first = await loadImage(frames[0]!);
  const overlap = 24;
  const frameH = Math.max(1, viewportHeight - overlap);
  const canvas = document.createElement("canvas");
  canvas.width = first.naturalWidth;
  canvas.height = frames.length * frameH + overlap;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    showToast("Could not stitch the capture.", "info");
    return;
  }
  for (let i = 0; i < frames.length; i++) {
    const img = await loadImage(frames[i]!);
    ctx.drawImage(img, 0, i * frameH, img.naturalWidth, img.naturalHeight);
  }
  const dataUrl = canvas.toDataURL("image/png");
  const filename = `onekit-fullpage-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.png`;
  try {
    await browser.runtime.sendMessage({ type: "ok:download-dataurl", dataUrl, filename });
    showToast(`Saved ${filename} ✓`, "ok");
  } catch {
    showToast("Capture ready — could not save it automatically.", "info");
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = src;
  });
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
/* Speed reader (RSVP) overlay                                       */
/* ------------------------------------------------------------------ */

let speedReaderBox: HTMLElement | null = null;
let speedReaderTimer: number | null = null;
let speedReaderTokens: { word: string; durationMs: number }[] = [];
let speedReaderIndex = 0;
let speedReaderPaused = false;

function stopSpeedReader(): void {
  if (speedReaderTimer !== null) window.clearTimeout(speedReaderTimer);
  speedReaderTimer = null;
  speedReaderTokens = [];
  speedReaderIndex = 0;
  speedReaderPaused = false;
  speedReaderBox?.remove();
  speedReaderBox = null;
}

function speedReaderShowWord(): void {
  const wordEl = speedReaderBox?.querySelector<HTMLElement>(".ok-sr-word");
  const progressEl = speedReaderBox?.querySelector<HTMLElement>(".ok-sr-progress");
  const token = speedReaderTokens[speedReaderIndex];
  if (!wordEl || !progressEl || !token) {
    stopSpeedReader();
    showToast("Speed reading finished.", "ok");
    return;
  }
  wordEl.textContent = token.word;
  progressEl.textContent = `${speedReaderIndex + 1} / ${speedReaderTokens.length}`;
  if (speedReaderPaused) return;
  speedReaderTimer = window.setTimeout(() => {
    speedReaderIndex++;
    speedReaderShowWord();
  }, token.durationMs);
}

function startSpeedReader(wpm: number): void {
  stopSpeedReader();
  const text = readerTextFromDocument(document);
  if (!text) {
    showToast("Nothing readable found on this page.", "info");
    return;
  }
  const plan = planReading(text, normalizeWpm(wpm));
  if (plan.tokens.length === 0) {
    showToast("Nothing readable found on this page.", "info");
    return;
  }
  speedReaderTokens = plan.tokens;
  speedReaderIndex = 0;
  speedReaderPaused = false;

  const box = document.createElement("div");
  box.id = "onekit-speed-reader";
  box.style.cssText = [
    "position:fixed",
    "top:50%",
    "left:50%",
    "transform:translate(-50%,-50%)",
    "z-index:2147483647",
    "background:#111827",
    "color:#f9fafb",
    "border-radius:14px",
    "padding:28px 36px",
    "min-width:320px",
    "max-width:80vw",
    "text-align:center",
    "box-shadow:0 12px 48px rgba(0,0,0,.5)",
    "font:400 32px/1.4 system-ui,sans-serif"
  ].join(";");
  const word = document.createElement("div");
  word.className = "ok-sr-word";
  word.style.minHeight = "44px";
  const progress = document.createElement("div");
  progress.className = "ok-sr-progress";
  progress.style.cssText = "font:400 12px/1 system-ui,sans-serif;opacity:.6;margin-top:10px";
  const controls = document.createElement("div");
  controls.style.cssText = "margin-top:14px;display:flex;gap:8px;justify-content:center";
  const pauseBtn = document.createElement("button");
  pauseBtn.type = "button";
  pauseBtn.textContent = "⏸";
  const stopBtn = document.createElement("button") as HTMLButtonElement;
  stopBtn.type = "button";
  stopBtn.textContent = "✕";
  const wpmInput = document.createElement("input");
  wpmInput.type = "number";
  wpmInput.min = "100";
  wpmInput.max = "900";
  wpmInput.step = "25";
  wpmInput.value = String(normalizeWpm(wpm));
  wpmInput.title = "Words per minute";
  wpmInput.style.cssText = "width:76px;padding:4px 6px;border-radius:6px;border:1px solid #374151;background:#1f2937;color:#f9fafb;font:400 13px/1 system-ui,sans-serif";
  const btnStyle = "border:none;border-radius:8px;padding:6px 12px;background:#374151;color:#f9fafb;font:600 13px/1 system-ui,sans-serif;cursor:pointer";
  pauseBtn.style.cssText = btnStyle;
  stopBtn.style.cssText = btnStyle;
  for (const b of [pauseBtn, stopBtn]) {
    b.addEventListener("click", () => {
      if (b === stopBtn) {
        stopSpeedReader();
      } else {
        speedReaderPaused = !speedReaderPaused;
        pauseBtn.textContent = speedReaderPaused ? "▶" : "⏸";
        if (!speedReaderPaused && speedReaderTimer === null) {
          speedReaderTimer = window.setTimeout(() => {
            speedReaderIndex++;
            speedReaderShowWord();
          }, speedReaderTokens[speedReaderIndex]?.durationMs ?? 300);
        }
      }
    });
  }
  wpmInput.addEventListener("change", () => {
    // Restart pacing at the new speed from the current word.
    speedReaderPaused = false;
    pauseBtn.textContent = "⏸";
    const plan2 = planReading(text, normalizeWpm(Number(wpmInput.value)));
    speedReaderTokens = plan2.tokens.slice(speedReaderIndex) as typeof speedReaderTokens;
    speedReaderIndex = 0;
    if (speedReaderTimer !== null) window.clearTimeout(speedReaderTimer);
    speedReaderTimer = null;
    speedReaderShowWord();
  });
  controls.append(pauseBtn, wpmInput, stopBtn);
  box.append(word, progress, controls);
  document.documentElement.appendChild(box);
  speedReaderBox = box;
  showToast("Speed reading — adjust WPM or ✕ to stop.", "info");
  speedReaderShowWord();
}

/* ------------------------------------------------------------------ */
/* Page table of contents sidebar                                     */
/* ------------------------------------------------------------------ */

let tocBox: HTMLElement | null = null;

function togglePageToc(): { entries: number; open: boolean } {
  if (tocBox) {
    tocBox.remove();
    tocBox = null;
    return { entries: 0, open: false };
  }
  const entries = extractToc(document.body);
  if (entries.length === 0) {
    showToast("No headings found on this page.", "info");
    return { entries: 0, open: false };
  }
  const indents = tocIndent(entries);
  const headings = Array.from(document.querySelectorAll<HTMLElement>("h1, h2, h3, h4"));
  const box = document.createElement("aside");
  box.id = "onekit-page-toc";
  box.style.cssText = [
    "position:fixed",
    "top:72px",
    "right:16px",
    "z-index:2147483646",
    "width:280px",
    "max-height:70vh",
    "overflow-y:auto",
    "background:#111827",
    "color:#f9fafb",
    "border-radius:12px",
    "padding:14px",
    "box-shadow:0 8px 32px rgba(0,0,0,.4)",
    "font:400 13px/1.5 system-ui,sans-serif"
  ].join(";");
  const title = document.createElement("div");
  title.textContent = `📑 On this page (${entries.length})`;
  title.style.cssText = "font-weight:600;margin-bottom:10px";
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.textContent = "✕";
  closeBtn.style.cssText = "position:absolute;top:8px;right:10px;border:none;background:none;color:#9ca3af;font-size:14px;cursor:pointer";
  closeBtn.addEventListener("click", () => {
    tocBox?.remove();
    tocBox = null;
  });
  const list = document.createElement("nav");
  entries.forEach((entry, i) => {
    const link = document.createElement("a");
    link.href = "#";
    link.textContent = entry.text;
    link.title = entry.text;
    link.style.cssText = `display:block;color:#d1d5db;text-decoration:none;padding:3px 0;margin-left:${indents[i]! * 14}px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap`;
    link.addEventListener("click", (ev) => {
      ev.preventDefault();
      headings[entry.index]?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    list.appendChild(link);
  });
  box.append(title, closeBtn, list);
  document.documentElement.appendChild(box);
  tocBox = box;
  return { entries: entries.length, open: true };
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
/* Custom per-site CSS                                                 */
/* ------------------------------------------------------------------ */

async function applyCustomCss(): Promise<void> {
  const s = await currentSettings();
  if (!s.tools.customCss) {
    document.getElementById("onekit-custom-css")?.remove();
    return;
  }
  if (!/^https?:$/.test(window.location.protocol)) return;
  const css = await cssForHostname(localStorageCustomCss(), hostnameOf(window.location.href));
  const existing = document.getElementById("onekit-custom-css");
  if (css && !existing) {
    const style = document.createElement("style");
    style.id = "onekit-custom-css";
    style.textContent = css;
    document.documentElement.appendChild(style);
  } else if (!css && existing) {
    existing.remove();
  }
}

/* ------------------------------------------------------------------ */
/* Auto-refresh — a local timer that reloads this page on an interval */
/* ------------------------------------------------------------------ */

let refreshTimer: number | undefined;
let refreshIntervalSeconds = 0;

async function armAutoRefresh(): Promise<void> {
  if (refreshTimer !== undefined) {
    window.clearTimeout(refreshTimer);
    refreshTimer = undefined;
  }
  refreshIntervalSeconds = 0;
  const s = await currentSettings();
  if (!s.tools.autoRefresh) return;
  if (!/^https?:$/.test(window.location.protocol)) return;
  const rule = await autoRefreshFor(localStorageAutoRefresh(), window.location.href);
  if (!rule) return;
  refreshIntervalSeconds = rule.intervalSeconds;
  refreshTimer = window.setTimeout(() => {
    window.location.reload();
  }, refreshIntervalSeconds * 1000);
}

/* ------------------------------------------------------------------ */
/* Page ruler overlay — drag a box, read the size                     */
/* ------------------------------------------------------------------ */

let rulerOverlay: HTMLElement | null = null;
let rulerStart: { x: number; y: number } | null = null;
let rulerBoxEl: HTMLElement | null = null;

function destroyRuler(): void {
  rulerOverlay?.remove();
  rulerOverlay = null;
  rulerBoxEl = null;
  rulerStart = null;
}

function onRulerMove(event: MouseEvent): void {
  if (!rulerStart || !rulerBoxEl) return;
  const box: RulerBox = {
    x: rulerStart.x,
    y: rulerStart.y,
    width: event.clientX - rulerStart.x,
    height: event.clientY - rulerStart.y
  };
  const rect = event.target instanceof HTMLElement ? (event.target as HTMLElement).getBoundingClientRect() : null;
  const w = Math.abs(box.width);
  const h = Math.abs(box.height);
  rulerBoxEl.style.left = `${Math.min(box.x, box.x + box.width)}px`;
  rulerBoxEl.style.top = `${Math.min(box.y, box.y + box.height)}px`;
  rulerBoxEl.style.width = `${w}px`;
  rulerBoxEl.style.height = `${h}px`;
  rulerBoxEl.textContent = `${Math.round(w)} × ${Math.round(h)}px`;
  void (async () => {
    const measure = measureElementAt(document, event.clientX, event.clientY);
    if (measure) rulerBoxEl.textContent = `${measure.label}: ${Math.round(measure.width)} × ${Math.round(measure.height)}px`;
  })();
}

function enableRuler(): void {
  destroyRuler();
  const overlay = document.createElement("div");
  overlay.id = "onekit-ruler-overlay";
  overlay.style.cssText = [
    "position:fixed", "inset:0", "z-index:2147483647",
    "background:rgba(79,70,229,.08)", "cursor:crosshair", "touch-action:none"
  ].join(";");
  const box = document.createElement("div");
  box.style.cssText = [
    "position:fixed", "pointer-events:none", "z-index:2147483647",
    "border:1px solid #4f46e5", "background:rgba(79,70,229,.15)",
    "color:#4f46e5", "font:600 12px/1.4 system-ui,sans-serif",
    "padding:2px 6px", "display:flex", "align-items:flex-start", "justify-content:flex-start"
  ].join(";");
  overlay.appendChild(box);
  overlay.addEventListener("mousedown", (event) => {
    rulerStart = { x: event.clientX, y: event.clientY };
    rulerBoxEl = box;
    box.style.display = "block";
  });
  overlay.addEventListener("mousemove", onRulerMove);
  overlay.addEventListener("mouseup", () => {
    rulerStart = null;
  });
  overlay.addEventListener("dblclick", destroyRuler);
  document.documentElement.appendChild(overlay);
  rulerOverlay = overlay;
}

/* ------------------------------------------------------------------ */
/* Fake form filler — fill a page's form with test data               */
/* ------------------------------------------------------------------ */

function fillFormWithFakeData(): number {
  const person = fakePerson();
  let filled = 0;
  for (const el of document.querySelectorAll<HTMLElement>("input, textarea, select")) {
    if (el instanceof HTMLInputElement && (el.type === "hidden" || el.type === "password" || el.type === "submit" || el.type === "button")) continue;
    const autocomplete = el.getAttribute("autocomplete");
    const kind = classifyField({
      name: el instanceof HTMLInputElement ? el.name : "",
      id: el.id,
      placeholder: el instanceof HTMLInputElement ? el.placeholder : "",
      ...(autocomplete ? { autocomplete } : {}),
      ...(el instanceof HTMLInputElement ? { type: el.type } : {})
    });
    const value = valueForKind(kind, person);
    if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
      el.value = value;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      filled++;
    } else if (el instanceof HTMLSelectElement) {
      if (el.options.length > 1) {
        el.selectedIndex = 1 + Math.floor(Math.random() * (el.options.length - 1));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        filled++;
      }
    }
  }
  return filled;
}

/* ------------------------------------------------------------------ */
/* Table → CSV — copy the active table as CSV                         */
/* ------------------------------------------------------------------ */

function copyTableAsCsv(): number {
  const table =
    document.querySelector<HTMLTableElement>("table") ??
    (document.activeElement?.closest?.("table") ?? null);
  if (!table) return 0;
  const csv = tableToCsv(table);
  void copyToClipboard(csv);
  return table.rows.length;
}

/* ------------------------------------------------------------------ */
/* Video notes — note while watching, saved with the timestamp        */
/* ------------------------------------------------------------------ */

let videoNoteChip: HTMLElement | null = null;

function currentVideoTime(): number {
  const video = document.querySelector<HTMLVideoElement>("video");
  return video && Number.isFinite(video.currentTime) ? video.currentTime : 0;
}

async function renderVideoNoteChip(): Promise<void> {
  if (!/^https?:$/.test(window.location.protocol)) return;
  if (!document.querySelector<HTMLVideoElement>("video")) return; // only on video pages
  const notes = await listVideoNotes(localStorageVideoNotes(), window.location.href);
  if (notes.length === 0) {
    videoNoteChip?.remove();
    videoNoteChip = null;
    return;
  }
  if (videoNoteChip) return;
  const chip = document.createElement("button");
  chip.type = "button";
  chip.id = "onekit-video-notes-chip";
  chip.textContent = `⏱ ${notes.length} note${notes.length === 1 ? "" : "s"} — view in popup`;
  chip.title = "OneKit video notes — take notes while watching, jump back any time";
  chip.style.cssText = [
    "position:fixed", "left:16px", "bottom:16px", "z-index:2147483646",
    "background:#1e293b", "color:#f1f5f9", "border:none", "padding:8px 14px",
    "border-radius:8px", "font:600 13px/1 system-ui,sans-serif", "cursor:pointer",
    "box-shadow:0 4px 16px rgba(0,0,0,.35)"
  ].join(";");
  chip.addEventListener("click", () => {
    void (async () => {
      const text = window.prompt("Add a note at " + currentVideoTime().toFixed(1) + "s:");
      if (!text) return;
      await addVideoNote(localStorageVideoNotes(), window.location.href, currentVideoTime(), text);
      chip.remove();
      videoNoteChip = null;
      void renderVideoNoteChip();
    })();
  });
  document.documentElement.appendChild(chip);
  videoNoteChip = chip;
}

/* ------------------------------------------------------------------ */
/* Messages from background (right-click actions)                     */
/* ------------------------------------------------------------------ */

browser.runtime.onMessage.addListener(
  (message: unknown, _sender, sendResponse) => {
    const msg = message as { type?: string; url?: string; text?: string; key?: string; wpm?: number };
    if (msg.type === "ok:speed-reader-start") {
    const wpm = typeof msg.wpm === "number" ? msg.wpm : 300;
    startSpeedReader(wpm);
    return;
  }
  if (msg.type === "ok:speed-reader-stop") {
    stopSpeedReader();
    return;
  }
  if (msg.type === "ok:summarize-page") {
    const raw = readerTextFromDocument(document);
    if (!raw) {
      sendResponse({ ok: false, reason: "Nothing readable found on this page." });
      return;
    }
    const summary = summarizeText(raw, { maxSentences: 4, maxChars: 900 });
    sendResponse({ ok: true, summary, stats: summaryStats(raw, summary) });
    return;
  }
  if (msg.type === "ok:toc-toggle") {
    sendResponse(togglePageToc());
    return;
  }
  if (msg.type === "ok:page-toc-md") {
    const entries = extractToc(document.body);
    sendResponse({ markdown: tocToMarkdown(entries), entries: entries.length });
    return;
  }
  if (msg.type === "ok:page-text") {
    sendResponse({ text: document.body?.innerText ?? document.body?.textContent ?? "" });
    return;
  }
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
  if (msg.type === "ok:reading-time") {
    // Reading time + grade level for the visible page text.
    sendResponse(readingMetrics(pageReadableText()));
    return;
  }
  if (msg.type === "ok:localstorage:list") {
    // Read-only preview of the page's localStorage — values truncated.
    const items = Object.keys(localStorage).slice(0, 200).map((key) => {
      const raw = localStorage.getItem(key) ?? "";
      return { key, value: raw.slice(0, 120), bytes: raw.length };
    });
    sendResponse({ items });
    return;
  }
  if (msg.type === "ok:localstorage:remove" && typeof msg.key === "string") {
    localStorage.removeItem(msg.key);
    sendResponse({ removed: true });
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
  if (msg.type === "ok:archive-page") {
    void (async () => {
      const raw = document.body?.innerText ?? document.body?.textContent ?? "";
      const saved = await saveArchiveItem(
        localStorageArchive(),
        {
          url: window.location.href,
          title: document.title || window.location.href,
          text: extractPageText(raw),
          html: document.documentElement.outerHTML
        },
        Date.now()
      );
      showToast(saved ? "Page saved to your local archive ✓" : "Nothing to archive on this page.", saved ? "ok" : "info");
    })().catch(() => {
      showToast("Could not archive this page.", "info");
    });
    return;
  }
  if (msg.type === "ok:fullpage-capture") {
    void captureFullPage().catch(() => {
      showToast("Could not capture the page.", "info");
    });
    return;
  }
  if (msg.type === "ok:copy-selection-md") {
    const md = selectionToMarkdown(msg.text ?? "");
    void copyToClipboard(md).then(() => showToast("Copied as Markdown ✓", "ok"));
    return;
  }
  if (msg.type === "ok:copy-link-md") {
    const md = linkToMarkdown(msg.text ?? "", msg.url ?? "");
    void copyToClipboard(md).then(() => showToast("Copied link as Markdown ✓", "ok"));
    return;
  }
  if (msg.type === "ok:copy-page-md") {
    const md = linkToMarkdown(msg.text ?? document.title, msg.url ?? window.location.href);
    void copyToClipboard(md).then(() => showToast("Copied page as Markdown ✓", "ok"));
    return;
  }
  if (msg.type === "ok:copy-all-links") {
    const anchors = [...document.querySelectorAll<HTMLAnchorElement>("a[href]")].map((a) => ({
      href: a.href,
      text: a.textContent ?? ""
    }));
    const links = extractLinks(anchors);
    if (links.length === 0) {
      showToast("No links found on this page.", "info");
      return;
    }
    void copyToClipboard(linksToMarkdown(links)).then(() => {
      showToast(`Copied ${links.length} links as Markdown ✓`, "ok");
    });
    return;
  }
  if (msg.type === "ok:add-note") {
    void renderNotes();
    return;
  }
  if (msg.type === "ok:pick-color") {
    return pickColorFromPage();
  }
  if (msg.type === "ok:collect-images") {
    return collectAndDownloadImages().then(
      (saved) => ({ saved }),
      () => ({ saved: 0 })
    );
  }
  if (msg.type === "ok:pomodoro-start" || msg.type === "ok:pomodoro-end") {
    void renderPomodoroChip();
    return;
  }
  if (msg.type === "ok:vault-fill") {
    const { username, password, site } = msg as { username?: string; password?: string; site?: string };
    const targets = findCredentialFields(document);
    const filled = fillTargets(targets, username ?? "", password ?? "");
    const label = site || "entry";
    if (filled > 0) {
      showToast(`Filled ${label} — check the fields before submitting.`, "ok");
    } else {
      showToast("No login fields found on this page.", "info");
    }
    return { filled };
  }
  if (msg.type === "ok:find-replace") {
    const { query, replacement, caseSensitive } = msg as {
      query?: string;
      replacement?: string;
      caseSensitive?: boolean;
    };
    return replaceOnPage(query ?? "", replacement ?? "", Boolean(caseSensitive)).then(
      (replaced) => {
        const summary = replaceSummary(replaced);
        showToast(summary, replaced > 0 ? "ok" : "info");
        return { replaced };
      }
    );
  }
  if (msg.type === "ok:video-speed-get") {
    void (async () => {
      const host = normalizeHost(window.location.href);
      const speed = await getSiteSpeed(videoSpeedStore, host);
      sendResponse({ host, speed });
    })();
    return true;
  }
  if (msg.type === "ok:video-speed-set" && typeof (msg as { speed?: unknown }).speed === "number") {
    void (async () => {
      const host = normalizeHost(window.location.href);
      const speed = await setSiteSpeed(videoSpeedStore, host, (msg as { speed: number }).speed);
      await applyVideoSpeeds(true);
      sendResponse({ speed });
    })();
    return true;
  }
  if (msg.type === "ok:video-speed-reset") {
    void (async () => {
      const host = normalizeHost(window.location.href);
      await clearSiteSpeed(videoSpeedStore, host);
      await applyVideoSpeeds(true);
      sendResponse({ speed: 1 });
    })();
    return true;
  }
  if (msg.type === "ok:video-pip") {
    void (async () => {
      const result = await openVideoPip();
      sendResponse(result);
    })();
    return true;
  }
  if (msg.type === "ok:ruler-toggle") {
    if (rulerOverlay) destroyRuler();
    else enableRuler();
    return;
  }
  if (msg.type === "ok:fake-fill") {
    const filled = fillFormWithFakeData();
    showToast(filled > 0 ? `Filled ${filled} field${filled === 1 ? "" : "s"} with test data — nothing real.` : "No fillable fields found on this page.", filled > 0 ? "ok" : "info");
    return { filled };
  }
  if (msg.type === "ok:table-csv") {
    const rows = copyTableAsCsv();
    showToast(rows > 0 ? `Copied table (${rows} rows) as CSV ✓` : "No table found on this page.", rows > 0 ? "ok" : "info");
    return { rows };
  }
  if (msg.type === "ok:video-notes-add") {
    const text = typeof msg.text === "string" ? msg.text : "";
    if (!text.trim()) {
      showToast("Click the note chip to add a timestamped note.", "info");
      return;
    }
    void (async () => {
      await addVideoNote(localStorageVideoNotes(), window.location.href, currentVideoTime(), text);
      showToast("Note saved with timestamp ✓", "ok");
      void renderVideoNoteChip();
    })();
    return;
  }
  if (msg.type === "ok:video-notes-refresh") {
    void renderVideoNoteChip();
    return;
  }
  if (msg.type === "ok:stop-auto-refresh") {
    if (refreshTimer !== undefined) {
      window.clearTimeout(refreshTimer);
      refreshTimer = undefined;
      refreshIntervalSeconds = 0;
      void clearAutoRefresh(localStorageAutoRefresh(), window.location.href).catch(() => {});
    }
    return;
  }
  }
);

/** Replaces `query` with `replacement` across every visible text node. */
async function replaceOnPage(query: string, replacement: string, caseSensitive: boolean): Promise<number> {
  if (!query) return 0;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    // Skip script/style/textarea/input content.
    const parent = node.parentElement;
    if (!parent) continue;
    const tag = parent.tagName;
    if (tag === "SCRIPT" || tag === "STYLE" || tag === "TEXTAREA" || tag === "INPUT" || tag === "NOSCRIPT") continue;
    if (node.textContent && node.textContent.trim()) nodes.push(node as Text);
  }
  let total = 0;
  for (const node of nodes) {
    const before = node.textContent ?? "";
    if (!before) continue;
    const { text, replaced } = replaceAllMatches(before, query, replacement, { caseSensitive });
    if (replaced > 0) {
      node.textContent = text;
      total += replaced;
    }
  }
  return total;
}

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
/* Sticky web notes — notes pinned to this page                       */
/* ------------------------------------------------------------------ */

const NOTES_HOST_ID = "onekit-notes-host";
const NOTE_STYLE_ID = "onekit-notes-style";
let notesHost: HTMLElement | null = null;

function noteStyle(): HTMLStyleElement {
  let style = document.getElementById(NOTE_STYLE_ID) as HTMLStyleElement | null;
  if (!style) {
    style = document.createElement("style");
    style.id = NOTE_STYLE_ID;
    style.textContent = `
#onekit-notes-host { position: fixed; inset: 0; pointer-events: none; z-index: 2147483646; }
.onekit-note {
  position: fixed; pointer-events: auto; max-width: 220px; min-width: 140px;
  border-radius: 8px; padding: 8px 10px; font: 13px/1.4 system-ui, sans-serif;
  color: #1f2937; box-shadow: 0 4px 16px rgba(0,0,0,.25); cursor: move;
}
.onekit-note[data-color="yellow"] { background: #fef08a; border: 1px solid #eab308; }
.onekit-note[data-color="green"] { background: #bbf7d0; border: 1px solid #22c55e; }
.onekit-note[data-color="blue"] { background: #bfdbfe; border: 1px solid #3b82f6; }
.onekit-note[data-color="pink"] { background: #fbcfe8; border: 1px solid #ec4899; }
.onekit-note[data-color="orange"] { background: #fed7aa; border: 1px solid #f97316; }
.onekit-note .onekit-note-text { white-space: pre-wrap; word-break: break-word; }
.onekit-note .onekit-note-x { float: right; border: none; background: none; cursor: pointer; color: #6b7280; font-size: 12px; padding: 0 2px; }
.onekit-note textarea { width: 100%; border: none; background: transparent; resize: none; font: inherit; color: inherit; outline: none; min-height: 48px; }
.onekit-note .onekit-note-colors { display: flex; gap: 4px; margin-top: 4px; }
.onekit-note .onekit-note-colors span { width: 14px; height: 14px; border-radius: 50%; cursor: pointer; border: 1px solid rgba(0,0,0,.2); }
.onekit-note-add {
  position: fixed; right: 14px; bottom: 14px; pointer-events: auto;
  width: 40px; height: 40px; border-radius: 50%; border: none; background: #4f46e5;
  color: #fff; font-size: 22px; cursor: pointer; box-shadow: 0 4px 14px rgba(0,0,0,.35); z-index: 2147483646;
}
`;
    document.documentElement.appendChild(style);
  }
  return style;
}

async function currentOrigin(): Promise<string> {
  return window.location.origin;
}

async function renderNotes(): Promise<void> {
  if (!/^https?:$/.test(window.location.protocol)) return;
  const settings = await loadSettings();
  if (!settings.tools.webNotes) return;
  noteStyle();
  if (!notesHost) {
    notesHost = document.createElement("div");
    notesHost.id = NOTES_HOST_ID;
    document.documentElement.appendChild(notesHost);
  }
  notesHost.innerHTML = "";
  const notes = await listNotesForOrigin(localStorageWebNotes(), await currentOrigin());
  for (const note of notes) {
    const el = document.createElement("div");
    el.className = "onekit-note";
    el.dataset.color = note.color;
    el.dataset.id = note.id;
    el.style.left = `${note.xPct}%`;
    el.style.top = `${note.yPct}%`;
    const close = document.createElement("button");
    close.className = "onekit-note-x";
    close.textContent = "✕";
    close.title = "Delete note";
    close.addEventListener("click", (event) => {
      event.stopPropagation();
      void removeWebNote(localStorageWebNotes(), note.id).then(() => void renderNotes());
    });
    const text = document.createElement("div");
    text.className = "onekit-note-text";
    text.textContent = note.text;
    text.addEventListener("dblclick", () => {
      // Double-click to edit inline.
      const textarea = document.createElement("textarea");
      textarea.value = note.text;
      textarea.addEventListener("blur", () => {
        void updateWebNote(localStorageWebNotes(), note.id, { text: textarea.value }).then(() => void renderNotes());
      });
      text.replaceWith(textarea);
      textarea.focus();
    });
    el.append(close, text);
    notesHost.appendChild(el);
    makeNoteDraggable(el, note.id);
  }

  if (notesHost.querySelector(".onekit-note-add")) return;
  const add = document.createElement("button");
  add.className = "onekit-note-add";
  add.textContent = "+";
  add.title = "OneKit — add a sticky note at the center of the screen";
  add.addEventListener("click", () => {
    void (async () => {
      const note = await addWebNote(
        localStorageWebNotes(),
        {
          origin: await currentOrigin(),
          url: window.location.href,
          text: "New note — double-click to edit.",
          color: "yellow",
          xPct: 50,
          yPct: Math.round((window.scrollY / Math.max(1, document.documentElement.scrollHeight)) * 100)
        },
        Date.now()
      );
      if (note) await renderNotes();
    })();
  });
  notesHost.appendChild(add);
}

function makeNoteDraggable(el: HTMLElement, id: string): void {
  let dragging = false;
  let startX = 0;
  let startY = 0;
  el.addEventListener("pointerdown", (event) => {
    if ((event.target as HTMLElement).closest("textarea,button")) return;
    dragging = true;
    startX = event.clientX - el.getBoundingClientRect().left;
    startY = event.clientY - el.getBoundingClientRect().top;
    event.preventDefault();
  });
  el.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    el.style.left = `${event.clientX - startX}px`;
    el.style.top = `${event.clientY - startY}px`;
  });
  el.addEventListener("pointerup", () => {
    if (!dragging) return;
    dragging = false;
    const rect = el.getBoundingClientRect();
    void updateWebNote(
      localStorageWebNotes(),
      id,
      {
        xPct: Math.max(0, Math.min(100, Math.round((rect.left / window.innerWidth) * 100))),
        yPct: Math.max(0, Math.min(100, Math.round(((rect.top + window.scrollY) / Math.max(1, document.documentElement.scrollHeight)) * 100)))
      }
    );
  });
}

/* ------------------------------------------------------------------ */
/* Mouse gestures — right-drag shapes                                 */
/* ------------------------------------------------------------------ */

let gesturePoints: Point[] = [];
let gestureTracking = false;
let gestureDrew = false;

const GESTURE_ACTIONS: Record<GestureId, (() => void) | null> = {
  up: () => {
    void browser.runtime.sendMessage({ type: "ok:gesture-new-tab" });
  },
  down: () => {
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
  },
  left: () => {
    window.history.back();
  },
  right: () => {
    window.history.forward();
  },
  L: () => {
    void browser.runtime.sendMessage({ type: "ok:gesture-close-tab" });
  },
  U: () => {
    void browser.runtime.sendMessage({ type: "ok:gesture-reload" });
  },
  none: null
};

function onGesturePointerDown(event: PointerEvent): void {
  if (event.button !== 2) return;
  gestureTracking = true;
  gestureDrew = false;
  gesturePoints = [{ x: event.clientX, y: event.clientY }];
}

function onGesturePointerMove(event: PointerEvent): void {
  if (!gestureTracking) return;
  const last = gesturePoints[gesturePoints.length - 1]!;
  if (Math.abs(event.clientX - last.x) + Math.abs(event.clientY - last.y) < 3) return;
  gesturePoints.push({ x: event.clientX, y: event.clientY });
  if (pathLength(gesturePoints) > 24) gestureDrew = true;
}

function onGesturePointerUp(event: PointerEvent): void {
  if (!gestureTracking) return;
  gestureTracking = false;
  if (event.button !== 2) return;
  if (!gestureDrew) return;
  const gesture = recognizeGesture(gesturePoints);
  gesturePoints = [];
  const action = GESTURE_ACTIONS[gesture];
  if (action) {
    event.preventDefault();
    action();
    showToast(`Gesture: ${gesture}`, "info");
  }
}

function onGestureContextMenu(event: MouseEvent): void {
  // A drawn gesture must never open the context menu.
  if (gestureDrew) event.preventDefault();
}

async function startMouseGestures(): Promise<void> {
  const settings = await loadSettings();
  if (!settings.tools.mouseGestures) return;
  document.addEventListener("pointerdown", onGesturePointerDown, true);
  document.addEventListener("pointermove", onGesturePointerMove, true);
  document.addEventListener("pointerup", onGesturePointerUp, true);
  document.addEventListener("contextmenu", onGestureContextMenu, true);
}

/* ------------------------------------------------------------------ */
/* Reading progress bar — thin bar on article-like pages              */
/* ------------------------------------------------------------------ */

const PROGRESS_BAR_ID = "onekit-progress-bar";
let progressBar: HTMLElement | null = null;
let progressSaveTimer: number | undefined;

async function updateProgressBar(): Promise<void> {
  if (!/^https?:$/.test(window.location.protocol)) return;
  const settings = await loadSettings();
  const el = document.getElementById(PROGRESS_BAR_ID);
  if (!settings.tools.readingProgress) {
    el?.remove();
    progressBar = null;
    return;
  }
  const scrollHeight = document.documentElement.scrollHeight || document.body.scrollHeight || 0;
  const clientHeight = window.innerHeight;
  const paragraphs = document.querySelectorAll("p").length;
  const textLength = (document.body?.innerText ?? "").length;
  if (!isArticleLike({ textLength, paragraphCount: paragraphs, scrollHeight, clientHeight })) {
    el?.remove();
    progressBar = null;
    return;
  }
  if (!el) {
    const bar = document.createElement("div");
    bar.id = PROGRESS_BAR_ID;
    bar.style.cssText =
      "position:fixed;top:0;left:0;height:3px;width:0;background:#4f46e5;z-index:2147483646;transition:width .2s ease;pointer-events:none;";
    document.documentElement.appendChild(bar);
    progressBar = bar;
  }
  const pct = progressPercent(window.scrollY, scrollHeight, clientHeight);
  if (progressBar) progressBar.style.width = `${pct}%`;
  if (progressSaveTimer !== undefined) window.clearTimeout(progressSaveTimer);
  progressSaveTimer = window.setTimeout(() => {
    void saveProgress(localStorageReadingProgress(), window.location.href, pct).catch(() => {
      // Best-effort.
    });
  }, 800);
}

async function resumeSavedProgress(): Promise<void> {
  if (!/^https?:$/.test(window.location.protocol)) return;
  const settings = await loadSettings();
  if (!settings.tools.readingProgress) return;
  const record = await readProgress(localStorageReadingProgress(), window.location.href);
  if (!record || record.pct < 5 || record.pct > 98) return;
  const scrollHeight = document.documentElement.scrollHeight || document.body.scrollHeight || 0;
  const target = (scrollHeight - window.innerHeight) * (record.pct / 100);
  window.scrollTo({ top: target });
  showToast(`Resumed where you left off (${record.pct}%).`, "info");
}

/* ------------------------------------------------------------------ */
/* Pomodoro — countdown chip on the active tab                        */
/* ------------------------------------------------------------------ */

let pomodoroChip: HTMLElement | null = null;
let pomodoroTimer: number | undefined;

async function renderPomodoroChip(): Promise<void> {
  const state = await readPomodoro(localStoragePomodoro(), Date.now());
  const existing = document.getElementById("onekit-pomodoro-chip");
  if (!state) {
    existing?.remove();
    pomodoroChip = null;
    if (pomodoroTimer !== undefined) {
      window.clearInterval(pomodoroTimer);
      pomodoroTimer = undefined;
    }
    return;
  }
  if (!existing) {
    const chip = document.createElement("div");
    chip.id = "onekit-pomodoro-chip";
    chip.style.cssText = [
      "position:fixed",
      "right:14px",
      "bottom:14px",
      "z-index:2147483646",
      "background:#1e293b",
      "color:#e2e8f0",
      "font:600 13px/1 system-ui,sans-serif",
      "padding:10px 14px",
      "border-radius:999px",
      "box-shadow:0 6px 20px rgba(0,0,0,.4)",
      "display:flex",
      "align-items:center",
      "gap:8px"
    ].join(";");
    const label = document.createElement("span");
    label.id = "onekit-pomodoro-label";
    const end = document.createElement("button");
    end.type = "button";
    end.textContent = "✕";
    end.title = "End the timer";
    end.style.cssText = "border:none;background:none;color:#94a3b8;cursor:pointer;font-size:12px;padding:0 2px;";
    end.addEventListener("click", () => {
      void browser.runtime.sendMessage({ type: "ok:pomodoro-end" });
    });
    chip.append(label, end);
    document.documentElement.appendChild(chip);
    pomodoroChip = chip;
  }
  const label = document.getElementById("onekit-pomodoro-label");
  if (label) {
    const remaining = Math.max(0, state.until - Date.now());
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    const phase = state.phase === "focus" ? "🍅 Focus" : state.phase === "break" ? "☕ Break" : "🌴 Long break";
    label.textContent = `${phase} · ${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }
  if (pomodoroTimer === undefined) {
    pomodoroTimer = window.setInterval(() => {
      void (async () => {
        const current = await readPomodoro(localStoragePomodoro(), Date.now());
        if (!current) {
          if (pomodoroTimer !== undefined) {
            window.clearInterval(pomodoroTimer);
            pomodoroTimer = undefined;
          }
          document.getElementById("onekit-pomodoro-chip")?.remove();
          return;
        }
        await renderPomodoroChip();
      })();
    }, 1000);
  }
}

/* ------------------------------------------------------------------ */
/* Color picker — Chrome's native EyeDropper                          */
/* ------------------------------------------------------------------ */

async function pickColorFromPage(): Promise<{ color?: string; error?: string }> {
  const EyeDropperCtor = (window as unknown as { EyeDropper?: new () => { open(): Promise<{ sRGBHex: string }> } }).EyeDropper;
  if (!EyeDropperCtor) {
    return { error: "EyeDropper isn't available in this browser." };
  }
  try {
    const result = await new EyeDropperCtor().open();
    return { color: result.sRGBHex };
  } catch {
    // User cancelled the picker (Esc) — that's fine.
    return { error: "cancelled" };
  }
}

/* ------------------------------------------------------------------ */
/* Download all images                                                */
/* ------------------------------------------------------------------ */

async function collectAndDownloadImages(): Promise<number> {
  const images: ImageRef[] = collectImageUrls(
    [...document.querySelectorAll<HTMLImageElement>("img")].map((img) => ({
      src: img.currentSrc || img.src,
      srcset: img.srcset,
      width: img.naturalWidth,
      height: img.naturalHeight,
      alt: img.alt
    })),
    window.location.href
  );
  const urls = images.map((i) => i.url);
  if (urls.length === 0) return 0;
  const result = (await browser.runtime.sendMessage({ type: "ok:collect-images", urls })) as { saved?: number } | undefined;
  return result?.saved ?? 0;
}

/* ------------------------------------------------------------------ */
/* Video speed + floating video (PiP)                                 */
/* ------------------------------------------------------------------ */

const videoSpeedStore = localStorageArea();
const appliedVideoSpeeds = new WeakSet<HTMLVideoElement>();
let speedApplyPending = false;

async function applyVideoSpeeds(force = false): Promise<void> {
  const host = normalizeHost(window.location.href);
  const speed = await getSiteSpeed(videoSpeedStore, host);
  for (const video of document.querySelectorAll<HTMLVideoElement>("video")) {
    if (force || !appliedVideoSpeeds.has(video)) {
      applySpeedToVideo(video, speed);
      appliedVideoSpeeds.add(video);
    }
  }
}

function scheduleVideoSpeedApply(): void {
  if (speedApplyPending) return;
  speedApplyPending = true;
  requestAnimationFrame(() => {
    speedApplyPending = false;
    void applyVideoSpeeds();
  });
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.isContentEditable
  );
}

async function onVideoSpeedShortcut(event: KeyboardEvent): Promise<void> {
  const settings = await loadSettings();
  if (!settings.tools.videoSpeed) return;
  if (isEditableTarget(event.target)) return;
  const videos = document.querySelectorAll<HTMLVideoElement>("video");
  if (videos.length === 0) return;
  const host = normalizeHost(window.location.href);
  if (event.key === "[" || event.key === "]" || event.key === "\\") {
    event.preventDefault();
    if (event.key === "\\") {
      await clearSiteSpeed(videoSpeedStore, host);
      await applyVideoSpeeds(true);
      showToast(`Playback speed ${speedLabel(1)}`, "ok");
      return;
    }
    const current = await getSiteSpeed(videoSpeedStore, host);
    const next = nextSpeed(current, event.key === "]" ? 1 : -1);
    await setSiteSpeed(videoSpeedStore, host, next);
    await applyVideoSpeeds(true);
    showToast(`Playback speed ${speedLabel(next)}`, "ok");
  }
}

function initVideoSpeed(): void {
  void applyVideoSpeeds();
  const observer = new MutationObserver((records) => {
    const hasVideo = records.some((r) =>
      [...r.addedNodes].some(
        (n) => n instanceof HTMLVideoElement || (n instanceof Element && n.querySelector?.("video") !== null)
      )
    );
    if (hasVideo) scheduleVideoSpeedApply();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener("keydown", (e) => void onVideoSpeedShortcut(e), true);
}

async function openVideoPip(): Promise<{ ok: boolean; reason?: "no-video" | "unsupported" | "rejected" }> {
  const videos = [...document.querySelectorAll<HTMLVideoElement>("video")];
  const picked = pickVideoForPip(videos);
  if (!picked) return { ok: false, reason: "no-video" };
  if (canUseDocumentPip(window as unknown as { documentPictureInPicture?: unknown })) {
    try {
      const win = (window as unknown as {
        documentPictureInPicture: { requestWindow(opts?: { width?: number; height?: number }): Promise<Window> };
      }).documentPictureInPicture;
      const pipWindow = await win.requestWindow({ width: 480, height: 270 });
      pipWindow.document.body.append(picked);
      pipWindow.addEventListener("pagehide", () => {
        document.body.append(picked);
      });
      return { ok: true };
    } catch {
      return { ok: false, reason: "rejected" };
    }
  }
  if (canUseNativePip(picked)) {
    try {
      await picked.requestPictureInPicture();
      return { ok: true };
    } catch {
      return { ok: false, reason: "rejected" };
    }
  }
  return { ok: false, reason: "unsupported" };
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

  // Autofill chip on focused form fields.
  document.addEventListener("focusin", onFieldFocus, true);
  document.addEventListener("click", dismissAutofillChip, true);

  // Dark mode filter (applied on load and whenever settings change).
  void applyDarkMode().catch(() => {
    // Best-effort.
  });

  // Custom per-site CSS.
  void applyCustomCss().catch(() => {
    // Best-effort.
  });

  // Auto-refresh timer (re-arms itself after every reload).
  void armAutoRefresh().catch(() => {
    // Best-effort.
  });

  // Read-aloud chip watcher while speech is running.
  window.setInterval(updateReadAloudChip, 2000);

  // Video speed controller (per-site speeds + [ ] \\ shortcuts).
  initVideoSpeed();

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
    if (
      changes["ok.settings"] ||
      changes["ok.focusRules"] ||
      changes["ok.focusPause"] ||
      changes["ok.focusAllowToday"] ||
      changes["ok.focusSession"]
    ) {
      void updateFocusBlocker();
    }
    if (changes["ok.settings"] || changes["ok.darkMode"]) {
      void applyDarkMode().catch(() => {
        // Best-effort.
      });
    }
    if (changes["ok.settings"] || changes["ok.customCss"]) {
      void applyCustomCss().catch(() => {
        // Best-effort.
      });
    }
    if (changes["ok.settings"] || changes["ok.autoRefresh"]) {
      void armAutoRefresh().catch(() => {
        // Best-effort.
      });
    }
    if (changes["ok.settings"] || changes["ok.webNotes"]) {
      notesHost?.remove();
      notesHost = null;
      void renderNotes().catch(() => {
        // Best-effort.
      });
    }
    if (changes["ok.settings"]) {
      void updateProgressBar().catch(() => {
        // Best-effort.
      });
    }
    if (changes["ok.pomodoro"]) {
      void renderPomodoroChip().catch(() => {
        // Best-effort.
      });
    }
  });

  // Screen-time tracking (local per-site active time).
  if (/^https?:$/.test(window.location.protocol)) {
    startScreenTimeTracking();
  }

  // Distraction blocker — checks now and on every visibility return.
  startFocusBlocker();

  // Sticky web notes layer.
  void renderNotes().catch(() => {
    // Best-effort.
  });

  // Mouse gestures (right-drag shapes).
  void startMouseGestures().catch(() => {
    // Best-effort.
  });

  // Reading progress bar + resume.
  document.addEventListener("scroll", () => void updateProgressBar(), { passive: true });
  void updateProgressBar().catch(() => {
    // Best-effort.
  });
  void resumeSavedProgress().catch(() => {
    // Best-effort.
  });

  // Pomodoro countdown chip (driven by the popup/side panel).
  void renderPomodoroChip().catch(() => {
    // Best-effort.
  });

  // Video notes chip (appears when a video page has saved notes).
  void renderVideoNoteChip().catch(() => {
    // Best-effort.
  });
  window.setInterval(() => void renderVideoNoteChip().catch(() => {}), 5000);
}

export default defineContentScript({
  matches: ["<all_urls>"],
  main() {
    boot();
  }
});
