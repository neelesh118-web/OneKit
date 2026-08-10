# OneKit Project Audit

**Audit date:** 2026-08-10 (Asia/Calcutta)  
**Repository:** `C:\Users\neele\D-Workspace\OneKit`  
**Snapshot:** current working tree, including uncommitted and untracked files  
**Audited by:** Codex static review plus local build, typecheck, test, dependency, manifest, and repository-structure checks

## Executive summary

OneKit has an unusually broad feature set for a browser extension and a healthy core design instinct: most domain logic lives in small TypeScript modules, browser capabilities are often injected into popup controllers, strict TypeScript options are enabled, security-sensitive storage uses WebCrypto, and 96 test files cover much of the core. The current snapshot nevertheless is **not release-ready**.

The most urgent issues are:

1. **Critical data-loss risk:** the advertised global backup/erase registry has drifted behind the product. It omits password vault data, TOTP accounts, secure notes, todos, habits, video-speed preferences, and related metadata. A user can believe a full backup protects these records when it does not.
2. **High supply-chain/file-processing risk:** direct dependency `xlsx@0.18.5` has high-severity prototype-pollution and ReDoS advisories. `npm audit` reports no automatic registry fix.
3. **High release-gate failure:** strict typechecking fails at `entrypoints/popup/main.ts:266`; therefore `npm run check` fails before tests or build.
4. **High test reliability problem:** both the normal Vitest run (2-minute limit) and a single-worker verbose run (5-minute limit) failed to complete. The latter reached PDF tests and emitted missing `standardFontDataUrl` warnings, but never produced a final result.
5. **High credential-integrity risk:** password master-password setup/change writes the new verifier metadata before the vault ciphertext is safely rewritten. A crash or quota/write failure between operations can make stored credentials inaccessible.
6. **Medium permission/privacy risk:** an always-on `<all_urls>` content script plus history, cookies, browsingData, downloads, bookmarks, tabCapture, and unlimited storage produces a very large privilege and privacy blast radius.
7. **Medium architecture/performance risk:** key integration modules are shallow and very large; the build emits a 3.32 MB converter chunk, 627 KB popup chunk, and a chunk-size warning.

**Overall assessment:** strong prototype / early product foundation, but release should be blocked until backup completeness, dependency risk, typecheck, and deterministic tests are addressed.

## Scope and method

Reviewed:

- 134 TypeScript/HTML/CSS source files, approximately 22,951 lines
- 96 Vitest files
- MV3/WXT configuration and generated Chrome manifest
- local-storage key registry and backup/restore behavior
- password, TOTP, secure-note, and chat-vault encryption paths
- runtime message handlers and content-script reach
- build output composition and bundle sizes
- dependency audit, documentation, repository hygiene, and release automation

Commands executed:

| Check | Result |
|---|---|
| `npm run check` | **Fail**: TypeScript error TS2769 at `entrypoints/popup/main.ts:266` |
| `npm test` | **Timeout** after ~124 seconds; no final result |
| `npx vitest run --maxWorkers=1 --reporter=verbose` | **Timeout** after ~303 seconds; no final result; PDF font-data warnings |
| `npm run build` | **Pass** in ~59 seconds; 20.69 MB output; oversized-chunk warning |
| `npm audit --json` | **Fail/risk**: 1 direct high-severity vulnerable package (`xlsx`) |

No source files were modified as part of the audit other than this report. The repository already had numerous modified and untracked feature files; findings describe that live snapshot.

## Findings

### F-01 — Global backup omits sensitive and newly added stores

**Severity:** Critical  
**Confidence:** Confirmed  
**Files:** `src/core/backup-restore.ts:12-37` and storage-bearing feature modules

The module states that `BACKUP_KEYS` contains “Every OneKit storage key that holds user data,” and `createBackup` only reads those keys. Static enumeration found at least these user-related keys absent from that registry:

- `ok.passwords`
- `ok.passwordsMeta`
- `ok.totp.accounts`
- `ok.totp.meta`
- `ok.secureNotes`
- `ok.todos`
- `ok.habits`
- `ok.videoSpeeds`
- `ok.focusAllowToday`
- `ok.focusPause`

This breaks both user expectations and the architectural claim that backup and erase-all share a complete registry. The omission is especially dangerous for password and TOTP records: users may remove the extension, migrate machines, or erase data after receiving an apparently successful backup.

**Recommendation:** make one typed storage catalog the authoritative interface for backup, restore, erase, classification (secret/non-secret), validation, and migrations. Add a test that extracts or imports every declared persistent key and fails whenever a user-data key lacks a catalog entry. Clearly distinguish a general backup from separately encrypted secret exports if secrets are intentionally excluded.

