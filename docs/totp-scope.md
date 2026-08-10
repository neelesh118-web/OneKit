# TOTP 2FA Authenticator — Detailed Scope

Status: **core shipped in the 68-tool round** (RFC 6238, otpauth paste + manual
secret entry, 30s countdown, copy, optional AES-GCM encryption at rest, all
unit-tested against the RFC vectors). This document scopes the full feature
including the one missing piece — **QR upload** — and the complete test plan.

## 1. What exists vs. what this scope adds

| Area | Status | Detail |
|---|---|---|
| RFC 6238 code generation | ✅ shipped | `totpAtTime()` — HMAC-SHA1 via WebCrypto, digits 4–10, period 30s (any period from URI) |
| Secret entry: paste `otpauth://` | ✅ shipped | `parseOtpauthUri()` — validates secret at parse time (bad base32 refused at add, not at code time) |
| Secret entry: manual base32 | ✅ shipped | Same validation path in the controller |
| Secret entry: **QR upload** | ✅ shipped (2026-08-10) | jsQR in a lazy chunk (`qr-decode-i3LCjJy8.js`, 130 KB) — file picker → canvas → decode → parse → add. See §2.3 |
| 30s countdown | ✅ shipped | 1s tick updates codes + `remaining`; codes regenerate each tick |
| Copy-to-clipboard | ✅ shipped | `caps.copyText` (clipboardWrite permission present) |
| Encryption at rest | ✅ shipped | PBKDF2-SHA256 → AES-256-GCM; passphrase set/clear/unlock + plaintext migration |
| Duplicate-paste guard | ✅ shipped | Same label+issuer+secret refused |
| Delete account | ✅ shipped | No confirmation (low stakes — regenerable from secret) |

## 2. Secret entry — three paths

### 2.1 Paste `otpauth://` link (shipped)
- Input accepts `otpauth://totp/Label?secret=…&issuer=…&digits=6&period=30`.
- `parseOtpauthUri` extracts label, issuer, secret, digits, period; the secret
  is base32-decoded at add time so a bad paste errors immediately with a
  plain-English reason ("Invalid base32 character…").
- UX: single input + "Add account"; label auto-filled from the URI; the manual
  label field is only needed for the raw-secret path.

### 2.2 Manual base32 secret (shipped)
- If the paste doesn't start with `otpauth://`, it's treated as a raw secret
  (spaces/dashes stripped, uppercased). Label comes from the label field.
- Same validation + duplicate guard.

### 2.3 QR upload (to build)
- **Why it matters:** most 2FA setups give you a QR code to scan; typing the
  secret is the common complaint. Uploading a screenshot is reliable; live
  camera scan in a popup is fragile (permission prompt steals focus and the
  popup can close) — so scope is **upload-first**, camera as a stretch goal.
- **Pipeline:** file input (`accept="image/*"`) → `createImageBitmap`/`<img>` →
  draw to a `<canvas>` (downscale to ≤1024px for speed) → `getImageData` →
  `jsQR(imageData.data, w, h)` → returns the decoded text (an `otpauth://`
  string) → feed through the existing `parseOtpauthUri` → same add flow.
- **Dependency:** `jsqr` (~110 KB minified, pure JS, no wasm, no network —
  fits the 100%-local rule). Add via npm, import only inside the scan handler
  so it stays out of the popup boot chunk (matches the lazy-converter pattern).
