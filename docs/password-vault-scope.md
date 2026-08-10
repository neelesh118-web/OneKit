# Local Password Vault — Deep Dive

Question on the table: master-password flow, AES-GCM storage format, autofill
strategy, recovery story — and is it worth the size vs the TOTP feature?

**Short verdict: build it only in a deliberately minimal, honest form
(vault + one-click fill from the popup), reusing the already-shipped
`vault-crypto.ts`. Do NOT try to be a Chrome/Bitwarden replacement. TOTP was
the right call first; this is a good 69th tool, not a headline.**

## 0. What OneKit already has (the head start)

| Asset | Where | Reusable? |
|---|---|---|
| PBKDF2-SHA256 (150k iters) → AES-256-GCM whole-blob encryption | `src/core/vault-crypto.ts` (ships today, powers the AI chat vault) | ✅ **Zero new crypto code** — same KDF params, same blob format |
| Key-in-memory session pattern (unlock → key held in controller closure → popup close = locked) | `src/core/totp.ts` + safety-controller | ✅ Copy the flow wholesale |
| Password generator + strength estimator | `src/core/password-gen.ts` | ✅ Reuse for "Generate" in the add/edit form |
| Content-script message + toast infrastructure | `entrypoints/content.ts` | ✅ Reuse for the fill handler |
| Fill-on-click precedent (contact card, never auto-fills) | `src/core/autofill.ts` | ✅ Same honesty posture: fill only on explicit click |

## 1. Master-password flow

- **First use:** "Set master password" (min 8 chars, show strength via the
  existing estimator, no hint field — hints are a leak vector). Derive key →
  encrypt an empty vault blob → store. The password itself is never stored.
- **Unlock:** enter password → decrypt blob → keep **plaintext vault + key in
  memory only** (controller closure). Wrong password → AES-GCM throws → "Wrong
  master password." No distinguish between "wrong password" and "corrupt blob"
  beyond the message the crypto layer gives.
- **Lock:** popup close = memory gone = locked again (same as TOTP). Add an
  explicit "🔒 Lock now" button and a timeout (e.g. 5 min idle) for when the
  popup stays open.
- **Change master password:** decrypt with old → re-encrypt with new. Requires
  being unlocked; changing is itself a credential-bound operation.
- **Remove protection** (user choice, with a confirm): plaintext vault with the
  same honest warning TOTP uses. Never silent.

## 2. AES-GCM storage format

**Whole-blob (not per-entry), reusing `vault-crypto.ts` verbatim:**

```
storage.local["ok.passwords"] = {
  kdf: "pbkdf2", iterations: 150_000, salt: b64, iv: b64,
  ciphertext: b64( AES-GCM( JSON.stringify({
    version: 1,
    entries: [{
      id: "pw-<uuid>",
      site: "github.com",          // hostname, normalized lowercase
      username: "alice",
      password: "…",
      notes: "",                   // optional
      createdAt: 1754…, updatedAt: 1754…
    }]
  }) ) )
}
```

Why whole-blob over per-entry (TOTP-style)?
- Vaults are tiny (< 1 MB); decrypt-on-unlock is instant.
- One atomic write = no partial-write corruption across entries.
- The blob format + KDF already have tests in the AI vault.
- Per-entry would only win if we wanted to add/edit entries while *locked* —
  which we deliberately don't (see §5).

## 3. Autofill strategy — the crux

This is where password managers live or die, and where honest scoping matters.

**The hard truth:** Chrome-like auto-fill requires the decrypted key to exist
when the user is *not* looking at the popup. MV3 service workers are evicted
after ~30 s idle, so the key cannot reliably live there; parking a decrypted
key in a long-lived offscreen document is a real security smell. We will not
do that.

**V1 — popup-only one-click fill (recommended):**
1. User opens OneKit → Safety/Vault → unlocks → sees entries.
2. On a login page: open the vault, click "Fill this page" on the matching
   entry.
3. Popup sends `{ type: "ok:vault-fill", username, password }` to the active
   tab's content script; the script finds the username + password fields,
   sets values via the native setter + `input`/`change` events (so React/Vue
   forms register the change), and toasts "Filled github.com — check the
   fields before submitting."
4. **Never auto-submit.** Never fill without an explicit click. Match the
   entry to the page's origin and say so ("github.com" vs "github.com").
5. Key lives only in popup memory; nothing persists between popup opens.

**Explicitly out of v1:** auto-fill on page load, one-click submit, "offer to
save password" prompts on signup forms, synced vaults, OS keychain.

