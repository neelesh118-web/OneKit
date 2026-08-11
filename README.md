# OneKit — 100+ Tools Run Locally

One extension, every boring browser problem, **100% on-device**. No account,
no cloud, no tracking, free forever.

Built as a fresh project that borrows the *plumbing pattern* from SkillMesh
(WXT MV3, storage abstraction, controller pattern, vitest harness) but has
**zero SkillMesh code**: no AI-prompt features, no site-specific adapters.

## The tools

### Phase 1 (15 tools)

| Pillar | Tool | Where |
|---|---|---|
| 🧠 Memory | Full-text history search | Popup → Memory |
| 🧠 Memory | Clipboard history (last 50 copies) | Popup → Memory |
| 🧠 Memory | Form draft vault (per-site) | Popup → Memory + on-page |
| 🛡️ Safety | Clean Link (strip utm/fbclid/gclid…) | Popup → Safety + right-click |
| 🛡️ Safety | Cookie banner auto-reject (never "Accept") | On-page (toggle in Settings) |
| ⚡ Speed | Duplicate tab killer | Popup → Speed |
| ⚡ Speed | Tab finder | Popup → Speed |
| ⚡ Speed | Autoplay killer | On-page (toggle in Settings) |
| ⌨️ Typing | Text expander (`;alias` + space) | On-page (toggle in Settings) |
| ⌨️ Typing | Paste cleaner (paste as plain text) | On-page (toggle in Settings) |
| ⌨️ Typing | Word counter | Popup → Typing + right-click |
| ⌨️ Typing | Voice dictation (Web Speech API) | On-page (toggle in Settings) |
| 🧰 Tools | QR generator (on-device, SVG) | Popup → Tools |
| 🧰 Tools | Password generator (crypto-random) | Popup → Tools |
| 🧰 Tools | Screenshot of visible tab | Popup → Tools |

### Phase 2 (4 features)

| Feature | What it does | Where |
|---|---|---|
| 💬 AI Chat Vault | Local archive of ChatGPT / Claude / Gemini conversations; search, open, export .md. Capture is best-effort (site DOMs drift) and OFF by default | Popup → Vault; content script on the 3 sites |
| ⭐ Page highlights | Right-click → highlight selection; saved per-page, re-applied when you revisit, managed in the popup | Right-click + Popup → Memory |
| 📚 Read-later + clean reader | Right-click → save page; right-click → open in a distraction-free reader with font controls + Markdown download | Right-click + reader page + Popup → Memory |
| 🚨 Scam-site radar | Local heuristics on the current page: URL patterns (suspicious TLDs, punycode, IP hosts, non-HTTPS) + page signals (no contact/privacy, pressure language, payment-only) → risk score 0–10 with reasons. A tripwire, not a verdict | Popup → Safety |

### Phase 3 (3 features — 22 tools total)

| Feature | What it does | Where |
|---|---|---|
| ⌨️ **Ctrl+Shift+K unified search** | ONE query across page history + AI chats + open tabs + form drafts + clipboard. Shadow-DOM palette, keyboard-navigable (↑/↓, Enter, Esc). Inert until the shortcut is pressed; ON by default | Any page, toggle in Settings |
| 🔒 PII redactor | Scan any text for emails, phones, Luhn-validated credit cards, SSNs, API keys, IPs → copy-safe redacted version. The original value never appears in the output | Popup → Safety |
| 🗄 Backup & restore | Export every OneKit store to one JSON file; restore validates each key's shape and only touches keys present in the backup | Popup → Settings |

### Phase 4 (3 features — 25 tools total)

| Feature | What it does | Where |
|---|---|---|
| 🗂 Tab workspaces | Save your whole session (all open http(s) tabs) and restore it later — restoring opens the saved tabs without touching what's open now. Capped at 25 sessions | Popup → Speed |
| 🧘 Distraction blocker | Per-site schedules that hide a distracting site behind a local overlay during your chosen windows. Subdomains count; overnight windows supported. Never a trap — “Pause for 10 minutes” and “Allow for today” are one click from the overlay. OFF by default | On-page (toggle in Settings) + Popup → Focus |
| ⏱ Screen time | Local per-site active-time stats (counts while a tab is visible), today + last 7 days with bars. 90-day retention, pruned automatically. ON by default | Popup → Focus |

