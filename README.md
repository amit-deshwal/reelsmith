# Reelsmith

A personal, Mac-first, local-first AI editor for **Instagram Reels**, built on top of **[OpenChatCut](https://github.com/0xsline/OpenChatCut)**.

> Workflow: **browse visual recipes → import footage → choose a recipe → AI assembles the reel → request changes in chat → preview → export a 1080×1920 MP4**

- **Base:** fork of OpenChatCut `v0.2.17` (commit `72ddb330`, 2026-10-15), with full upstream history kept. The upstream README is in [`UPSTREAM_README.md`](UPSTREAM_README.md).
- **License:** OpenChatCut is AGPL-3.0, and this fork inherits it. The repo is **private, for personal use**. Re-check AGPL obligations before ever offering it to others as a network service or distributing builds.
- **Inspiration:** the public feature set of Cardboard (cardboard.ai). This project is independent: do not copy Cardboard's code, file formats, branding, recipe names, preview media or text.
- **Planning docs:** [`reelsmith-docs/plan/`](reelsmith-docs/plan/README.md) holds the full spec (`cardboardrebuild.txt`), the feature inventory, research notes, diagrams, JSON schemas and the 5 example recipes. The spec was written for a from-scratch build. Wherever OpenChatCut already solves something differently, **OpenChatCut's design wins** unless this README says otherwise. Use the spec's acceptance criteria, recipe format and export checks as the reference.

---

## Quick start (developer)

```bash
# Node 24.x is required (package.json engines ">=24 <25"; .nvmrc = 24). The Mac currently has Node 25.
brew install fnm && fnm install 24 && fnm use 24    # or nvm/volta
npm install
cp .env.example .env.local      # add only the keys you actually use; none are needed for local editing
npm run desktop:dev             # Electron app (or: npm run dev → http://localhost:5199)
```

Agents use your own subscriptions; the app never touches credentials:
- **Claude:** the built-in agent spawns your own `claude -p` (see `server/claude-code/turn-runner.ts`). You can also connect Claude Code from a terminal: `claude mcp add --transport http openchatcut http://localhost:5199/api/external-mcp/mcp`
- **Codex:** Settings → Agent model → OpenAI · Codex. This uses the official Codex CLI ≥ 0.146 and its own credential storage.

Tests: `npm test` (runs `scripts/run-tests.mjs`; *.verify.ts files) and `npm run verify:affected`.

## Keeping in sync with upstream

```bash
git fetch upstream
git merge upstream/main          # or rebase our branch onto it
# README.md conflicts: keep ours (upstream's lives in UPSTREAM_README.md)
```

Rules to keep merges cheap:
1. Put new code in **our own folders** wherever possible: `src/reelsmith/`, `server/reelsmith/`, `shared/reelsmith/`, `recipes/`, and new skills under `src/agent/skills/reels-*`.
2. Touch upstream files only at **thin hook points**: register a panel, add a route, add a tool to the catalog. Keep each hook to a few lines.
3. Record every upstream file you modify in [`reelsmith-docs/UPSTREAM_PATCHES.md`](reelsmith-docs/UPSTREAM_PATCHES.md).

---

## What OpenChatCut already gives us (verify in M0)

These were **located in the code** during a read-only review on 2026-10-15. How well they work is **not yet verified**. M0 confirms each one.

| Area | Where it lives (starting points) |
|---|---|
| Electron desktop app, local projects, multitrack timeline, undo/redo | `desktop/`, `src/editor/`, `src/components/timeline/` |
| Agent: built-in loop plus external MCP **edit sessions** (draft → review → atomic undo step) | `src/agent/`, `server/external-agent/`, `server/agent-runs/` |
| Claude Code via `claude -p --restricted` with editor-only MCP tools; Codex via the official CLI | `server/claude-code/`, `server/plugins/codex-agent.ts` |
| Local transcription (whisper.cpp), word-level transcript, text-based cuts, captions + presets, SRT | `desktop/native-asr-*`, `src/transcript/`, `src/captions/` |
| Beats/downbeats (beat_this ONNX), music intelligence, beat tools | `desktop/native-rhythm-*`, `src/audio/beats.ts`, `src/agent/tools/beat-tools.ts` |
| Semantic search (CLAP + sqlite-vec), scene detection | `desktop/native-semantic-*`, `src/media/semantic-search/`, `src/agent/tools/scene-detection-tools.ts` |
| Reframe, person segmentation, face-safe zones (MediaPipe) | `src/reframe/`, `src/geometry/`, `src/tracking/` |
| Transitions, WebGL effects, LUTs, keyframes, motion-graphics templates | `src/gl/`, `src/color/`, `src/library/TemplateBrowser.tsx` |
| Loudness tools, ducking, audio fades | `src/agent/tools/loudness-tools.ts`, `src/agent/tools/track-tools.ts` |
| Export: Remotion render, VideoToolbox H.264, export QA, FCPXML | `remotion/`, `src/export/`, `server/plugins/export-*.ts`, `src/agent/tools/export-qa-tools.ts` |
| Skills / "creative modes" incl. `multi-clips-to-reels`, `beat-sync-montage` | `src/agent/skills/`, `src/library/SkillsTabPanel.tsx` |

---

## Features we need to add

Legend: **NEW** = build it. **EXTEND** = exists partly; finish or adapt it. **VERIFY** = probably exists; confirm and fix gaps.
Every item has an acceptance check. "Spec §" refers to `reelsmith-docs/plan/cardboardrebuild.txt`.

### M0. Fork hygiene and baseline (do first)
- [x] **RS-001 NEW: disable or redirect the auto-updater.** `desktop/update-service.ts` checks OpenChatCut's release feed. In our builds, turn update checks off or point them at this repo. *Check:* a packaged build never offers an OpenChatCut update. _(Verified 2026-10-16: `desktop:dist:local` build has no `app-update.yml`, update checks are off in code, and the packaged smoke run made no update request.)_
- [x] **RS-002 NEW: rebrand the app identity.** Change app name, bundle id and userData dir (so it doesn't share `~/Library/Application Support/OpenChatCut`), icon and window title. *Check:* OpenChatCut and Reelsmith can be installed side by side without sharing data. _(Verified 2026-10-16: packaged app is `dev.reelsmith.app` / `Reelsmith.app`, uses `~/Library/Application Support/Reelsmith` and `~/.reelsmith`; smoke run passes. Old dev data: `npx tsx src/reelsmith/migrate-home.mts`.)_
- [ ] **RS-003 VERIFY: network audit.** _(Progress 2026-10-16: the render-time Google Fonts fetch was found and fixed by bundling the fonts; see `reelsmith-docs/NETWORK_AUDIT.md`. The runtime DevTools check is still open.)_ List every outbound call: model downloads, online media search, generation providers, update checks, fonts. Default to **local-only**; anything online is opt-in. *Check:* with no keys configured, a full import → edit → export session makes no network calls except user-approved model downloads.
- [ ] **RS-004 VERIFY: baseline on real footage.** Import 20 iPhone clips (HEVC, HDR, VFR, rotated) plus 1 song, edit a 30 s 9:16 reel manually, and export. Record import time, preview smoothness, export time and any failures in `reelsmith-docs/BASELINE.md`.
- [x] **RS-005 VERIFY: agent paths with your plans.** The built-in agent runs through your Claude Pro (`claude -p`) and your Codex/ChatGPT login; external Claude Code connects over MCP. *Check:* 5 scripted chat edits succeed in each path; Stop cancels within 3 s; every agent turn is one undo step. _(Progress: Claude Code path verified by hand on 2026-10-16: add, trim, title, volume and split each worked and undid in one step, and Stop works. Found and fixed one bug (Stop left the edit session locked). Decision 2026-10-16: Reelsmith uses Claude only, so the Codex and external-MCP paths are skipped on purpose.)_
- [ ] **RS-006 NEW: English-first UI pass.** _(Progress 2026-10-16: decision: Reelsmith is English-only (locale locked, language toggle hidden). A runtime DOM scan of the dashboard, editor tabs, Library, Inspector, Captions, menus, dialogs and all Settings panes found and fixed every visible CJK string; 66 runtime error/toast/progress messages translated (`src/i18n/dict/en/reelsmithRuntime.ts`). Still Chinese: Extension Center plugin install errors and deep project-package import failures. To do: recheck the Local models labels after a main-process rebuild.)_ Some UI labels are hard-coded Chinese (e.g. `CAT_LABEL` in `src/library/TemplateBrowser.tsx`). Default the locale to English and route remaining strings through i18n. *Check:* no CJK strings visible with the English locale.
- [x] **RS-007 NEW: `reelsmith-docs/UPSTREAM_PATCHES.md`.** Create the patch log described above.

### M1. Recipe system: gallery, format and deterministic assembly (core of the product)
- [x] **RS-101 NEW: recipe format plus loader.** Recipes are declarative JSON (no code), validated by `reelsmith-docs/plan/schemas/recipe.schema.json` (adapt as needed) and Zod. Template strings allow only `{{inputs.X}}`/`{{params.X}}`. *Check:* the 5 example recipes load; the negative fixtures (template injection, unknown strategy, enum without options) are rejected.
- [ ] **RS-102 NEW: recipe gallery home screen.** A grid of cards: poster image, a muted loop on hover, and category, aspect, typical length and required inputs ("6–80 clips + 1 song"), plus category filters and a recent-projects row. Separate from the existing motion-graphics `TemplateBrowser`. *Check:* 20 recipes render in < 1 s. _(Progress: the Recipes tab shows a grid of cards with a 9:16 poster, a muted loop while hovered, category, aspect, length and required inputs, plus category filters (model tested, 20 recipes build in < 50 ms). The recent-projects row is not built (the upstream dashboard already lists recent projects).)_
- [ ] **RS-103 NEW: recipe setup form.** Generated from the recipe's `inputs`/`params`: media slots with min/max counts and accepted kinds, text fields with maxLength, and the param widgets (enum, colour, font, seconds, number). An "Assemble" button that is enabled only when the inputs are valid. A toggle "Let my agent choose the shots" (Off / Claude / Codex). *Check:* invalid inputs block assembly with clear messages. _(Progress: form, validation that blocks Assemble, and the import → analyse → assemble pipeline work in the Recipes tab. The agent toggle offers Off / Claude (Codex dropped by decision): Reelsmith assembles first, then prefills the chat with a shot-selection request. Needs a manual check in the app.)_
- [x] **RS-104 NEW: deterministic assembler framework.** Same inputs + params + analysis + seed ⇒ same timeline. Output is a normal, editable set of timeline operations committed as **one undo step**. It must work **without AI**. Hook it into OpenChatCut's existing project command layer, not a parallel model. *Check:* re-running twice gives identical project JSON; a single undo removes the whole assembly.
- [ ] **RS-105 NEW: clip scoring and segment picker** (spec §10.4). _(Progress: sharpness, exposure, motion, dHash grouping, window picking, shot-boundary splitting (windows never cross a hard cut), speech presence (voice-band bursts) and a centre-subject saliency proxy are done and tested on lavfi fixtures (`server/reelsmith/clipFeatures.verify.ts`). Real face detection is not done (the browser has MediaPipe BlazeFace; the server stays model-free).)_ Score sharpness, exposure, motion, faces/saliency size, speech presence, shot boundaries, near-duplicate groups (dHash) and capture time. Reuse OpenChatCut's scene detection and analysis where possible. *Check:* on fixture media, the picker never selects near-duplicates and picks the highest-scoring window per shot.
- [ ] **RS-106 NEW: optional AI selection.** _(Progress: `reels_selection_candidates` (slot count + compact candidate table) and `propose_selection` (validates, rejects unknown/repeated/near-duplicate picks, heuristic fills gaps, one undo step) are wired and tested in `src/reelsmith/agent/reelsTools.verify.ts`. Contact sheets come from the existing `view_asset_frames`; the frames privacy switch is RS-703. Needs a real Claude run.)_ When enabled, the agent gets slot counts, a compact candidate table and contact-sheet images. It answers through a new `propose_selection` tool. The assembler validates the picks and falls back to the heuristic for any gaps. *Check:* malformed or repeated picks are rejected, and the reel still assembles.
- [x] **RS-107 NEW: recipe preview assets.** Build-time posters and loops are rendered from **synthetic** media (FFmpeg lavfi, no third-party footage). "Preview with my footage" renders a 3–6 s 360×640 loop from your imported clips. *Check:* user preview renders in ≤ 8 s. _(Done 2026-10-16: `server/reelsmith/build-previews.mts` assembles each recipe from lavfi-only footage and renders it with the app's export pipeline into `assets/recipe-previews/`. "Preview with my footage" in the setup form renders a 5 s 360×640 loop without touching the timeline; `server/reelsmith/previewRender.verify.ts` measures analysis + assembly + render of 8 phone-size clips at 3.9 s.)_
- [ ] **RS-108 NEW: store the recipe run in the project.** Save recipeId, version, assembler@version, inputs, params and seed, so the run can be re-run or re-assembled per section from chat ("re-cut the body every beat"). Manual edits outside the regenerated section are preserved. _(Progress: the run (recipe, version, assembler, seed, params, texts, media per input) is saved on Assemble; chat tools `reels_run_info` and `reels_recut_section` re-cut one section in one undo step and keep manual edits. Tested; needs a real chat run.)_

### M2. The five release-1 recipes (examples in `reelsmith-docs/plan/examples/recipes/`)
- [ ] **RS-201 Travel Beat Montage:** place-name title on the intro bars, cuts every 1, 2 or 4 beats, ending on a bar; no repeated clips (shots get longer if footage runs short). _(Progress: assembler logic + title done and tested (`beat-montage@1`). Still needs UI wiring, export validation and a manual review of 3 real reels.)_
- [ ] **RS-202 Mini Day Vlog:** ordered by capture time, a "moment" label per group (local time plus an optional place), an occasional 2-up split screen, cuts on bars, clip audio ducked under the music. _(Progress: assembler (`story-vlog@1`) done and tested; place names come from `AssemblyClip.place` (no reverse geocoding). Needs UI wiring and manual review.)_
- [ ] **RS-203 Beat Cut:** a build section cut on bars, a drop section cut on every beat with flash accents, automatic drop detection; asks the user instead of padding when there are too few clips. _(Progress: drop detection from an energy envelope, flash accents, ask-instead-of-pad done and tested. Energy extraction from real audio is not wired yet.)_
- [ ] **RS-204 Captioned Story:** talking clips with pauses tightened (light/balanced/tight levels, never cutting mid-word), word-timed captions, B-roll over matching sentences, an opening hook title. _(Progress: assembler (`captioned-story@1`) done and tested; tightening reuses the editor's own `silenceFrames`/`cutPadFrames`, so captions follow. Caption style to template mapping is a placeholder until RS-502. B-roll is chosen by score, not by meaning.)_
- [ ] **RS-205 Collage Grid:** a sequence of split2v → grid2x2 → split3v → grid3x3 layouts, tiles revealed staggered on the beat, a hero shot with the title at the end. _(Progress: assembler (`collage-grid@1`) done and tested. Needs UI wiring and manual review.)_
- *Check for each:* assembles from fixture media in ≤ 10 s without AI; the export passes validation (M3); timeline lint shows 0 errors; a manual review of 3 real reels says each "looks intentional".

### M3. Instagram output
- [ ] **RS-301 NEW/EXTEND: "Instagram Reel" export presets.** 1080×1920, 30 fps (a 60 fps variant), H.264 High, AAC 48 kHz stereo, MP4 faststart, Rec.709 SDR, -14 LUFS integrated with a -1 dBTP limiter. Also a "No music (add Instagram audio later)" variant and an optional SRT sidecar. _(Progress: preset definitions (`shared/reelsmith/instagramPreset.ts`) and an ffmpeg encoder that produces a file passing V1-V9 (`server/reelsmith/instagramEncode.ts`) done and tested. The Export dialog's Video tab has "Make it Instagram-ready" (+ "No music"): after a server render, the file is checked and, only if needed, re-encoded in place before delivery (`server/reelsmith/instagramFinalize.ts`, tested). 60 fps is picked when exporting at ≥ 50 fps. Browser/WebCodecs exports are not post-processed. SRT sidecar writing is not done. Needs a real export check.)_
- [ ] **RS-302 EXTEND: export validation report** (spec §12.7, checks V1–V9), built on the existing export QA. Check the container and faststart, codec, size, constant frame rate and frame count, audio, A/V duration match, a full decode with no errors, loudness, unintended black frames, and preview-vs-export parity on sampled frames. On failure, keep the `.failed.mp4` and offer a retry with a safe encoder. *Check:* 10 fixture projects pass; a corrupted fixture is caught. _(Progress: validator for V1-V7 and V9 done and tested on generated fixtures (`server/reelsmith/exportValidate.ts`). Hooked into the server export flow with an automatic safe-encoder retry; a still-failing retry is kept as `.failed.mp4` and the report shows in the Export dialog. V8 preview-parity is not done.)_
- [ ] **RS-303 NEW: Instagram safe-zone overlay.** A toggle on the preview that shows the zones Instagram's UI covers. The defaults are configurable (top ≈250 px, bottom ≈340–380 px, right ≈10%); confirm the real values in the Instagram app. Timeline lint warns when text or captions fall outside the safe area. _(Progress: safe-zone geometry and the text lint are done and tested (`src/reelsmith/safeZone.ts`) and reported by the `reels_lint` agent tool; the preview has an "IG zones" toggle that shades the covered areas. Values still need confirming in the Instagram app.)_
- [ ] **RS-304 VERIFY: HDR/VFR/rotation correctness.** iPhone HLG footage must look the same in preview and export, VFR clips must stay in sync, and rotated clips must stay upright. *Check:* a flash-and-beep fixture shows A/V aligned within 1 ms in the export.

### M4. Editing features to fill or verify (release 1 needs all of them)
- [ ] **RS-401 VERIFY:** trim, split, ripple delete, drag reorder on a magnetic main track, multi-select, keyboard shortcuts (space/JKL/arrows/S/⌘Z/⇧⌘Z).
- [ ] **RS-402 VERIFY/EXTEND:** crop/reframe to 9:16 per clip (manual, centre, subject/face), blurred-fill background for mismatched aspect ratios.
- [x] **RS-403 NEW/EXTEND: snap to beats.** Snap clip edges to the beat grid while dragging and trimming; add an agent operation and a menu action "Snap cuts to beats (every 1/2/4)". The code review found no existing snap-to-beat. _(Done 2026-10-16: the beat grid is stored on the music clip (`props.rsBeats`); beats are drag/trim snap targets (`src/editor/snap.ts`); video-track right-click menu has every 1/2/4; agent tool `reels_snap_cuts_to_beats`. Touching clips stay touching, source limits respected, one undo step. Tests: `src/reelsmith/beatSnap.verify.ts`.)_
- [ ] **RS-404 VERIFY/EXTEND:** text overlays with font, size, colour, stroke, shadow and background box, plus 6 in/out animations; bundled fonts with Devanagari coverage (e.g. Noto Sans Devanagari). _(Progress: Noto Sans Devanagari and Poppins (Devanagari + Latin) are bundled and offered in the font list; titles from recipes shrink to fit the safe width. Text styling and animations still need the manual check.)_
- [ ] **RS-405 VERIFY:** transitions: cut, crossfade, dip to black/white, slide, push, zoom, flash.
- [ ] **RS-406 NEW/EXTEND:** Ken Burns pan/zoom presets for photos; split/grid **layout items** with drag-to-fill cells (needed by the collage recipe).
- [ ] **RS-407 VERIFY:** speed 0.25–4×, flip, detach audio, per-clip volume and fades.

### M5. Captions
- [ ] **RS-501 VERIFY: local word-level transcription** for English and **Hindi/Marathi** (Devanagari). *Check:* median word-start error ≤ 100 ms on 10 hand-timed clips.
- [ ] **RS-502 EXTEND: six Reels caption styles:** clean white, highlight active word, boxed, karaoke sweep, pop word, minimal lowercase. All respect the safe zone. _(Progress: the six styles are presets over upstream templates (template + style override + motion + placement lifted above Instagram's bottom band) in `src/reelsmith/captionStyles.ts`, used by Captioned Story; replaces the old placeholder mapping that stacked one word per line. Needs a visual check of all six; not yet offered in the Captions panel.)_
- [ ] **RS-503 VERIFY: editing keeps timing.** Editing a line keeps the timing of untouched words exactly; inserted words are interpolated. Captions hide after more than 1.2 s of silence and follow trims and speed changes.

### M6. Music and audio
- [ ] **RS-601 EXTEND: beat-grid UI.** Show beat and bar markers on the music track. Allow manual correction: drag the phase, tap tempo, half/double, set the downbeat. _(Progress: grid maths tested in `src/reelsmith/beatGrid.ts`; bar/beat marks drawn on the music clip; Inspector "Beat grid" section: find the beat, ±20 ms phase, ½×/2×, downbeat at playhead, tap tempo, clear. Dragging the phase directly on the clip is not done; needs a manual check in the app.)_
- [ ] **RS-602 NEW: music start/end policies:** start from the beginning, first downbeat, loudest section or a user offset; end with a fade-out, on a bar, or a hard cut; "fit reel length to whole bars". _(Progress: start policies, snap to bars and "fit reel length to whole bars" done and tested; fade-out/hard-cut are applied by the assemblers; no UI yet.)_
- [ ] **RS-603 VERIFY:** ducking under speech gives ≥ 8 dB of reduction; fades; loudness normalisation in the export.

### M7. Agent experience
- [ ] **RS-701 VERIFY/EXTEND: chat checkpoints** ("Restore to here") and **"Revert this turn"** as one action.
- [ ] **RS-702 NEW: a Reels-specific system prompt and skill** ("reels-editor"): safe zone, beat-aware cuts, use timeline lint before finishing, summarise changes in plain words, say when something is impossible. _(Progress: `REELS_SYSTEM_PROMPT` added to every turn, bundled skill `reels-editor`, and a `reels_lint` tool (9:16, safe zone, gaps, tiny clips, off-beat cuts, > 90 s). Needs a check with real chat turns.)_
- [ ] **RS-703 NEW: privacy notice and toggle.** On first use, explain exactly what is sent to Anthropic/OpenAI (messages, timeline facts, transcript excerpts, small JPEG frames). Add a per-project switch "Allow frames to be sent to my agent". _(Progress: first-use notice in the chat panel lists what is sent and what never leaves the machine; the per-project switch is enforced in the tool dispatcher (frame tools refused, images stripped from any result). Tested in `src/reelsmith/framePrivacy.verify.ts`. Needs a look in the app.)_
- [ ] **RS-704 NEW: usage-limit handling.** Show clear messages when the Claude Pro or Codex plan limit is hit, suggest switching agent or editing manually, and keep the app fully usable without AI. _(Progress: Claude CLI limit/rate-limit errors become a plain message with the reset time and "keep editing by hand" (`shared/reelsmith/usageLimit.ts`, tested on known message shapes). Codex is out by decision. Needs a check against a real limit message.)_
- [ ] **RS-705 VERIFY: agent confinement.** Only editor tools; no shell or file tools (Claude `--restricted` plus deny rules; check the equivalent for Codex). *Check:* a filesystem audit during a turn shows no reads of media or home files by the agent process.

### M8. Reliability and performance
- [ ] **RS-801 VERIFY:** autosave, reopen and crash recovery. *Check:* `kill -9` at random times (20 trials) never corrupts a project and loses ≤ 2 s of edits.
- [ ] **RS-802 VERIFY:** relinking moved media.
- [ ] **RS-803 VERIFY:** performance on an Apple M5 with 24 GB. Preview of a 3-layer 1080×1920 timeline drops ≤ 1% of frames; scrub p95 ≤ 150 ms; a 60 s reel exports in ≤ 90 s. If Remotion export is too slow, investigate OpenChatCut's render-concurrency settings (`MACOS-RENDER-TUNING.md`).
- [ ] **RS-804 NEW:** a 72-hour soak script (open/edit/export 30 projects) with no leaks (RSS growth < 10%).

---

## Release 1 is done when
1. Fresh install → 20 iPhone clips + 1 song → Travel Beat Montage → export takes **≤ 5 minutes** without AI.
2. The same flow works with "Let my agent choose" via Claude **and** via Codex, or fails gracefully back to the heuristic result.
3. Exports pass validation (RS-302) and upload to Instagram from an iPhone (3 real reels).
4. All 5 recipes work; captions, music timing, undo/redo, autosave and recovery pass their checks above.
5. Everything except chat and AI selection works with **no agent installed**.

## Later (after release 1)
Asset library across projects · tracking reframe and speaker-aware cuts · captions behind the subject / background removal · keyframe lanes and colour wheels · silence/filler cleanup levels · visual search tuning · HDR and 4K export · GIF export · `.reelpack` portable projects · style references ("make it look like this video") · more recipes (clock vlog, travel collage strips, photo dump, aftermovie) · FCPXML round-trip to Final Cut.

## Out of scope
Cloud sync, share links and comments, collaboration, billing, voice cloning, dubbing, downloading clips from social platforms, and paid generative video/music. OpenChatCut's generation features can stay as optional extras behind your own API keys.

## Rules for AI agents working in this repo
- Never read, store or forward Claude.ai/ChatGPT credentials or tokens. Agents run through the user's own unmodified `claude`/`codex` CLIs. See spec §4.3 for the current Anthropic/OpenAI rules. They changed several times in 2026, so re-check them before sharing builds.
- Agents act only through validated, undoable editor tools.
- Keep footage local. Anything that uploads must be opt-in.
