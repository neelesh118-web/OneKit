import type { ToolToggles } from "./settings";

/**
 * OneKit tool manifest — the single source of truth for every tool:
 * name, icon, home tab, description, and (when the tool has one) its
 * settings toggle + label. Settings labels, the Ctrl+Shift+K tool
 * launcher, and the README derive from this table so the lists can
 * never drift apart.
 */

export interface ToolDef {
  id: string;
  name: string;
  icon: string;
  /** Popup tab id that hosts the tool ("" when it has no popup surface). */
  tab: string;
  description: string;
  /** Present when the tool has a Settings switch. */
  toggleKey?: keyof ToolToggles;
  /** Label shown in Settings → Tools (only meaningful with toggleKey). */
  settingLabel?: string;
}

export const TOOLS: ToolDef[] = [
  {
    id: "history",
    name: "Full-text history search",
    icon: "🔎",
    tab: "memory",
    description: "Find any page you've visited by a word you remember from it.",
    toggleKey: "historyIndex",
    settingLabel: "Index pages for full-text history search"
  },
  {
    id: "clipboard",
    name: "Clipboard history",
    icon: "📋",
    tab: "memory",
    description: "Remember text you copy (last 50) so you never lose a copy.",
    toggleKey: "clipboardHistory",
    settingLabel: "Remember copied text (clipboard history)"
  },
  {
    id: "drafts",
    name: "Form draft vault",
    icon: "📝",
    tab: "memory",
    description: "Auto-save form fields and fill them back in after a refresh.",
    toggleKey: "draftVault",
    settingLabel: "Auto-save form drafts"
  },
  {
    id: "highlights",
    name: "Page highlights",
    icon: "⭐",
    tab: "memory",
    description: "Highlight any selection; it comes back when you revisit the page."
  },
  {
    id: "readLater",
    name: "Read later + clean reader",
    icon: "📚",
    tab: "memory",
    description: "Save pages for later and open them in a distraction-free reader."
  },
  {
    id: "chatVault",
    name: "AI chat vault",
    icon: "💬",
    tab: "vault",
    description: "Archive ChatGPT / Claude / Gemini conversations locally, with search, export, and optional password encryption.",
    toggleKey: "chatVault",
    settingLabel: "Save AI chat conversations locally (ChatGPT/Claude/Gemini)"
  },
  {
    id: "cleanLink",
    name: "Clean Link",
    icon: "🧹",
    tab: "safety",
    description: "Strip tracking parameters (utm_*, fbclid, gclid…) before sharing."
  },
  {
    id: "cookieReject",
    name: "Cookie banner auto-reject",
    icon: "🍪",
    tab: "safety",
    description: "Auto-click \"Reject / Decline\" on consent banners. Never \"Accept\".",
    toggleKey: "cookieReject",
    settingLabel: "Auto-reject cookie banners"
  },
  {
    id: "scamRadar",
    name: "Scam-site radar",
    icon: "🚨",
    tab: "safety",
    description: "Local risk score for the current page — a tripwire, not a verdict."
  },
  {
    id: "piiRedactor",
    name: "PII redactor",
    icon: "🔒",
    tab: "safety",
    description: "Find emails, phones, card numbers, SSNs and API keys in text and copy a redacted version."
  },
  {
    id: "dupes",
    name: "Duplicate tab killer",
    icon: "🔁",
    tab: "speed",
    description: "Close extra tabs pointing at the same page, keeping the leftmost."
  },
  {
    id: "tabFinder",
    name: "Tab finder",
    icon: "🔍",
    tab: "speed",
    description: "Search every open tab and jump straight to it."
  },
  {
    id: "workspaces",
    name: "Tab workspaces",
    icon: "🗂",
    tab: "speed",
    description: "Save and restore whole tab sessions without touching your current tabs."
  },
  {
    id: "sessionBackup",
    name: "Automatic session backup",
    icon: "🛟",
    tab: "speed",
    description: "Auto-snapshot your open tabs so a crash or update never loses them.",
    toggleKey: "sessionBackup",
    settingLabel: "Auto-backup open tabs (recover after a crash)"
  },
  {
    id: "tabSuspender",
    name: "Tab memory saver",
    icon: "💾",
    tab: "speed",
    description: "Suspend inactive tabs after a while so Chrome uses less memory. They reload when you click them.",
    toggleKey: "tabSuspender",
    settingLabel: "Suspend inactive tabs to save memory"
  },
  {
    id: "autoplayKiller",
    name: "Autoplay killer",
    icon: "🔇",
    tab: "speed",
    description: "Pause video/audio that starts on its own. Never touches playback you started.",
    toggleKey: "autoplayKiller",
    settingLabel: "Pause autoplaying video & audio"
  },
  {
    id: "focusBlocker",
    name: "Distraction blocker",
    icon: "🧘",
    tab: "focus",
    description: "Hide distracting sites behind a local overlay during your chosen windows.",
    toggleKey: "focusBlocker",
    settingLabel: "Distraction blocker (per-site schedules)"
  },
  {
    id: "budgets",
    name: "Daily site budgets",
    icon: "⏳",
    tab: "focus",
    description: "Cap how many minutes you spend per site per day — the blocker steps in when you hit the limit."
  },
  {
    id: "screenTime",
    name: "Screen time",
    icon: "⏱",
    tab: "focus",
    description: "Local per-site active-time stats for the last 7 days.",
    toggleKey: "screenTime",
    settingLabel: "Track screen time locally (per-site stats)"
  },
  {
    id: "expander",
    name: "Text expander",
    icon: "⚡",
    tab: "typing",
    description: "Type ;alias + space on any page and it expands to your saved text.",
    toggleKey: "textExpander",
    settingLabel: "Text expander (;alias snippets)"
  },
  {
    id: "pasteCleaner",
    name: "Paste as plain text",
    icon: "✂️",
    tab: "typing",
    description: "Paste into inputs as plain text — no stray formatting.",
    toggleKey: "pasteCleaner",
    settingLabel: "Paste as plain text"
  },
  {
    id: "wordCounter",
    name: "Word counter",
    icon: "🧮",
    tab: "typing",
    description: "Count words and characters in any text, or in a page selection."
  },
  {
    id: "dictation",
    name: "Voice dictation",
    icon: "🎙",
    tab: "typing",
    description: "Dictate into any text field using your browser's built-in speech.",
    toggleKey: "dictation",
    settingLabel: "Voice dictation into any field"
  },
  {
    id: "readAloud",
    name: "Read aloud",
    icon: "🔊",
    tab: "typing",
    description: "Right-click a selection or a page and have it read to you, offline."
  },
  {
    id: "wordLookup",
    name: "Word lookup",
    icon: "📖",
    tab: "memory",
    description: "Double-click a word to see its meaning from the bundled offline dictionary.",
    toggleKey: "wordLookup",
    settingLabel: "Double-click word definitions (offline dictionary)"
  },
  {
    id: "qr",
    name: "QR generator",
    icon: "🔳",
    tab: "tools",
    description: "Any URL or text → scannable QR, generated on-device."
  },
  {
    id: "password",
    name: "Password generator",
    icon: "🔑",
    tab: "tools",
    description: "Cryptographically random passwords, generated right here."
  },
  {
    id: "screenshot",
    name: "Screenshot",
    icon: "📸",
    tab: "tools",
    description: "Capture the visible tab as a PNG, saved locally."
  },
  {
    id: "downloads",
    name: "Download organizer",
    icon: "⬇️",
    tab: "downloads",
    description: "Route downloads into folders by type, dedupe names, keep a local history.",
    toggleKey: "downloadOrganizer",
    settingLabel: "Organize downloads into folders by type"
  },
  {
    id: "autofill",
    name: "Form autofill (contact card)",
    icon: "🔑",
    tab: "memory",
    description: "Save your name, email, phone and address once; fill matching forms with one click.",
    toggleKey: "autofill",
    settingLabel: "Contact-card form autofill (fills only on click)"
  },
  {
    id: "webArchive",
    name: "Local web archive",
    icon: "📦",
    tab: "memory",
    description: "Right-click a page to save its full HTML into a searchable local archive."
  },
  {
    id: "focusSession",
    name: "Focus session (deep-work timer)",
    icon: "🎯",
    tab: "focus",
    description: "One-click block of distracting sites for 25–120 minutes, with an allowlist and countdown overlay."
  },
  {
    id: "darkMode",
    name: "Dark mode (starter)",
    icon: "🌙",
    tab: "settings",
    description: "Per-site CSS dark filter with an off-list — a basic dark reader.",
    toggleKey: "darkMode",
    settingLabel: "Dark mode (per-site filter, off-list in Settings)"
  },
  {
    id: "tabGrouping",
    name: "Auto tab grouping",
    icon: "🗃",
    tab: "speed",
    description: "Group open tabs by site into colored Chrome tab groups with one click."
  },
  {
    id: "fullPageShot",
    name: "Full-page screenshot",
    icon: "🖼",
    tab: "tools",
    description: "Capture an entire page — scrolls and stitches the shots into one PNG."
  },
  {
    id: "pdfTools",
    name: "PDF merge & split",
    icon: "📄",
    tab: "tools",
    description: "Merge PDFs or extract a page range locally with pdf-lib."
  },
  {
    id: "imageTools",
    name: "Image convert & resize",
    icon: "🎨",
    tab: "tools",
    description: "Convert PNG/JPEG/WebP, resize and compress — all on-device."
  },
  {
    id: "bookmarkCleaner",
    name: "Bookmark cleaner",
    icon: "🔖",
    tab: "tools",
    description: "Find duplicate and broken bookmarks and remove them in one pass."
  },
  {
    id: "sidePanel",
    name: "Side panel",
    icon: "🧩",
    tab: "settings",
    description: "Open OneKit as a side panel — search, screen time and focus session beside your tabs."
  },
  {
    id: "palette",
    name: "Unified search (Ctrl+Shift+K)",
    icon: "⌨️",
    tab: "settings",
    description: "One search box over history, chats, tabs, drafts, clipboard, saved items and tools.",
    toggleKey: "commandPalette",
    settingLabel: "Ctrl+Shift+K unified search palette"
  },
  {
    id: "tabSnooze",
    name: "Tab snooze",
    icon: "⏰",
    tab: "speed",
    description: "Hide a tab now and reopen it automatically later today, tomorrow, or on a date."
  },
  {
    id: "webNotes",
    name: "Sticky web notes",
    icon: "🗒️",
    tab: "memory",
    description: "Pin colored notes to any page — they re-appear where you left them on revisit.",
    toggleKey: "webNotes",
    settingLabel: "Sticky notes on pages (right-click → Add note)"
  },
  {
    id: "markdown",
    name: "Copy as Markdown + link extractor",
    icon: "⬇️",
    tab: "typing",
    description: "Copy a selection, link, or tab as Markdown; dump every link on a page as a clean list."
  },
  {
    id: "mouseGestures",
    name: "Mouse gestures",
    icon: "🖱️",
    tab: "speed",
    description: "Hold the right button and drag: ↑ new tab, ↓ scroll to bottom, ← back, → forward, L close tab, U reload.",
    toggleKey: "mouseGestures",
    settingLabel: "Mouse gestures (right-drag; disables right-click drag menu)"
  },
  {
    id: "omnibox",
    name: "Omnibox commands",
    icon: "🔎",
    tab: "settings",
    description: "Type 'ok' in the address bar to search history, tabs, clipboard and run tools without opening the popup."
  },
  {
    id: "screenshotAnnotate",
    name: "Screenshot annotate",
    icon: "✏️",
    tab: "tools",
    description: "Capture a page, then draw arrows, boxes and text on it before saving."
  },
  {
    id: "readingProgress",
    name: "Reading progress bar",
    icon: "📏",
    tab: "focus",
    description: "A thin bar at the top of article-like pages shows how far you are — resume where you left off.",
    toggleKey: "readingProgress",
    settingLabel: "Reading progress bar on long pages"
  },
  {
    id: "devToolbox",
    name: "Text & dev toolbox",
    icon: "🛠️",
    tab: "dev",
    description: "JSON format/validate, Base64, URL encode, case converter, SHA-256 hash, timestamp converter, regex tester, line diff — all local."
  },
  {
    id: "cookieManager",
    name: "Cookie manager",
    icon: "🍪",
    tab: "safety",
    description: "View, edit, delete, add and export cookies for the current site, plus one-click 'Forget this site'."
  },
  {
    id: "printFriendly",
    name: "Print-friendly version",
    icon: "🖨️",
    tab: "memory",
    description: "Strip a page to its clean article, then print or save as PDF."
  },
  {
    id: "colorPicker",
    name: "Color picker",
    icon: "🎨",
    tab: "tools",
    description: "Pick any pixel on the page with Chrome's EyeDropper and copy it as hex, RGB or HSL."
  },
  {
    id: "pomodoro",
    name: "Pomodoro timer",
    icon: "🍅",
    tab: "focus",
    description: "25-minute focus / 5-minute break cycles with a countdown overlay and long break every 4 sessions."
  },
  {
    id: "imageDownloader",
    name: "Download all images",
    icon: "🖼️",
    tab: "tools",
    description: "Collect every image on the current page and save them to your downloads folder."
  },
  {
    id: "searchSelection",
    name: "Search selected text",
    icon: "🔍",
    tab: "typing",
    description: "Right-click any selection to search it on Google, YouTube, Wikipedia or Perplexity."
  },
  {
    id: "converter",
    name: "File converter",
    icon: "🔄",
    tab: "convert",
    description: "Convert files locally: images ↔ PNG/JPEG/WebP/AVIF, PDF/DOCX/EPUB → text/Markdown/HTML, XLSX ↔ CSV/JSON, JSON ↔ YAML/XML/CSV, ZIP/TAR/GZIP, fonts TTF/WOFF/WOFF2, audio → WAV, WAV → MP3. Nothing is uploaded."
  }
];

/** Tools that can be launched from the Ctrl+Shift+K palette. */
export const LAUNCHABLE_TOOLS = TOOLS.filter((t) => t.tab !== "settings");

/** Tools with a settings toggle, keyed for label lookup. */
export function toolByToggle(toggleKey: keyof ToolToggles): ToolDef | undefined {
  return TOOLS.find((t) => t.toggleKey === toggleKey);
}