### F-02 — Vulnerable `xlsx` dependency processes untrusted files

**Severity:** High  
**Confidence:** Confirmed by `npm audit`  
**Files:** `package.json`, `package-lock.json`, converter document paths

`xlsx@0.18.5` is directly affected by:

- GHSA-4r6h-8v6p-xvw6: prototype pollution (`<0.19.3`)
- GHSA-5pgg-2g8v-p4x9: regular-expression denial of service (`<0.20.2`)

This is material because OneKit accepts user-selected spreadsheet files rather than merely generating trusted sheets. npm reports `fixAvailable: false` for the registry dependency.

**Recommendation:** block release pending a documented choice: replace the parser, obtain a maintained patched SheetJS distribution from its supported channel after license/provenance review, or isolate and constrain spreadsheet parsing. Add file-size, row/cell, string-length, and processing-time limits regardless of library choice.

### F-03 — The primary quality gate fails TypeScript

**Severity:** High  
**Confidence:** Confirmed  
**File:** `entrypoints/popup/main.ts:266-267`

`browser.runtime.getURL` is cast locally to `(path: string) => string`, but WXT's generated overload still rejects `"dictionary/words.json"` as a `PublicPath`. `npm run check` stops at this error, so the combined gate never reaches tests or build.

The nearby OCR path uses the same cast and currently passes because the callback shape crosses a different interface. The discrepancy suggests generated public-asset typing is stale or bypassed inconsistently.

**Recommendation:** fix asset declaration/generation rather than spreading casts. Ensure `public/dictionary/words.json` exists before WXT type generation, regenerate `.wxt` metadata in the normal prepare step, and use one typed asset-resolution adapter. Add a clean-clone verification that deletes generated state, prepares, typechecks, tests, and builds.

### F-04 — Test suite does not terminate reliably

**Severity:** High  
**Confidence:** Confirmed in two runs  
**Files:** `vitest.config.ts`, PDF/converter tests, possibly open handles in browser/media workers

The default run exceeded 124 seconds. A sequential single-worker verbose run exceeded 303 seconds and emitted PDF.js warnings about a missing `standardFontDataUrl`, without a final test summary. This prevents trustworthy pass/fail evidence and makes CI adoption difficult.

Potential causes include open worker/timer handles, heavyweight converter fixtures, jsdom/fork overhead across 96 files, and PDF.js setup. The audit did not attribute the hang to a single test, so that part remains diagnostic work rather than a confirmed root cause.

**Recommendation:** bisect test groups, enable per-test and hook timeouts, add handle/leak diagnostics, configure PDF.js standard font data, and separate fast unit tests from heavyweight converter integration tests. CI should enforce bounded jobs with machine-readable results.

### F-05 — Password re-encryption is not transaction-safe

**Severity:** High  
**Confidence:** Confirmed from control flow  
**File:** `src/core/passwords.ts:128-174`

`setMasterPassword` writes new metadata at line 134, then reads and encrypts the vault. `changeMasterPassword` writes new metadata at line 172, then writes ciphertext under the new key at line 173. If the second operation fails (quota, browser shutdown, serialization issue), metadata and ciphertext can refer to different keys. The old key may no longer be derivable from stored metadata.

The passphrase minimum of four characters is also too weak for a password manager, even with PBKDF2-SHA256 at 150,000 iterations. The blob records an `iterations` field, but key derivation uses the current constant rather than the blob's stored value, weakening forward migration compatibility.

**Recommendation:** implement a two-phase versioned envelope: fully prepare and verify new ciphertext, write a pending record, atomically promote a single envelope where feasible, then remove the old record. Preserve rollback material until promotion succeeds. Use the stored KDF parameters during decryption, raise password guidance/requirements, and consider a memory-hard KDF where platform constraints permit.

### F-06 — Privilege surface is very broad and always active

**Severity:** Medium  
**Confidence:** Confirmed  
**Files:** `wxt.config.ts:19-36`, generated manifest, `entrypoints/content.ts`

The extension requests 13 named permissions, `<all_urls>`, and injects a 104.91 KB built content script into every matched page. Features observe copied selections, can index page text, access page localStorage on command, archive complete page HTML, change page behavior, and fill credentials.

This may be functionally justified, but the combination increases impact if any extension context is compromised and increases store-review/user-trust friction. The claim “100% on-device” does not reduce the need for least privilege; the API tester and reader also intentionally make network requests.

