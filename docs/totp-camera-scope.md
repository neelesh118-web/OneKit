# Live-Camera TOTP Scanner — Scope

Question: getUserMedia in an extension page, focus-steal handling, and does it
belong in the side panel instead of the popup?

**Verdict up front: yes — the live scanner belongs in the side panel, and the
popup keeps its (already-shipped) file-upload scan. A live camera in the
popup is fundamentally unreliable because of how Chrome handles the media
permission prompt.**

## 1. The core problem — grounded in how Chrome actually behaves

- **Popups die on focus loss.** An extension popup closes the moment it loses
  focus (click outside, tab switch, *any* browser-level prompt). This is
  documented behavior, not folklore — the Chromium issue tracker
  (issues.chromium.org/40058873) describes the exact trap: *"if we call
  getUserMedia() after extension popup is opened, the permission prompt is
  not shown until extension popup closes"* — and the classic
  `NotAllowedError: …due to shutdown` stack-overflow reports are this same
  failure. The first camera prompt therefore closes the popup before the
  user can grant anything.
- **Side panels persist.** The `chrome.sidePanel` docs: *"The side panel
  remains open when navigating between tabs"* — and it stays open through
  focus loss and permission prompts (it blurs, but doesn't close). That is
  the whole difference.
- **No manifest permission is needed** for `navigator.mediaDevices.getUserMedia`
  inside an extension page (popup/options/side panel). Extension pages are
  secure contexts; the camera is gated by Chrome's per-origin permission
  prompt, the same as any website. (`videoCapture` in the manifest is for
  other contexts and would only add an install warning — we don't want it.)

## 2. Surface comparison

| Surface | Survives the permission prompt? | Live preview usable? | Verdict |
|---|---|---|---|
| **Popup** | ❌ closes on the prompt (and on any focus loss) | Small, awkward to aim a phone at | Not viable without a pre-grant step; keep upload-only |
| **Side panel** | ✅ stays open (blurs, doesn't close) | Reasonable docked width; user's hands are free | ✅ **Primary live-scan surface** |
| Options page | ✅ stays open | Yes, but buried in settings | Fallback if the panel isn't open |
| Full tab (own URL) | ✅ stays open | Yes, largest | Heavy UX — navigates away; only for a "scan in a tab" stretch |
| Offscreen document | n/a — no visible UI | Can capture but can't show the feed | Not useful for an interactive scanner |

## 3. Focus-steal handling playbook

1. **Pre-grant ("Enable camera") step.** The panel shows a **"Enable camera"
   button** that calls `getUserMedia` once and immediately stops the stream.
   The user grants the permission here; from then on the extension origin
   has a persistent camera grant, so later "Scan" clicks never prompt again
   and never risk losing the panel. If the grant was denied, show the honest
   path: *"Camera permission was denied — use Scan from image instead."*
   (Chrome persists media grants per origin; verify persistence for the
   `chrome-extension://` origin in the real build.)
2. **Stream lifecycle.** `Scan` → `getUserMedia({ video: { facingMode:
   "environment" } })` → live `<video>` preview with a drawn scanning frame
   → decode loop → on a successful TOTP decode: **stop all tracks
   immediately**, feed `parseOtpauthUri` → add account → toast. "Stop" /
   panel close / `visibilitychange` all stop the tracks (never leave the
   camera LED on).
3. **Blur is harmless in the panel.** Because the panel doesn't close on
   blur, a stray click just blurs the panel; the scanner keeps running and
   resumes on focus. (In a popup this would be fatal — another reason for
   the panel.)
4. **Error mapping (honest messages):**
   - `NotAllowedError` → "Camera permission was denied. Use Scan from image instead."
   - `NotFoundError` → "No camera found on this device — use Scan from image."
   - `NotReadableError` → "The camera is in use by another app."
   - `OverconstrainedError` → "No suitable camera — fall back to the rear camera, then to image upload."
   - Timeout (no QR found in ~45s) → auto-stop, "No QR code found — hold the code still, or use Scan from image."

## 4. Scanner design (reusable, testable)

New `src/core/qr-scanner.ts` — a **state machine, not a DOM blob**, so the
loop is unit-testable with injected pieces:

```
startScan({ getVideoFrame, decode, throttleMs, onResult, onError, stopSignal })
  → { stop(), state }            // state: "idle" | "starting" | "scanning" | "found" | "error" | "stopped"
```

- `getVideoFrame(canvas)` draws the current video frame → returns
  `ImageData` (injected; the real impl uses a `<video>` + canvas).
- `decode` is the existing `decodeQrImage` (already tested + lazy-chunked).
- Throttled: decode at most every 250 ms (jsQR on 1280 px is ~10–30 ms —
  plenty of headroom; no need to decode every frame).
- The loop uses `requestAnimationFrame` (injected, so tests can drive frames
  synchronously without a real camera).
- The side panel's scanner card wires: video element, canvas (offscreen),
  status line, "Stop" button, and the fallback "Scan from image" link.

The popup keeps the existing file-upload scan only — no camera path there,
so the popup's one-second-open UX never touches the permission system.

## 5. Where it lives in the side panel

New "📷 Scan 2FA QR" card in `sidepanel/index.html`, above the tab outline:

```
┌─ 📷 Scan 2FA QR ──────────────────────────┐
│ [🎥 Enable camera]  (once, pre-grants)     │
│ ┌───────────────────────────────────┐      │
│ │      live camera preview          │      │
│ │      with scan-frame overlay      │      │
│ └───────────────────────────────────┘      │
│ status: "Hold the QR code steady…"         │
│ [Stop] · fallback: Scan from image ↗       │
└────────────────────────────────────────────┘
```

Manifest: **no new permissions** (camera is prompt-gated in extension pages;
nothing to declare).

## 6. Privacy & security notes

- The camera feed never leaves the device; frames are decoded in-memory and
  discarded — nothing is recorded or uploaded.
- The decoded otpauth URI goes through the exact same
  `parseOtpauthUri` → `addTotpAccount` path as paste/upload (validation,
  duplicate guard, at-rest encryption all apply).
- Tracks always stop on: successful decode, Stop, panel close,
  `visibilitychange` (panel hidden), or the 45s timeout.

## 7. Test plan

**Unit (`qr-scanner.test.ts`, jsdom + injected frames):**
1. State machine: idle → starting → scanning → found (fake frame that the
   injected decode "sees" a TOTP URI in) → stops and returns the URI.
2. Throttling: with a fast fake clock, decode is called at most once per
   `throttleMs`.
3. `stop()` from any state → tracks stopped, state "stopped", no further
   decode calls.
4. Decode returns null for N frames → stays "scanning" (no premature stop).
5. Error path: `getVideoFrame` throws → state "error", honest message.

**Controller/panel:** side-panel scanner card wiring (ids present, Start/Stop
toggle, status text states) — same jsdom approach as `totp-controller.test.ts`.

**Manual browser matrix:**
1. Side panel → Enable camera → grant → Scan → hold a real GitHub 2FA QR →
   account added, code matches the phone app.
2. Re-open the panel → Scan without any prompt (grant persisted?).
3. Deny camera → honest message + image-upload fallback still works.
4. Close the panel mid-scan → camera LED off (tracks stopped).
5. Popup unchanged: open popup → still instant, upload scan works, no camera
   prompt ever.

## 8. Open questions / risks

1. **Grant persistence for the `chrome-extension://` origin** — Chrome
   persists media grants per origin for web pages; extension origins
   *should* behave the same, but the pre-grant flow is designed so that even
   if the grant is one-shot, the worst case is one extra prompt in the
   (persistent) panel — never a lost popup. Verify in the real build.
2. **facingMode "environment"** — on desktops this maps to the webcam; the
   scanner should fall back to `{ video: true }` when the constraint fails.
3. **Camera choice** — multiple cameras: list via `enumerateDevices()` and
   offer a switch only if it's free (v1 can skip this; most desktop users
   have one webcam).
4. **Torch/flash** — `applyConstraints({ advanced: [{ torch: true }] })` is
   Android-only and flaky; explicitly out of scope.

## 9. Size estimate

| Piece | Lines (rough) |
|---|---|
| `src/core/qr-scanner.ts` (state machine + throttle) | ~140 |
| `tests/qr-scanner.test.ts` | ~150 |
| Side-panel card HTML + controller wiring | ~120 |
| Reuse `decodeQrImage` + `parseOtpauthUri` + `addTotpAccount` | 0 |
| **Total** | **~410 + tests** (~1 day) |