**Subdomain honesty:** a `github.com` entry fills `gist.github.com`? Only with
an explicit "includes subdomains" flag per entry, default off. Getting this
wrong is a credential-leak vector — the one place we refuse convenience.

## 4. Recovery story

**Honest answer: there is none, by design.** At-rest encryption with a master
password has no backdoor, and adding one (security questions, emailed codes)
would be a fake recovery that weakens the whole model.

The mitigations we *can* offer:
1. **Encrypted backup export:** one blob (`ok.passwords` as a `.onekitpw`
   file), restorable from the vault screen, protected by the same master
   password. Copy it to a USB/drive. This is the real recovery story.
2. **Setup warnings:** "Write this password down. OneKit cannot recover it —
   losing it means losing the vault." (Same stance `vault-crypto.ts` already
   documents for the AI vault.)
3. **Import:** from the backup blob only (no CSV import in v1 — CSV imports
   are where mis-mapping and leaks happen; keep the surface small).

## 5. Threat model & liability (why the scope is intentionally small)

- Protects against other local readers of `storage.local` — same claim as
  TOTP, same honesty: not against malware already inside the browser.
- The plaintext password must cross into the page's content script to fill —
  unavoidable, same as every password manager. It is **never logged**.
- Biggest liability is a *wrong-site fill* (credential leak) or a *broken
  fill that silently does nothing* (user thinks they're logged in but aren't).
  The scope answers both: origin-matched + explicit click + "check before
  submitting" toast. A mis-fill can still happen if a site has a second
  username field — the content script fills the *first* username field and
  the *last* password field, and says which one it filled.

## 6. Size estimate

| Piece | Lines (rough) | Notes |
|---|---|---|
| `src/core/passwords.ts` (CRUD, search, site-match, backup export/import, plaintext flag) | ~180 | Pure + testable, mirrors `totp.ts`/`chat-vault` style |
| Reuse `vault-crypto.ts` | 0 | Already shipped + tested |
| Content-script `ok:vault-fill` handler | ~70 | Native-setter fill, field detection, toast |
| Controller section (set/unlock/lock, list, add/edit/delete, generate, fill, export/import) | ~220 | Mirrors TOTP section |
| HTML block + CSS | ~40 | |
| Tests | ~200 | See §7 |
| **Total** | **~700 + tests** | ≈ same size as the TOTP round (~1–2 days) |

## 7. Test plan

**Unit (node env, WebCrypto):**
1. Blob round-trip: encrypt → decrypt → identical entries (reuses the vault-crypto tests' approach).
2. Wrong master password → throws; corrupt blob → throws.
3. CRUD: add/update/delete, dedupe same site+username, notes kept.
4. Site matching: exact host, `www.` stripping, subdomain flag off/on, port handling.
5. Backup export → import round-trip; import rejects a blob for a different kdf/format.
6. Change master password: old password stops working, new one works.
7. Plaintext mode flag + warning-state helper.

**Integration:** unlock → locked render (no entries shown without key).

**Manual browser:**
1. Set master → add GitHub entry → close popup → reopen → locked → unlock → fill on github.com → toast → fields populated → login works.
2. Wrong password → honest error, no partial state.
3. Fill on a React form (e.g. a GitHub login) — events fire, the form accepts it.
4. Export → wipe → import → vault back.
5. Idle timeout locks the popup.

## 8. Is it worth the size vs TOTP? — the honest comparison

| | TOTP (built) | Password vault (proposed) |
|---|---|---|
| Demand | **Unique gap** — Chrome removed its authenticator, MS retired its extension | Huge, but **saturated** — Chrome built-in + Bitwarden (free) + KeePass |
| Competition bar | No free built-in equivalent | Chrome's is invisible/zero-effort; Bitwarden is free + syncs |
| Autofill complexity | None (codes are transient) | **The killer** — expectation gap (users expect Chrome-like auto-fill) we can't meet without a persistent key |
| Liability | Codes can't leak credentials | Wrong-site fill = credential leak |
| What we'd build | — | A *less* capable Bitwarden, honestly scoped |

**Verdict:** TOTP was the right call — it's the one with a genuine, currently-
unmet, zero-liability niche. A password vault is **worth building as a
minimal 69th tool** (it reuses shipped crypto, adds real breadth for the store
listing, and the popup-only-fill scope keeps the liability honest), but it is
**not a headline feature** and should never promise Chrome-like autofill.

**If you want more value per hour instead:** the stronger next moves are
(a) TOTP **backup/export** (same crypto, zero liability, closes the #1
authenticator complaint — phone lost = accounts locked), or (b) a **passkey
latch** (see the OneKit 2026 feature list). Both outrank a vault on
value-per-size.