**Recommendation:** classify capabilities by risk and activation model. Prefer optional host permissions and user-triggered injection for high-risk tools; keep passive content behavior minimal. Document exactly what runs by default, what page content is retained, and what can leave the device. Add sender/origin assertions to privileged runtime-message routes as defense in depth.

### F-07 — Integration modules are shallow and oversized

**Severity:** Medium  
**Confidence:** Confirmed  
**Files:** `entrypoints/content.ts` (~72 KB source), `entrypoints/popup/index.html` (~69 KB), popup controllers up to ~32 KB, `entrypoints/background.ts` (~22 KB)

Understanding one feature often requires moving across a core module, a popup controller, a large static HTML panel, capability wiring, and one of two monolithic message dispatchers. The interface exposed by these integration files is nearly as complex as their implementation. The deletion test indicates they are shallow: deleting them mostly moves event wiring and switch branches rather than concentrating a durable abstraction.

**Recommendation:** deepen modules around product capabilities. A tool module should own its manifest metadata, state schema, controller lifecycle, permissions, message contracts, and tests behind one small registration interface. Replace stringly typed message switches with a discriminated message catalog and handlers. This improves locality, enables lazy loading, and makes the interface the natural test surface.

### F-08 — Bundle composition will slow popup startup and distribution

**Severity:** Medium  
**Confidence:** Confirmed by production build  

Build facts:

- total unpacked output: 20.69 MB
- converter chunk: 3.32 MB
- popup chunk: 627.13 KB
- dictionary: 3.36 MB
- OCR assets: roughly 9.8 MB combined
- PDF worker: 2.38 MB
- WXT/Rollup chunk-size warning emitted

Large offline assets are compatible with the privacy promise, but the popup should not eagerly pay conversion/OCR/dictionary costs. The converter controller already uses some dynamic imports; output indicates more dependencies remain coalesced.

**Recommendation:** establish size budgets by entrypoint and feature. Lazy-load feature registries and heavyweight dependencies only after tab activation, split document/image/audio conversion families, and measure cold popup time on low-end hardware. Keep the offline assets, but avoid parsing/loading them until invoked.

### F-09 — General backup validation is shallow and its format is under-versioned

**Severity:** Medium  
**Confidence:** Confirmed  
**File:** `src/core/backup-restore.ts:50-83`

Most validators only check “array” or “object.” Malformed nested records can enter storage and fail later in feature code. `version` accepts any number not greater than 1, including negative or fractional values. There is no per-store schema version or migration path.

**Recommendation:** validate full shapes with size bounds, require an exact supported integer version, and introduce per-store schemas/migrations. Restore into a staged snapshot, validate cross-record invariants, then commit. Include malicious/oversized backup fixtures.

### F-10 — Release engineering and governance are missing

**Severity:** Medium  
**Confidence:** Confirmed from repository contents

No CI workflow, license file, security policy, contribution guide, changelog, release checklist, end-to-end suite, or store-package validation was found. The README is substantial, but it cannot replace enforceable release gates. Version remains `0.1.0` while the manifest advertises 77 tools.

**Recommendation:** add CI for clean install, generated metadata, typecheck, unit tests, bounded integration tests, build, dependency review, and extension smoke tests. Add `SECURITY.md`, an explicit license, data/privacy documentation, and reproducible packaged-extension checks.

### F-11 — The current worktree is not a reproducible review baseline

**Severity:** Medium  
**Confidence:** Confirmed by Git status

The audited tree contains many modified and untracked feature files, including password, TOTP, OCR, recorder, notes, todo, media, and asset changes. Build scripts copy files into `public/`, which further mixes generated and source-like assets. A future reviewer cannot reproduce this exact state from commit `ab08ebc` alone.

**Recommendation:** commit coherent feature slices, document generated assets, and ensure a clean checkout produces identical outputs. Do not combine security-sensitive vault work with unrelated media/OCR changes in one release unit.

### F-12 — Security-positive implementation details worth preserving

**Severity:** Positive observation

- strict TypeScript, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes` are enabled;
- AES-256-GCM uses fresh 12-byte IVs and random salts;
- master keys are held in popup memory rather than persisted;
- password filling is explicit and does not auto-submit;
- most UI rendering uses `textContent`/DOM construction rather than interpolated HTML;
- no `eval`, `new Function`, `@ts-ignore`, or `as any` was found in the reviewed source;
- backup restore refuses unknown top-level keys;
- the production MV3 build succeeds and assets are local.

These choices form a good base. Remediation should deepen and centralize them rather than replace them with a heavier framework by default.

## Architecture assessment

### Current shape

```text
Static popup HTML
  -> popup main capability object
     -> large category controllers
        -> many core feature modules