- **Honest refusals:** "No QR code found in that image", "That QR isn't a TOTP
  link (only otpauth://totp is supported)", "Image too small to read" (< 48px).
- **Stretch (not v1):** live camera via `getUserMedia` — requires the popup to
  stay open through the permission prompt, which Chrome doesn't guarantee;
  would move the scanner to the options/side panel if we want it.

## 3. 30s countdown — behavior spec (shipped)

- One interval (`setInterval`, 1s) in the controller re-renders every row's
  `<code>` and `remaining` from `totpAtTime(secret, now/1000, digits, period)`.
- Codes rotate at the period boundary (default 30s) — the `remaining` counter
  reaches 0 and the next tick shows the new code.
- A row whose secret fails to decode shows `invalid secret` inline (can only
  happen via manual tampering — add-time validation prevents it).
- The interval is cleared on controller teardown (`return () => …`).

## 4. Copy-to-clipboard (shipped)

- Per-row "Copy" button copies the currently displayed code via
  `navigator.clipboard.writeText` (clipboardWrite permission already granted).
- Status line confirms: "Copied GitHub code ✓".
- No auto-copy on click of the row itself (accidental-copy risk on a security
  surface) — deliberate.

## 5. Encryption at rest — spec (shipped)

| Item | Value |
|---|---|
| KDF | PBKDF2-SHA256, **150,000 iterations**, 16-byte random salt |
| Cipher | AES-256-GCM, 12-byte random IV per encryption |
| Stored | `ok.totp.meta` → `{ salt, verifier }`; `ok.totp.accounts` → array of `{ id, label, issuer, secret, digits, period, encrypted }` |
| Verifier | AES-GCM("ok") with the derived key — wrong passphrase fails decrypt, never a silent wrong-code |
| Key lifecycle | Derived on unlock, held in the controller closure **in memory only**; popup close = key gone = accounts locked again |
| Migration | `setTotpPassphrase` re-encrypts any existing plaintext secrets; `clearTotpPassphrase` (with confirm) returns them to plaintext |
| No passphrase | Secrets stored plaintext with an **honest warning** in the UI ("Heads-up: no passphrase is set…") — never a silent claim of security |
| Threat model | Local only, no sync, no export; secrets never leave the device. Passphrase protects against *other* local readers of storage.local, not against an attacker already inside the browser |

## 6. Storage schema

```ts
interface TotpAccount {
  id: string;            // "totp-<uuid>"
  label: string;         // "alice@gmail.com"
  issuer: string;        // "GitHub" ("" when from a raw secret)
  secret: string;        // base32 plaintext, OR base64(iv+cipher) when encrypted
  digits: number;        // 4–10 (from URI or default 6)
  period: number;        // seconds (from URI or default 30)
  encrypted: boolean;
}
interface TotpMeta { salt?: string; verifier?: string; }
```

## 7. UI layout (Popup → Safety)

```
🔐 TOTP 2FA authenticator
[Passphrase (encrypts secrets)] [Set] [Remove]      ← hidden once set+locked
[Enter passphrase to unlock] [Unlock]                ← shown when locked
[Label] [otpauth:// link or base32 secret] [Add]
[📷 Scan QR from image]                              ← NEW
── accounts ─────────────────────────────
GitHub — alice        | 6 digits · every 30s · encrypted
  287082  12s   [Copy] [Delete]
status: "Heads-up: no passphrase is set…" (plaintext mode)
```

## 8. Dependencies & bundle impact

- Add: `jsqr` (~110 KB minified). Imported dynamically inside the scan click
  handler so it lands in a lazy chunk, not the popup boot bundle.
- No other changes — WebCrypto (`crypto.subtle`) is a platform API, available
  in both the MV3 context and Node 24 for tests.

## 9. Edge cases & honest refusals

- Bad base32 secret → refused at parse/add with the exact bad character.
- Non-TOTP otpauth (hotp) → "Only otpauth://totp/ links are supported."
- Duplicate label+issuer+secret → "That account is already saved."
- Wrong passphrase → "Wrong passphrase." (verifier decrypt fails)
- Passphrase < 4 chars → refused at set.
- Corrupt encrypted blob → "Encrypted secret is corrupt." (never a crash)
- QR image without a code / wrong kind of QR → "No QR code found…"
- `chrome://` / internal pages — irrelevant here (no page dependency).
- Account list unreadable while locked → shows locked state, not garbage.

## 10. Test plan

### 10.1 Unit (vitest, node env — WebCrypto available in Node ≥ 19)
| # | Test | Status |
|---|---|---|
| 1 | RFC 6238 SHA-1 vectors, 8 digits (6 known `(time, code)` pairs) | ✅ passing |
| 2 | 6-digit variant + `remaining` seconds | ✅ passing |
| 3 | base32 decode: RFC secret → 20 bytes; spaces/dashes/lowercase tolerated | ✅ passing |
| 4 | base32: bad char + empty → honest errors | ✅ passing |
| 5 | otpauth parse: full URI → label/issuer/secret/digits/period | ✅ passing |
| 6 | otpauth: reject non-totp, missing secret, invalid secret | ✅ passing |
| 7 | add/list/remove in plaintext mode | ✅ passing |
| 8 | duplicate guard + invalid-secret refusal at add | ✅ passing |
| 9 | encryption: set → add(encrypted) → locked list hides secret → unlock → code still correct | ✅ passing |
| 10 | encryption: wrong passphrase refused; plaintext migration on set | ✅ passing |
| 11 | encryption: clear returns to plaintext | ✅ passing |
| **12** | QR decode: bundle a tiny known QR (generated with our own `qrcode-generator`) → jsQR round-trips to the otpauth URI → parse succeeds | ✅ passing (`qr-decode.test.ts`) |
| **13** | QR errors: blank/flat-color image → null; too-small image → null; non-TOTP QR decodes but `parseOtpauthUri` refuses | ✅ passing |

### 10.2 Integration (controller-level, fake caps)
| # | Test | Status |
|---|---|---|
| 14 | Ticking: `codesForAccounts` across a period boundary (new code, remaining resets; per-account periods; broken secret isolated) | ✅ passing (`totp.test.ts`) |
| 15 | Locked-state render: passphrase set, no key → "Enter passphrase" UI, no secrets shown; unlock with the right passphrase renders a live code; no-passphrase plaintext warning | ✅ passing (`totp-controller.test.ts`, jsdom) |

### 10.3 Manual browser (real popup)
1. Paste a real otpauth link (e.g. from GitHub settings) → code appears → matches the phone app.
2. Watch countdown hit 0 and rotate.
3. Set a 6-char passphrase → add account → close popup → reopen → locked → wrong passphrase refused → correct unlocks → code correct.
4. **QR:** open GitHub 2FA QR in an image → upload → account added with correct secret.
5. Duplicate-paste an account → refused.
6. Delete an account → gone after reopen.
7. Bundle check: popup boot chunk size before/after the QR scan is opened (jsQR must be lazy).

### 10.4 Release gate
`npx tsc --noEmit` clean → full `npm test` green → `npm run build` < 100 MiB →
zip refreshed → count stays 68.

## 11. Decisions & open questions

1. **QR = upload-first, camera = stretch.** Camera in a popup is unreliable
   (focus steal on the permission prompt). Confirmed scope for v1.
2. **jsQR over zbar.wasm** — pure JS, no wasm asset, small, well-maintained.
3. **No auto-copy on row click** — deliberate; copy is explicit.
4. **Passphrase optional, plaintext warned** — honest by default; forcing a
   passphrase would lock out users who lose it (no recovery — that's the
   honest cost of at-rest encryption).
5. **Open:** should QR decode live in `src/core/` (pure, takes `ImageData`)
   or in the controller? → Core: `decodeQrImage(imageData, width, height)`
   wrapping jsQR, so tests can feed synthetic images.
6. **Open:** per-account lock toggle? Not v1 — passphrase is global, matching
   every mainstream authenticator.
