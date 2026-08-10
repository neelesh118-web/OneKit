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

## Defaults & privacy posture

- **On by default (memory only):** history indexing, clipboard history —
  both local, capped, deletable.
- **On by default (passive local stats):** history indexing, clipboard
  history, screen-time tracking.
- **Off by default (page-acting tools):** cookie reject, autoplay killer,
  text expander, paste cleaner, dictation, draft vault, AI Chat Vault,
  distraction blocker — every one is a plain toggle in Settings → Tools.
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
npm test               # vitest (141 tests)
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

- Optional encryption of the vault, cross-device sync (needs a server — later decision)
- Workspace rename/merge controls in the Speed tab