### Phase 5 (7 features — 30 tools total)

| Feature | What it does | Where |
|---|---|---|
| 🛟 Automatic session backup | Auto-snapshots open tabs every 15 minutes and after tab changes (alarm-driven, MV3-safe), so a crash or update never loses your session. One-click restore opens the saved tabs without touching your current ones. ON by default | Background + Popup → Speed |
| 💾 Tab memory saver | Suspends tabs idle for 10–180 min (Chrome's discard API) so Chrome uses less memory; suspended tabs reload when clicked. Never touches the active, pinned, or audible tab. OFF by default | Background + Popup → Speed |
| ⏳ Daily site budgets | Caps minutes/day per site; when today's screen time reaches the budget, the distraction blocker covers the site (only while the blocker is on). One-click pause/allow-today from the overlay | On-page + Popup → Focus |
| 🔊 Read aloud | Right-click a selection or a page and have it read to you via the browser's built-in speech — fully offline, with a red stop chip while speaking | Right-click |
| 📖 Word lookup | Double-click a word on any page to see its meaning from the bundled offline dictionary (starter coverage, no network). OFF by default | On-page (toggle in Settings) |
| ⬇️ Download organizer | Routes downloads into folders by type (Images, Documents, Audio, Video, Archives, Code, Fonts) with name dedupe, plus a local download history (last 200). OFF by default — only takes effect once enabled | Background + Popup → Downloads |
| 🔐 Vault password | Password-protects the AI Chat Vault with PBKDF2 + AES-GCM, all on-device. While encrypted, chat capture pauses and the vault needs the password to open; removing encryption writes it back to plain storage. No recovery — a lost password means a lost vault | Popup → Vault |

Plus: **first-run onboarding** (a 4-choice picker that switches on only the tools you want) and the **Ctrl+Shift+K palette now searches everything** — history, saved items (read-later / highlights / workspaces), chats, tabs, drafts, clipboard, screen time, focus rules — and doubles as a **tool launcher**.

### Phase 6 (10 features — 40 tools total)

| Feature | What it does | Where |
|---|---|---|
| 🔑 Form autofill (contact card) | Save name/email/phone/address/company once; a 🔑 Fill chip appears on matching empty fields and fills them on click. Never fills on load, never overwrites typed text. OFF by default | On-page (toggle in Settings) + Popup → Memory |
| 🎯 Focus session (deep-work timer) | One click blocks distracting sites everywhere for 25–120 min (with an allowlist). Overrides per-site schedules; the overlay shows a live countdown and an “End session” button | Popup → Focus + Side panel |
| 🗃 Auto tab grouping | Group open tabs by site into colored Chrome tab groups with one click. Single-tab sites and tabs already in a group are left alone; multi-part TLDs (co.uk etc.) group correctly | Popup → Speed |
| 📸 Full-page screenshot | Scrolls the page viewport-by-viewport and stitches the shots into one PNG (24px overlap removed). Saved to Downloads | Popup → Tools |
| 📄 PDF merge & split | Merge several PDFs or extract a page range entirely on-device via pdf-lib. Files never leave the browser | Popup → Convert |
| 🎨 Image convert & resize | Convert PNG/JPEG/WebP and downscale via canvas, all local | Popup → Convert |
| 🔖 Bookmark cleaner | Finds exact duplicate bookmarks (normalized URLs, same title+URL) and structurally broken URLs; removes them in one pass. Honest scope: real dead-link checks need network calls, so it stays local | Popup → Tools |
| 🌙 Dark mode (starter) | Per-site CSS invert-filter with an off-list (youtube.com etc. never change). Honest scope: a filter, not per-rule theming | On-page (toggle in Settings) + Settings → off-list |
| 🧩 Side panel | OneKit as a docked side panel (Chrome 114+): the same unified search, a focus-session quick-start, and today's screen time beside your tabs | Side panel button in the toolbar |
| 📦 Local web archive | Right-click a page to save its full HTML into a searchable local archive (capped at 50 pages, 400 KB each) so you can re-read it even if the site changes or goes offline | Right-click + Popup → Memory |

### Phase 7 (7 features — 47 tools total)

| Feature | What it does | Where |
|---|---|---|
| ⏰ Tab snooze | Hide the current tab and reopen it automatically in 15 min, 1 h, 4 h, tomorrow, or a week. The background alarm wakes, reopens due tabs, and parks the rest. Snoozed tabs are listed in Speed with Open now / Cancel | Popup → Speed |
| 🗒️ Sticky web notes | Pin colored notes to any page at a percentage anchor — they re-appear exactly where you left them on revisit. Double-click to edit, drag to move, + button on the page to add. Notes never leak across sites (keyed by origin) | On-page (toggle in Settings) + Popup → Memory |
| ⬇️ Copy as Markdown + link extractor | Copy a selection, a link, or the whole page as Markdown; one click dumps every link on a page as a clean bullet list. Made for AI prompts and docs | Right-click + Popup → Typing |
| 🖱️ Mouse gestures | Hold the right button and drag: ↑ new tab, ↓ scroll to bottom, ← back, → forward, L close tab, U reload. Gesture recognition is deliberately conservative — messy drags never trigger anything | On-page (toggle in Settings) |
| 🔎 Omnibox commands | Type `ok` + a word in the address bar to search history, tabs and clipboard, then Enter to open or copy — no popup needed | Address bar |
| ✏️ Screenshot annotate | Capture the visible tab, then draw pens, arrows, boxes and text on it before saving at full resolution | Popup → Tools |
| 📏 Reading progress bar | A thin bar at the top of article-like pages shows how far you are; returning to the page jumps you back to where you left off (per-URL, local) | On-page (toggle in Settings) |

### Phase 8 (7 features — 54 tools total)

| Feature | What it does | Where |
|---|---|---|
| 🛠️ Text & dev toolbox | JSON format/validate/minify, Base64 (unicode-safe), URL encode/decode, case converter, SHA-256 hash, timestamp ↔ date, regex tester, line diff — eight tools, all local, nothing leaves the browser | Popup → Dev |
| 🍪 Cookie manager | View/edit/delete/add cookies for the current site with live stats, plus one-click “Forget this site…” that clears its cookies, storage and cache (with a confirm — you'll be signed out) | Popup → Safety |
| 🖨️ Print-friendly version | Right-click a page → opens the clean reader with the print dialog ready — print or Save as PDF with no ads or nav | Right-click + Reader |
| 🎨 Color picker | Pick any pixel with Chrome's native EyeDropper (no permissions) — shows hex, RGB and HSL, one click copies | Popup → Tools |
| 🍅 Pomodoro timer | 25/5/15-min focus & break cycles; a countdown chip appears on the active tab and survives the popup closing; long break every 4 sessions | Popup → Focus + On-page chip |
| 🖼️ Download all images | Collect every image on the page (best srcset version each, deduped) and save them to Downloads | Popup → Tools |
| 🔍 Search selected text | Right-click any selection → search it on Google, YouTube, Wikipedia or Perplexity in a new tab | Right-click |

### Phase 9 (1 feature — 55 tools total)

| Feature | What it does | Where |
|---|---|---|
| 🔄 File converter | Convert files 100% locally — one file or a whole batch, saved individually or bundled into one ZIP (optionally into one Downloads subfolder): images ↔ PNG/JPEG/WebP/AVIF/GIF (GIF is a 256-color format, honest about the depth loss) with quality, max-size, rotate and flip controls; several images → one PDF or one animated GIF (GIF maker, per-frame delay); PDF → text/Markdown/HTML or PNG/JPG pages (multi-page zips); images/TXT/CSV/Markdown/DOCX/EPUB → PDF; XLSX ↔ CSV/JSON; JSON ↔ YAML/XML/CSV; ZIP/TAR/GZIP; fonts TTF/WOFF/WOFF2; MP3/OGG/M4A/FLAC → WAV or MP3; videos (MP4/WebM/MOV) → GIF. Detection uses magic bytes, not just the file extension (JFIF is recognized as JPEG); unsupported pairs (HEIC, RAW, Pages, DWG, OCR, e-signing) are honestly refused rather than faked, and batch picks that don't match are listed and skipped. Files never leave the device | Popup → Convert |

### Phase 10 (5 features — 60 tools total)

| Feature | What it does | Where |
|---|---|---|
| 📚 Citation generator | APA / MLA / Chicago citations from the current page title, URL, site, author (typed) and access date — copyable, per-style examples shown | Popup → Tools |
| ⏱ Reading time & grade level | Word count, estimated reading minutes and Flesch reading-ease grade for the current page (or pasted text) | Popup → Memory |
| 🎨 Color palette history | Every color you pick with the eyedropper/color picker is saved to a history swatch grid; click to copy any hex | Popup → Tools |
| 🔌 API tester | Send GET/POST/PUT/DELETE requests with headers and a JSON body, see status, latency, size and pretty-printed response — runs from the popup against any URL | Popup → Dev |
| 🔍 Local-storage inspector | List, view and delete `localStorage` keys for the active tab (read-only by default, delete asks first) | Popup → Dev |
| 🏠 New-tab dashboard | A local new-tab page replacing Chrome's default: today's date, editable goals list, and quick-link tiles — no account, no cloud | New tab |

### Phase 11 (8 features — 68 tools total)

| Feature | What it does | Where |
|---|---|---|
| 🔐 TOTP 2FA authenticator | RFC 6238 login codes generated locally from an otpauth:// link or base32 secret, with a live 30s countdown and optional passphrase that encrypts secrets at rest (AES-GCM, key derived via PBKDF2 and held in memory for the session) | Popup → Safety |
| 🧽 Privacy sweep | Scans the last 7 days of history and cookies, then clears them per site — history, cookies, storage, cache — ranked by footprint, with a per-host filter | Popup → Safety |
| 😀 Emoji picker | Searchable, keyword-matching emoji grid bundled locally — click any to copy | Popup → Typing |
| 🔠 Text case converter | UPPER, lower, Title, Sentence, camelCase, PascalCase, kebab-case, snake_case, CONSTANT_CASE and dot.case — pure local transforms | Popup → Typing |
| 🔎 Find & replace on page | Replaces repeated typos or stale text across the active page in one click (case option); reload to undo | Popup → Typing |
| 📐 Unit & date converter | Length, weight, temperature, data, volume and time conversion plus date math — days between dates, add days, IANA time zones. Pure local math; currency is honestly absent (live rates need a network) | Popup → Tools |
| ✅ Habit tracker | Daily check-offs with streaks, stored locally, also shown on the new-tab dashboard | Popup → Focus + New tab |
| 🗂 Tab outline (side panel) | Tree view of every open tab grouped by site in the side panel — switch, suspend or close tabs | Side panel |

### Phase 12 (1 feature — 69 tools total)

| Feature | What it does | Where |
|---|---|---|
| 🔑 Local password vault | Save logins locally, encrypted at rest with a master password (whole-blob AES-GCM via the same vault-crypto format as the AI chat vault; key derived with PBKDF2 and held in memory for the session — popup close = locked). Popup-only one-click fill (never auto-fill, never auto-submit; the content script fills the first username + last password field and toasts “check the fields before submitting”), per-site subdomain matching, encrypted backup export/restore, change-master-password, and delete-all with confirm | Popup → Safety |

### Phase 13 (8 features — 77 tools total)

| Feature | What it does | Where |
|---|---|---|
| ⏩ Video speed controller | Per-site playback speeds applied to every video on a site, with a popup slider and `[` / `]` / `\` keyboard shortcuts while watching (enable in Settings). All local | Popup → Tools + on-page |
| 🎬 Tab recorder | Records the current tab (video + audio) to a WebM file in Downloads via `chrome.tabCapture` + MediaRecorder. Keep the popup open while recording — closing it saves what was captured; nothing is uploaded | Popup → Tools |
| 🔍 Image & screenshot OCR | Extracts text from an image file or the visible tab, 100% offline — tesseract.js WASM core + English traineddata bundled (lazy-loaded, ~3 MB, no network) | Popup → Tools |
| ✍️ Local spell-checker | Checks pasted text against a bundled 274k-word dictionary with edit-distance ≤ 2 correction suggestions. Proper nouns and jargon aren't in the dictionary, so they're never flagged (honest scope) | Popup → Typing |
| ☑️ Todo list | Local tasks with priorities and due dates, sorted open-first then priority then due date, with a stats line. No account, no cloud | Popup → Focus |
| 📓 Encrypted secure notes | Private notes encrypted at rest with a passphrase (PBKDF2 + AES-GCM, the same vault-crypto scheme as the chat vault; key held in memory only). Lock/unlock, remove encryption, delete-all. No recovery — a lost passphrase means lost notes | Popup → Vault |
| 🌊 Focus sounds | White, pink, brown noise or rain generated locally with Web Audio — nothing streams, nothing leaves the device; volume control, stops on popup close | Popup → Focus |
| 📺 Floating video (PiP) | Pops the page's best video (playing + visible wins) into Chrome's Document Picture-in-Picture window; falls back to native PiP | Popup → Tools + on-page |

### Phase 14 (12 features — 89 tools total)

| Feature | What it does | Where |
|---|---|---|
| 🛡️ Password strength analyzer | Scores any password locally: entropy, common-password/keyboard-sequence/repeat flags, and an honest crack-time estimate. Nothing leaves the device | Popup → Tools |
| 📮 Email-signup blocker | Intercepts newsletter/signup forms (email field + subscribe-style button) and asks the user to confirm before anything is submitted — the dark-pattern fight, done honestly; never fabricates an email, never auto-submits | On-page (Settings toggle) |
| ⏰ Local reminders | One-off reminders that fire as browser notifications even when the popup is closed (chrome.alarms); pending/dismissed list, clear-all. No account, no cloud | Popup → Memory |
| 🛑 Tab limiter | Soft cap on open tabs — warns when way over (once per 10 min) and can suspend the oldest inactive tabs. Never force-closes anything | Popup → Speed + background |
| 🌐 Multi-search | One query, several engines (Google, Bing, DuckDuckGo, YouTube, Wikipedia, Perplexity, GitHub, Reddit) — each opens in its own tab | Popup → Tools |
| 🔗 Link collector | Right-click a link/page → OneKit — “Collect link (export later)”; stash links while researching, then export the collection as Markdown or CSV | Right-click + Popup → Memory |
| 📋 Copy tab list | Download every open tab as a Markdown list or CSV — research notes, sharing a session, quick backup of what's open | Popup → Speed |
| 📑 Text → list tools | Split pasted text into lines, split on commas/semicolons, dedupe, sort, reverse, or convert to CSV — pure local transforms | Popup → Typing |
| 🎨 WCAG contrast checker | Checks two colors against WCAG AA/AAA for normal and large text — pure local math | Popup → Tools |
| 🗄️ Data export hub | Download every OneKit store as one JSON file, or a friendly Markdown digest (links, todos, reminders) | Popup → Settings |
| 〰️ Barcode generator | Code 128 barcodes for any ASCII text (product codes, asset tags, serials), rendered locally as SVG — downloadable | Popup → Tools |
| 🔎 Link status inspector | Local heuristics for a pasted URL: spaces, missing scheme, broken percent-encoding, placeholder hosts, local-only hosts. No network pings — checks the URL's own structure | Popup → Dev |

### Phase 15 (12 features — 101 tools total)

Built from real 1-star review complaints about the biggest utility extensions — OneTab's "my tabs vanished forever", password managers without portable exports, save-as-PDF that needs the print dialog. Everything stays 100% local.

| Feature | What it does | Where |
|---|---|---|
| 🅿️ Tab parking | OneTab-style memory saving done safely: parks this window's inactive web tabs into a reversible list (never deletes anything, pinned + active tabs are skipped), restore one or all | Popup → Memory |
| 📊 CSV export hub | Standard CSV exports — links, todos, passwords and TOTP secrets in the columns Bitwarden/2FA importers accept. Vaults are encrypted at rest, so a passphrase unlocks them for CSV | Popup → Settings |
| 🧩 Passphrase generator | Diceware-style passphrases you can actually remember (4-8 words, separator, number, capitalization options) — long, strong, guess-resistant by construction | Popup → Tools |
| 📌 Pinned clipboard | Pin clipboard items so they survive the 50-entry rotation — the thing you copied stays reachable, pinned entries sort to the top | Popup → Memory |
| ⏰ Scheduled session opens | Auto-open a set of tabs at a set time — your work tabs every weekday morning, your reading list on Sundays. Runs on chrome.alarms in the background even with the popup closed | Popup → Memory + background |
| 🗑️ Downloads cleaner | Finds duplicate downloads (keeps the newest) and entries older than 90 days in download history — files on disk are never touched, it only cleans the list | Popup → Tools |
| 📄 Page → PDF | One click: the page's clean article opens in the reader and the browser's own print dialog (Save as PDF) fires. Uses the browser's PDF engine — nothing is uploaded | Popup → Tools |
| 📎 Clipboard export | Clipboard history as a readable Markdown file, or clear it — your copied text as a document you can keep | Popup → Memory |
| 🔀 Text find & replace | Replace text in a pasted block right in the popup — the fix you keep retyping, done once | Popup → Typing |
| 🗃️ Bookmarks → Markdown | Export the bookmark tree as a readable Markdown file (grouped by folder) or CSV — a portable backup you can take anywhere | Popup → Tools |
| 🗂️ Session export / import | Workspaces, parked tabs and the session backup travel as one portable JSON file — your tabs, your file, restorable on another machine | Popup → Memory |
| 🧹 Activity log | A local audit trail of what OneKit did — reminders fired, scheduled opens, exports made. Capped at 200 events | Popup → Memory |

### Phase 16 (12 features — 113 tools total)

Built from 1-star review complaints about the biggest utility extensions — the Auto Refresh Plus hijack (1M+ users), "saved 500 articles but can't find anything", "just tell me if my setup is safe", "I want to save timestamps with notes". Everything stays 100% local.

| Feature | What it does | Where |
|---|---|---|
| 🔄 Tab auto-refresh | Reloads the active tab on an interval — dashboards, auctions, order boards. A plain local timer (never a hijacker like the infamous Auto Refresh Plus). Settings toggle | Popup → Speed + on-page |
| 📐 Window resizer | Resize the window to common device viewports — desktop, tablet, phone — for responsive checks | Popup → Dev |
| 📏 Page ruler | Measure any element on the page in pixels — drag a box, read the size, see what's under the cursor | Popup → Dev + on-page |
| 🎭 Fake form filler | Fill a page's form with random-but-valid test data — names, emails, cards — generated locally from a seeded RNG, never real | Popup → Dev + on-page |
| 🎙 Meeting link launcher | Recent Zoom / Meet / Teams / Webex / Jitsi join links in one place — recorded automatically when you open one | Popup → Memory + background |
| 🏷 Auto-tag saved content | Tags read-later pages and highlights by domain + keywords so your library is findable — no manual organizing | Popup → Memory |
| 🔐 Privacy score | One honest A–F score of your browser footprint — cookies, history trail, protective tools — with concrete next steps | Popup → Safety |
| 🧾 Price-with-fees calculator | Real total: tax, shipping, marketplace fees, discounts — and what a seller actually keeps. European decimal commas handled | Popup → Tools |
| ⏱ Video timestamp notes | Notes for the active page's video, each saved with its timestamp so you can jump straight back | Popup → Focus + on-page |
| 📊 Table → CSV extractor | Copy any page's table as clean CSV — researchers' tables without the mangling | Popup → Tools + on-page |
| 🧹 Highlight exporter | Page highlights as one readable Markdown document, grouped by page | Popup → Memory |
| 🔌 Custom CSS per site | Per-site CSS tweaks — hide clutter, fix contrast, restyle anything. Fully local. Settings toggle | Popup → Dev + on-page |

### Phase 17 (12 features — 125 tools total)

Built from the 5ly.co idea guide, Chrome Goldmine's "solve a small pain inside a big recurring behavior", and low-star-review lessons ("doesn't work on this site", "I want a lightweight alternative") — OneKit's exact positioning. All 100% local, no models, no network.

| Feature | What it does | Where |
|---|---|---|
| 📖 Speed reader | Word-by-word RSVP reading for any article — one centered word at a time, pure timing math, no AI | Popup → Focus + on-page |
| 📝 Local TL;DR | Extractive sentence-scoring summary of the active page — honest about being heuristic, no model | Popup → Tools |
| 📐 Size chart switcher | US / UK / EU / International clothing and shoe sizes in one click, with a pickable list | Popup → Tools |
| 🧘 Break & stretch reminders | Desk-break timer with real stretch suggestions — fires via browser alarms even with the popup closed. Settings toggle | Popup → Focus + background |
| 📑 Page table of contents | Sticky outline for long articles — click any heading to jump, copy it as Markdown | Popup → Tools + on-page |
| 🔐 Encrypted text locker | AES-GCM encrypt/decrypt any text with a passphrase — the blob is self-contained, nothing stored or sent | Popup → Safety |
| 🛡 Vault health report | Whole-vault scan: weak, reused, and common passwords with a one-line verdict | Popup → Safety |
| 🔢 Calculator | Instant local math — parentheses, %, and ^ with right-associativity. Safe parser, never eval() | Popup → Tools |
| 🕵️ QR scanner | Decode QR codes from a file or the visible tab — jsQR on-device, nothing uploaded | Popup → Tools |
| 🖼 EXIF viewer | Image metadata from a local file: dimensions, format, camera/date EXIF tags when present | Popup → Tools |
| 📧 Contact extractor | Emails and phones on the current page, deduplicated, copied as a clean list or CSV | Popup → Tools |
| 🎲 Random revisit | Picks a random unread saved page or highlight so your library works for you again | Popup → Memory |

### Phase 18 (12 features — 137 tools total)

Built from the "close tabs to the right" / "merge windows" / "recently closed tabs history" tab-clutter threads, the Edge "Read Aloud moved in right menu — where did it go?" hunt, and the reader-mode + SEO quick-check asks. Everything stays 100% local (the bulk link checker's HEAD/GET pings are the one network touch, same as the existing link status inspector).

| Feature | What it does | Where |
|---|---|---|
| 🗂 Tab utilities | Close tabs left/right/others, sort the window by domain, merge all windows — pinned tabs are never closed | Popup → Speed |
| 🕘 Recently closed tabs | One-click reopen list from browser session history (sessions permission, local) | Popup → Speed |
| 🔊 Read aloud + Reader view | Read the page with the browser's own voices, or open it in OneKit's clean reader | Popup → Focus |
| 📏 Reading line | A line follows your cursor while you read — the accessibility staple | Popup → Focus + on-page |
| 🔗 Copy page link | Title + URL as Markdown, HTML, or plain text | Popup → Typing |
| 📖 Dictionary lookup | Offline word lookup — part of speech + plain-English definition | Popup → Typing |
| 🧪 UTM link builder | Append source/medium/campaign/term/content to any URL, old utm_ replaced | Popup → Tools |
| 🎰 Generator pack | UUID v4, lorem ipsum, usernames, HEX/RGB/HSL color converter | Popup → Tools |
| 🖼 Favicon extractor | Save any page's icon — link-tag resolution with /favicon.ico fallback | Popup → Tools |
| 🌐 Open all links | Open every page link in background tabs (capped at 25) | Popup → Tools |
| 🔎 Page meta inspector | Title, meta description, OG tags, canonical, H1s — the SEO quick-check | Popup → Dev |
| 🧪 Bulk link checker | Paste a URL list, get status per link — broken links flagged in seconds | Popup → Dev |

### Phase 19 (10 features — 139 tools total)

Built from the Chrome Goldmine 2026 idea list, the "100+ low-star reviews" lessons, and the Alt+Tab-for-tabs threads — ten gap-fillers that were the most-requested things we didn't have. All 100% local; three new stores are in the backup catalog.

| Feature | What it does | Where |
|---|---|---|
| 🙈 Element hider | Right-click → “Hide element”, click anything; per-site hide list with show-again in the popup | Popup → Safety + right-click |
| 🧩 Selected-text summarizer | Select text → 5-point summary card; or paste text to summarize | Popup → Tools + right-click |
| 🔄 Quick tab switcher | Alt+Tab-style switcher — Ctrl+Shift+Space, type to filter, Enter to jump | Popup → Speed + shortcut |
| 📸 Video frame grab | Save the current video frame as a PNG | Popup → Tools + right-click |
| 🗂️ Bookmark auto-sorter | One click: bookmarks into domain folders, duplicates + empty folders found | Popup → Tools |
| ✍️ Smart-text cleaner | Curly quotes, dashes, double spaces, invisible unicode — fixed and copyable | Popup → Typing |
| 🐛 Micro QA capture | URL + timestamp + note (+ screenshot) into a copyable bug report | Popup → Dev |
| 🔑 Page keyword analyzer | Word frequencies, repeated phrases, reading time for the current page | Popup → Dev |
| 🧲 Affiliate link inspector | Flags missing rel=nofollow, missing UTM, tracking bloat, redirect wrappers | Popup → Dev |
| 🔍 SERP notes | Jot context beside Google results; the note returns with the query | Popup → Memory + on-page |

## Defaults & privacy posture

- **On by default (passive memory + stats):** history indexing, clipboard
  history, screen-time tracking, session backup.
- **Off by default (page-acting tools):** cookie reject, autoplay killer,
  text expander, paste cleaner, dictation, draft vault, AI Chat Vault,
  distraction blocker, tab memory saver, download organizer, word lookup —
  every one is a plain toggle in Settings → Tools.
- The text expander only fires on `;alias` + space — a plain word like
  `mail` in normal prose never expands.
- The cookie rejector only clicks buttons inside banner-like containers and
  **never** clicks "Accept".
- The autoplay killer pauses media that started without a recent user
  gesture — playback you start is never touched.
- Drafts are keyed by origin + field, so data never leaks across sites.
- The unified-search palette is inert until you press Ctrl+Shift+K.
- Restore from a backup never touches keys that aren't in the backup, and
  rejects files with unknown or malformed keys.
- The distraction blocker's overlay never traps you: pause and allow-today
  are always available, and disabling the tool in Settings stops it entirely.
- Screen-time data is rolled up per day, capped at 90 days, and never leaves
  the device.
- Nothing ever leaves the device. Uninstalling the extension removes all
  OneKit data.

## Right-click quick actions

- **OneKit — Copy clean link (no tracking)** (links & pages)
- **OneKit — Count words in selection** (selections)
- **OneKit — Highlight selection** (selections)
- **OneKit — Save page to read later** (pages)
- **OneKit — Open clean reader** (pages & links)

## Permissions & why

| Permission | Why |
|---|---|
| `storage` + `unlimitedStorage` | Settings + the local history/clipboard/draft vault |
| `tabs` | Tab finder + duplicate killer |
| `contextMenus` | Right-click quick actions |
| `clipboardWrite` | Copy from the popup and on-page tools |
| `<all_urls>` host | Content script runs everywhere (history, cookie reject, expander…) |

## Develop

```bash
npm install
npx wxt prepare        # generate WXT types (also runs on build)
npm run typecheck      # tsc --noEmit
npm test               # vitest (431 tests)
npm run build          # → .output/chrome-mv3/
npx wxt zip            # → .output/*.zip (store package)
```

Load unpacked from `.output/chrome-mv3/` in `chrome://extensions`.

**Project location:** `C:\Users\neele\D-Workspace\OneKit` (a folder named
`D-Workspace` on the **C:** drive — it is not `D:\OneKit`).

## Structure

```
entrypoints/
  background.ts     context menus + install-time defaults
  content.ts        all on-page tools (history, cookie, autoplay, expander, screen time, focus…)
  popup/            tabbed popup (Memory/Vault/Safety/Speed/Focus/Typing/Tools/Dev/Convert/Downloads/Settings)
src/core/           pure logic modules (all unit-tested, no browser.* calls)
src/popup/          controllers (browser capabilities injected, testable)
tests/              vitest suite for every core module
scripts/            gen-icons.mjs (pure-PNG icon generator)
```

## Roadmap (later phases)

- Cross-device sync (needs a server — later decision)
- Workspace rename/merge controls in the Speed tab
- Bigger offline dictionary bundle
