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
    tab: "convert",
    description: "Merge PDFs or extract a page range locally with pdf-lib."
  },
  {
    id: "imageTools",
    name: "Image convert & resize",
    icon: "🎨",
    tab: "convert",
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
    description: "Convert files locally (one or a whole batch, save individually or bundled into one ZIP): images ↔ PNG/JPEG/WebP/AVIF/GIF with quality, max-size, rotate and flip controls; several images → one PDF or one animated GIF; PDF → text/Markdown/HTML or PNG/JPG pages; images/TXT/CSV/Markdown/DOCX/EPUB → PDF; XLSX ↔ CSV/JSON; JSON ↔ YAML/XML/CSV; ZIP/TAR/GZIP; fonts TTF/WOFF/WOFF2; MP3/OGG/M4A/FLAC → WAV or MP3; videos (MP4/WebM/MOV) → GIF. Nothing is uploaded."
  },
  {
    id: "readingTime",
    name: "Reading time & grade level",
    icon: "⏱️",
    tab: "memory",
    description: "Minutes to read the current page (200 wpm) plus its Flesch–Kincaid grade level — computed locally from the visible text."
  },
  {
    id: "citation",
    name: "Citation generator",
    icon: "📚",
    tab: "tools",
    description: "Copy an APA, MLA or Chicago citation for the current page, formatted locally from its title, URL and access date."
  },
  {
    id: "localStorageInspector",
    name: "Local Storage inspector",
    icon: "💾",
    tab: "dev",
    description: "Browse and delete the current page's localStorage entries — read-only previews, nothing leaves the device."
  },
  {
    id: "apiTester",
    name: "API tester",
    icon: "🧪",
    tab: "dev",
    description: "Send GET/POST/PUT/PATCH/DELETE/HEAD requests to any http(s) endpoint from the popup and read the status, timing and body."
  },
  {
    id: "homeDashboard",
    name: "Home dashboard (new tab)",
    icon: "🏠",
    tab: "settings",
    description: "A local new-tab page with today's goals and editable quick links — no account, no cloud."
  },
  {
    id: "totp",
    name: "TOTP 2FA authenticator",
    icon: "🔐",
    tab: "safety",
    description: "Generate 6–8 digit login codes locally from otpauth:// links, base32 secrets, or a scanned QR code, with an optional passphrase that encrypts the secrets at rest."
  },
  {
    id: "privacySweep",
    name: "Privacy sweep",
    icon: "🧽",
    tab: "safety",
    description: "Scan the last 7 days of history and cookies, then clear them per site — history, cookies, storage, cache — all on this device."
  },
  {
    id: "emojiPicker",
    name: "Emoji picker",
    icon: "😀",
    tab: "typing",
    description: "A searchable, keyword-matching emoji grid bundled locally — click any emoji to copy it."
  },
  {
    id: "caseConverter",
    name: "Text case converter",
    icon: "🔠",
    tab: "typing",
    description: "Convert text to UPPER, lower, Title, Sentence, camelCase, PascalCase, kebab-case, snake_case and more — pure local transforms."
  },
  {
    id: "findReplace",
    name: "Find & replace on page",
    icon: "🔎",
    tab: "typing",
    description: "Replace repeated typos or stale text across the active page in one click; reload to undo."
  },
  {
    id: "unitConverter",
    name: "Unit & date converter",
    icon: "📐",
    tab: "tools",
    description: "Length, weight, temperature, data, volume and time conversion plus date math — days between dates, add days, time zones. Pure local math (currency is honestly absent: live rates need a network)."
  },
  {
    id: "habits",
    name: "Habit tracker",
    icon: "✅",
    tab: "focus",
    description: "Daily check-offs with streaks, stored locally and shown on the new-tab dashboard."
  },
  {
    id: "tabOutline",
    name: "Tab outline (side panel)",
    icon: "🗂",
    tab: "speed",
    description: "A tree view of every open tab grouped by site in the side panel — switch, suspend or close tabs without losing your place."
  },
  {
    id: "passwordVault",
    name: "Local password vault",
    icon: "🔑",
    tab: "safety",
    description: "Save logins locally, encrypted at rest with a master password (AES-GCM, key in memory only). Fill is one click from the popup and never auto-submits; encrypted backup export/restore included."
  },
  {
    id: "videoSpeed",
    name: "Video speed controller",
    icon: "⏩",
    tab: "tools",
    description: "Set a playback speed per site and apply it to every video — plus [ ] \\ keyboard shortcuts while watching. All local.",
    toggleKey: "videoSpeed",
    settingLabel: "Apply saved playback speeds to videos ([ ] \\ shortcuts)"
  },
  {
    id: "tabRecorder",
    name: "Tab recorder",
    icon: "🎬",
    tab: "tools",
    description: "Record the current tab (video + audio) to a WebM file saved to Downloads. Keep the OneKit popup open while recording; closing it saves what was captured."
  },
  {
    id: "ocr",
    name: "Image & screenshot OCR",
    icon: "🔍",
    tab: "tools",
    description: "Extract text from an image file or the visible tab, fully offline with a bundled OCR engine."
  },
  {
    id: "spellcheck",
    name: "Local spell-checker",
    icon: "✍️",
    tab: "typing",
    description: "Check pasted text against a bundled 274k-word dictionary with correction suggestions — no network. Proper nouns and jargon will be flagged."
  },
  {
    id: "todo",
    name: "Todo list",
    icon: "☑️",
    tab: "focus",
    description: "Local tasks with priorities and due dates, sorted the way you'd do it by hand — open first, then priority, then due date."
  },
  {
    id: "secureNotes",
    name: "Encrypted secure notes",
    icon: "📓",
    tab: "vault",
    description: "Private notes encrypted at rest with a passphrase (PBKDF2 + AES-GCM, key in memory only). No recovery — a lost passphrase means lost notes."
  },
  {
    id: "focusSounds",
    name: "Focus sounds",
    icon: "🌊",
    tab: "focus",
    description: "White, pink, brown noise or rain generated locally with Web Audio — no streaming, nothing leaves the device."
  },
  {
    id: "videoPip",
    name: "Floating video (PiP)",
    icon: "📺",
    tab: "tools",
    description: "Pop the current page's video into a draggable always-on-top window with one click."
  },
  {
    id: "passwordStrength",
    name: "Password strength analyzer",
    icon: "🛡️",
    tab: "tools",
    description: "Score any password locally: entropy, common-pattern flags, and an honest crack-time estimate. Nothing is sent anywhere."
  },
  {
    id: "emailBlocker",
    name: "Email-signup blocker",
    icon: "📮",
    tab: "safety",
    description: "Intercepts newsletter signup forms and asks before anything is submitted — the dark-pattern fight, done honestly.",
    toggleKey: "emailBlocker",
    settingLabel: "Confirm before newsletter/signup forms submit"
  },
  {
    id: "reminders",
    name: "Local reminders",
    icon: "⏰",
    tab: "memory",
    description: "Set a one-off reminder; it fires as a notification even when the popup is closed. No account, no cloud."
  },
  {
    id: "tabLimiter",
    name: "Tab limiter",
    icon: "🛑",
    tab: "speed",
    description: "A soft cap on open tabs: warns when you're over, suggests suspending the oldest inactive ones. Never force-closes.",
    toggleKey: "tabLimiter",
    settingLabel: "Warn when too many tabs are open (tab limiter)"
  },
  {
    id: "multiSearch",
    name: "Multi-search",
    icon: "🌐",
    tab: "tools",
    description: "One query, several engines — open Google, YouTube, Wikipedia, Reddit and more in parallel tabs."
  },
  {
    id: "linkCollector",
    name: "Link collector",
    icon: "🔗",
    tab: "memory",
    description: "Right-click a link to stash it, then export the collection as Markdown or CSV — great for research sessions."
  },
  {
    id: "tabList",
    name: "Copy tab list",
    icon: "📋",
    tab: "speed",
    description: "Copy every open tab as a Markdown list or CSV — for research notes, sharing a session, or backing up what's open."
  },
  {
    id: "textList",
    name: "Text → list tools",
    icon: "📑",
    tab: "typing",
    description: "Split pasted text into lines, dedupe, sort, reverse, or turn it into CSV — all pure local transforms."
  },
  {
    id: "contrast",
    name: "WCAG contrast checker",
    icon: "🎨",
    tab: "tools",
    description: "Check two colors against WCAG AA/AAA for normal and large text — pure local math, no upload."
  },
  {
    id: "exportHub",
    name: "Data export hub",
    icon: "🗄️",
    tab: "settings",
    description: "Download your OneKit data as one JSON file or a friendly Markdown digest — everything was already on this device."
  },
  {
    id: "barcode",
    name: "Barcode generator",
    icon: "〰️",
    tab: "tools",
    description: "Code 128 barcodes for any ASCII text, rendered locally as SVG — product codes, asset tags, serial numbers."
  },
  {
    id: "linkStatus",
    name: "Link status inspector",
    icon: "🔎",
    tab: "dev",
    description: "Local heuristics for a pasted link: spaces, missing scheme, broken encoding, placeholders, local-only hosts. No network pings, so it's honest."
  },
  {
    id: "tabParking",
    name: "Tab parking",
    icon: "🅿️",
    tab: "memory",
    description: "OneTab-style memory saving done safely: park this window's inactive tabs, restore any time, nothing is ever deleted."
  },
  {
    id: "csvExport",
    name: "CSV export hub",
    icon: "📊",
    tab: "settings",
    description: "Standard CSV exports for passwords and TOTP secrets — the interchange format password managers and 2FA apps import."
  },
  {
    id: "passphrase",
    name: "Passphrase generator",
    icon: "🧩",
    tab: "tools",
    description: "Diceware-style passphrases you can actually remember — long, strong, and guess-resistant by construction."
  },
  {
    id: "clipboardPin",
    name: "Pinned clipboard",
    icon: "📌",
    tab: "memory",
    description: "Pin clipboard items so they survive the 50-entry rotation — the thing you copied stays reachable."
  },
  {
    id: "scheduledSessions",
    name: "Scheduled session opens",
    icon: "⏰",
    tab: "memory",
    description: "Auto-open a set of tabs at a set time — your work tabs every weekday morning. Runs in the background."
  },
  {
    id: "downloadsCleaner",
    name: "Downloads cleaner",
    icon: "🗑️",
    tab: "tools",
    description: "Finds duplicate and older-than-90-days downloads in your history so the list stays tidy — files on disk are untouched."
  },
  {
    id: "pageToPdf",
    name: "Page → PDF",
    icon: "📄",
    tab: "tools",
    description: "One click opens the clean, readable version of the current page ready to save as PDF — the browser's own PDF engine."
  },
  {
    id: "clipboardExport",
    name: "Clipboard export",
    icon: "📎",
    tab: "memory",
    description: "Turn clipboard history into a readable Markdown file, or clear it."
  },
  {
    id: "textReplace",
    name: "Text find & replace",
    icon: "🔀",
    tab: "typing",
    description: "Replace text in a pasted block right in the popup — the fix you keep retyping, done once."
  },
  {
    id: "bookmarksMarkdown",
    name: "Bookmarks → Markdown",
    icon: "🗃️",
    tab: "tools",
    description: "Export your bookmark tree as a readable Markdown file or a CSV — your bookmarks as a document you can keep anywhere."
  },
  {
    id: "sessionIo",
    name: "Session export / import",
    icon: "🗂️",
    tab: "memory",
    description: "Take workspaces, parked tabs and the session backup with you in one portable JSON file — your tabs, your file."
  },
  {
    id: "activityLog",
    name: "Activity log",
    icon: "🧹",
    tab: "memory",
    description: "A local audit trail of what OneKit did — reminders fired, scheduled opens, exports made. Capped at 200 events."
  },
  {
    id: "autoRefresh",
    name: "Tab auto-refresh",
    icon: "🔄",
    tab: "speed",
    description: "Reload the active tab on an interval — track dashboards and live pages. A plain local timer; never a hijacker.",
    toggleKey: "autoRefresh",
    settingLabel: "Allow OneKit auto-refresh timers on pages"
  },
  {
    id: "windowResizer",
    name: "Window resizer",
    icon: "📐",
    tab: "dev",
    description: "Resize the window to common device viewports — desktop, tablet, phone — for responsive checks."
  },
  {
    id: "pageRuler",
    name: "Page ruler",
    icon: "📏",
    tab: "dev",
    description: "Measure any element on the page in pixels — drag a box, read the size, see what's under the cursor."
  },
  {
    id: "fakeFiller",
    name: "Fake form filler",
    icon: "🎭",
    tab: "dev",
    description: "Fill a page's form with random-but-valid test data — names, emails, cards — generated locally, never real."
  },
  {
    id: "meetingLinks",
    name: "Meeting link launcher",
    icon: "🎙",
    tab: "memory",
    description: "Recent Zoom / Meet / Teams join links in one place — no more digging through chat for the link."
  },
  {
    id: "autoTag",
    name: "Auto-tag saved content",
    icon: "🏷",
    tab: "memory",
    description: "Tags your saved pages and highlights by domain + keywords so your library is findable — no manual organizing."
  },
  {
    id: "privacyScore",
    name: "Privacy score",
    icon: "🔐",
    tab: "safety",
    description: "One honest A–F score of your browser footprint — cookies, history trail, protections — with concrete next steps."
  },
  {
    id: "priceFees",
    name: "Price-with-fees calculator",
    icon: "🧾",
    tab: "tools",
    description: "See the real total: tax, shipping, marketplace fees, discounts — and what a seller actually keeps."
  },
  {
    id: "videoNotes",
    name: "Video timestamp notes",
    icon: "⏱",
    tab: "focus",
    description: "Take notes while watching any video, each saved with its timestamp so you can jump straight back."
  },
  {
    id: "tableCsv",
    name: "Table → CSV extractor",
    icon: "📊",
    tab: "tools",
    description: "Copy any page's table (or your selection in it) as clean CSV — researchers' tables without the mangling."
  },
  {
    id: "highlightExport",
    name: "Highlight exporter",
    icon: "🧹",
    tab: "memory",
    description: "Your page highlights as one readable Markdown document, grouped by page — a research session you can keep."
  },
  {
    id: "customCss",
    name: "Custom CSS per site",
    icon: "🔌",
    tab: "dev",
    description: "Per-site CSS tweaks — hide clutter, fix contrast, restyle anything. Fully local, nothing leaves the device.",
    toggleKey: "customCss",
    settingLabel: "Apply per-site custom CSS rules"
  }
];

/** Tools that can be launched from the Ctrl+Shift+K palette. */
export const LAUNCHABLE_TOOLS = TOOLS.filter((t) => t.tab !== "settings");

/** Tools with a settings toggle, keyed for label lookup. */
export function toolByToggle(toggleKey: keyof ToolToggles): ToolDef | undefined {
  return TOOLS.find((t) => t.toggleKey === toggleKey);
}
