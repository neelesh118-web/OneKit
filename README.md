# OneKit — Local Browser Toolbox

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
| 📄 PDF merge & split | Merge several PDFs or extract a page range entirely on-device via pdf-lib. Files never leave the browser | Popup → Tools |
| 🎨 Image convert & resize | Convert PNG/JPEG/WebP and downscale via canvas, all local | Popup → Tools |
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
npm test               # vitest (270 tests)
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
  popup/            tabbed popup (Memory/Vault/Safety/Speed/Focus/Typing/Tools/Settings)
src/core/           pure logic modules (all unit-tested, no browser.* calls)
src/popup/          controllers (browser capabilities injected, testable)
tests/              vitest suite for every core module
scripts/            gen-icons.mjs (pure-PNG icon generator)
```

## Roadmap (later phases)

- Cross-device sync (needs a server — later decision)
- Workspace rename/merge controls in the Speed tab
- Bigger offline dictionary bundle