Background runtime switch <-> content runtime switch
  -> browser-wide permissions and page mutation

Independent storage constants
  -> partial backup registry
  -> feature-specific validators and crypto formats
```

### Top deepening opportunity: a typed tool/runtime registry

Create one deep module whose small interface registers a tool with:

- identity and display metadata;
- lazy controller loader;
- required/optional permissions;
- persistent-store descriptors and migrations;
- typed runtime messages and handlers;
- backup/erase policy;
- test entrypoints.

The goal is not more interfaces. It is one interface that hides today’s repeated wiring and prevents drift. This has high leverage: it addresses backup completeness, permission review, message typing, lazy loading, test discovery, and tool-count consistency together.

### Second deepening opportunity: a secrets-vault envelope

Chat vault, passwords, secure notes, and TOTP backup reuse crypto primitives but maintain separate state transitions and metadata conventions. Put versioned KDF parameters, transactional re-keying, validation, lock state, export, and migration behind one tested encrypted-envelope module. Keep domain payload schemas separate.

### Third deepening opportunity: converter isolation

Treat converters as independently lazy, resource-bounded adapters behind one conversion interface. Two or more format families already make this a real seam. This reduces popup bundle size and creates a place to enforce input limits and isolate risky parsers.

## Testing and quality strategy

Recommended layers:

1. **Fast core tests:** pure logic and storage adapters; target under 30 seconds.
2. **Browser-contract tests:** typed runtime messages, permissions, storage migrations, and content-script activation.
3. **Heavy converter tests:** serial/bounded job with explicit fixtures, memory/time budgets, and PDF font configuration.
4. **Packaged extension smoke tests:** load `.output/chrome-mv3`, open popup, activate every tab, verify content-script opt-in/out, and exercise backup round-trip.
5. **Security regression tests:** malicious spreadsheets/backups, wrong keys, interrupted re-key, oversized inputs, hostile page DOM, and sender validation.

Coverage percentage was not reported because the suite did not terminate and coverage is not configured. Test-file count alone must not be treated as coverage evidence.

## Prioritized remediation roadmap

### Release blockers (P0)

- Define and test a complete storage catalog; correct backup/restore/erase behavior and user-facing wording.
- Remove, replace, or safely isolate vulnerable `xlsx` parsing.
- Fix the WXT public-asset typing failure and make `npm run check` pass from a clean checkout.
- Make test execution deterministic and bounded; obtain an actual passing result.
- Make password setup/change transaction-safe and test interrupted writes.

### Before public beta (P1)

- Reduce default permissions and content-script activation where feasible.
- Introduce typed runtime-message contracts and sender assertions.
- Add CI, security policy, license, privacy/data-flow documentation, and packaged-extension smoke tests.
- Add schema versions, deep validation, size limits, and migrations for restored data.
- Establish popup and converter bundle budgets with lazy feature loading.

### Maintainability improvements (P2)

- Deepen the tool registry and secret-envelope modules.
- Split large content/background dispatchers by registered capability.
- Generate popup/tool metadata from a single source instead of maintaining tool counts and markup manually.
- Add ADRs for local-only guarantees, permission strategy, secret-storage behavior, and backup exclusions/inclusions.

## Release decision

**Recommendation: NO-GO for release from this snapshot.**

Minimum evidence to change this to GO:

- complete backup round-trip tests cover every persistent user store;
- no known high-severity vulnerable file parser remains in the shipped path;
- `npm run check` exits 0 on a clean checkout;
- unit/integration test jobs terminate within declared budgets and pass;
- password re-key failure tests prove old data remains recoverable;
- permission/privacy behavior is documented and reviewed.

## Verification appendix

### Git snapshot

- branch: `main`
- HEAD: `ab08ebc` — `Add 68-tool round (TOTP, privacy sweep, tab outline, habits, converters) + TOTP QR scanning`
- working tree: dirty, with numerous modified and untracked files

### Build output highlights

- Chrome MV3 production build: successful
- duration observed: ~59 seconds including asset copy
- total output: 20.69 MB
- warning: chunks larger than 500 KB

### Dependency audit highlights

- 344 total packages reported by npm audit metadata
- 1 high vulnerability, 0 critical
- vulnerable direct dependency: `xlsx`

### Limitations

- This was a static/local engineering audit, not a penetration test.
- No Chrome Web Store policy submission or cross-browser manual test was performed.
- No performance profile on real devices was captured.
- The non-terminating test suite prevented a verified pass count and coverage measurement.
- Findings apply to the live uncommitted snapshot observed on 2026-08-10.
