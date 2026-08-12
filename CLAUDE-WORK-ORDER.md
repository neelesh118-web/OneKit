# OneKit Converter Expansion — Claude Code Autonomous Worker Order (24 hours)

You are a senior engineer hired to expand OneKit's file converter's **media formats** (image, video, audio). You work **alone** in an isolated git worktree. No other agent or human will touch this tree while you work. You have **full authority**: run commands, install nothing beyond `npm install`, write code, run tests, commit, and push — with zero permission prompts. **Never stop to ask questions. Never wait. Never pause for review.** Work continuously for up to 24 hours, committing and pushing every batch so nothing is ever lost.

---

## 1. Mission

OneKit's converter currently supports **74 source formats → 763 conversion pairs**, all 100% local and dependency-light. Your mission: **add 2,000+ genuinely-working media conversion pairs** (image / video / audio) from your demand-ranked backlog — and keep going as long as you can honestly build more. Every pair real, tested, and verified.

You are the **only** engineer for your domain. If the machine restarts, resume where your last commit left off.

## 2. Where you are

- **Worktree (your repo):** `C:\Users\neele\D-Workspace\OneKit-claude-converters`
  - Branch: `claude/converter-round`
  - This is a git worktree of the OneKit repo — `git` commands work normally here.
- **Backlog (your task list):** `docs/converter-backlog.csv` inside this worktree
  - **6,928 rows — YOUR EXCLUSIVE DOMAIN.** Your families: `image` (3,587), `video` (2,402), `audio` (939). A parallel agent on a separate branch owns documents/office/ebooks/vectors — **do NOT add document, office, ebook, spreadsheet, presentation, or vector sources/targets**; you'd only collide with its branch and make the merge painful.
  - Columns: `rank, from, to, pair, tier, evidence, monthly_search_volume, region, category_from, category_to, conversion_kind, source_url`
  - Higher rank = higher demand. Build the top of the list first.
  - Rows where `from` or `to` is `*` are generic keywords — they were already dropped from your file.

## 3. First steps (do these immediately)

1. `cd C:\Users\neele\D-Workspace\OneKit-claude-converters`
2. `npm install` (the worktree is a fresh checkout — no node_modules yet)
3. `npx tsc --noEmit` and `npx vitest run` — confirm the baseline is green (1,177+ tests must stay green for the whole run; you must never break a working pair).
4. Read the architecture files in §5 before writing anything.
5. Commit the backlog file so it's versioned: `git add docs/converter-backlog.csv && git commit -m "Add media converter backlog (6,928 demand-ranked pairs)" && git push origin claude/converter-round`

## 4. Hard constraints (non-negotiable)

1. **100% local.** Every conversion runs on-device in TypeScript. No cloud services, no API calls, no remote code, no `fetch` of external resources.
2. **The Honesty Rule.** Every pair you add to the matrix must actually convert real bytes into valid output. **NO stubs, NO placeholders, NO "returns input unchanged" hacks, NO empty outputs.** If a format genuinely cannot be parsed or written locally in pure TS, do **not** add the pair — instead write one line in the progress doc (§8) explaining why, and move on. An honest "not feasible locally" beats a fake pair every time. This is the single most important rule — and it matters extra in media, where proprietary codecs (HEIC, PSD, RAW, HEVC, AV1) are common.
3. **Dependency discipline.** Prefer pure TypeScript written by you (~100–300 lines per format family). Already available in `package.json`: `fflate`, `fast-xml-parser`, `pdf-lib`, `mammoth`, `lamejs` (`@breezystack/lamejs`), plus existing in-repo encoders (FLAC, Ogg-FLAC muxer, MP3-in-MP4 muxer, MIDI synth, TIFF/DDS/ICO raster, GIF encoder/decoder). Browser primitives (canvas, WebAudio, `<video>`) are available at runtime via injectable deps — see §5. You may add **one** small pure-TS package only if a feature is impossible without it — and only after trying. Document any new dependency in the commit message.
4. **No scope creep.** Do not touch `entrypoints/`, `src/popup/`, `wxt.config.ts`, `package.json` (version stays `1.0.0`), or `README.md`. Your world is `src/core/converter/**` + `tests/converter-*.test.ts` + `docs/CONVERTER-EXPANSION-PROGRESS.md`.
5. **Don't break anything.** All existing pairs and tests must keep passing. Never delete or weaken an existing converter.
6. **Autonomy.** You will not receive messages for 24 hours. Work without asking.

## 5. Architecture — read these files first

| File | Role |
|---|---|
| `src/core/converter/detect.ts` | `FileType` union, `TYPE_LABELS`, `EXTENSIONS` (name→type), `detectFromBytes` (magic bytes). **Add every new source format here**: union member, label, extensions, magic sniff. |
| `src/core/converter/matrix.ts` | **The source of truth.** `TargetFormat` union, `TARGET_LABELS`, `targetExtension()`, and `MATRIX` (source → array of targets). The Convert tab renders from this. Every entry you add here MUST have a working code path. Note: `targetExtension()` must be unique per target — two targets returning the same extension (e.g. `audio-mp4` vs `video-mp4`) is a real collision; when you add a target, verify it. |
| `src/core/converter/convert.ts` | The dispatcher: `runConversion(source, target, bytes, opts)` + `MIME_BY_TARGET`. Wire every new source and every new target here. Browser-dependent work (canvas, WebAudio, video) goes through injectable deps (`opts.audioDecoder`, `opts.video`, `opts.videoFrames`, `opts.videoAudio`, `opts.canvas`) so your tests run in Node with fakes. |
| `src/core/converter/audio.ts` | WAV parse/encode, WAV→MP3 (lamejs), Ogg-FLAC, MP3-in-MP4, decoder injection. `parseWav`, `samplesToWav`, `wavToMp3`, `wavToFlac`, `wavToAiff`, `wavToOgg`, `wavToMp4`, `anyToWav/Mp3/Flac/Ogg/Mp4`. |
| `src/core/converter/{ogg,mp4,midi,aiff,flac}.ts` | Audio format modules — Ogg-FLAC muxer, MP3-in-MP4 muxer, MIDI synth + SMF parser, AIFF, FLAC. |
| `src/core/converter/{images,gif,gif-decode,raster,dds}.ts` | Image pipeline: canvas conversions (injectable), pure-TS raster codecs (TIFF/DDS/ICO/BMP), GIF encode/decode, frame ops. |
| `src/core/converter/video.ts` | Video → GIF / images / audio via `<video>` + MediaRecorder (injectable deps for Node tests). |
| `src/core/converter/{pdf,documents,util,crc}.ts` | Shared helpers. PDF (pdf-lib) is useful for images → PDF (already exists) — the parallel agent owns pure-document work, but media → PDF stays in your domain. |
| `tests/converter-*.test.ts` | Vitest suites (node environment). Follow the existing style: tiny fixtures, magic-byte assertions, round-trips, honest errors on garbage input. Existing audio tests show the injected-decoder pattern. |

The target list is `TargetFormat`; sources are `FileType`. Note the `txt-base64`/`txt-hex`/`txt-url` targets are auto-provided for any source via the global raw-encode path — don't add those manually, they're free.

## 6. The batch loop (repeat every ~45–60 min, ~20–50 pairs per batch)

For each batch:

1. **Pick** the next highest-rank/volume pairs from `docs/converter-backlog.csv` that you can build honestly. Prefer whole format families (a new source unlocks 8+ targets at once — that's how the count climbs fast).
2. **Implement** in this order: `detect.ts` (type + extension + magic) → `matrix.ts` (row + labels + `targetExtension`) → the real converter function(s) in the right module → `convert.ts` (dispatch + MIME).
3. **Test** — write tests for every new pair in `tests/converter-new.test.ts` or `tests/converter-batch-N.test.ts`: output magic bytes, structural checks, round-trips where possible, honest failure on garbage. Use injected deps for browser-only paths so tests run in Node.
4. **Verify**: `npx tsc --noEmit` AND `npx vitest run` — both must pass completely.
5. **Commit + push** — commit message format: `Add media converter batch N: <families> (X new pairs, P total)`. Push `origin claude/converter-round` after every batch.
6. **Log** your progress in `docs/CONVERTER-EXPANSION-PROGRESS.md` (see §8).

## 7. Priority guidance (build these first — they're what users search most in media)

- **Audio family (easiest wins):** more audio **sources** you can genuinely parse in pure TS (e.g. MOD, VOC, WMA — only if you can really parse them; many are NOT feasible — mark honestly); more audio **targets**: OPUS (only if a pure-TS encoder is feasible — otherwise skip honestly), audio → video containers where honest. Every new audio source unlocks WAV/MP3/FLAC/AIFF/OGG/M4A (+ Base64/Hex) automatically via the existing pipeline.
- **Image family (biggest volume):** PNG/JPEG/WebP/GIF/BMP/AVIF/TIFF/ICO/DDS → more raster targets; multi-image → one PDF (exists — extend), one image → PDF (exists); TIFF multi-page read/write; GIF frame extraction / frame-rate conversion; images → Base64/Hex already free. **HEIC/PSD/CR2/DNG/NEF/RAW: proprietary — only add if you find a genuinely local decoder; otherwise one honest line in the progress doc.**
- **Video family:** MP4/WebM/MOV → GIF / PNG / JPEG / MP3 / WAV / FLAC / AIFF (exist — verify each and extend where honest); video → M4A/OGG audio (wiring exists — reuse). New video targets (e.g. MP4 container muxing of image sequences) only if a pure-TS muxer is feasible. **HEVC/AV1/H.264 encoding: not feasible in pure TS — honest skip.**
- **Cross-media (your domain only):** images → audio? No. Keep media → media, plus media → document targets only where the parallel agent's code is already reused (e.g. images → PDF).

When in doubt between two families, pick the one with higher combined search volume in the CSV.

## 8. Progress doc

Keep `docs/CONVERTER-EXPANSION-PROGRESS.md` current, appending after each batch:

- Batch number, date/time, formats added, pairs added, running pair total, test count
- One line per **honestly skipped** format family and why (e.g. "HEIC: no pure-TS decoder, proprietary — skipped")
- Any new dependency added and why

## 9. Definition of done

- Work continuously for up to **24 hours**, or until you've honestly exhausted the buildable media backlog — whichever comes first.
- Every batch pushed as you go (uncommitted work is lost work — never accumulate it).
- Final state: `npx tsc --noEmit` clean, full `npx vitest run` green, `npm run build` green, progress doc complete.
- Final commit message includes: pairs before → after, formats added, total tests passing, and the honest skip list summary.
- Final push of `claude/converter-round` to origin, and a short `git log` summary written into `docs/CONVERTER-EXPANSION-PROGRESS.md`'s last section.

## 10. What a good run looks like

- 763 → **2,700+ pairs** (your 2,000 target, plus whatever else you honestly build)
- Every new pair has a passing test with real magic-byte assertions
- Zero stubs — the progress doc is your honest ledger of what was skipped and why
- `main` untouched; all work on `claude/converter-round` for easy review/merge

Go. You are the only engineer in your domain. Build.
