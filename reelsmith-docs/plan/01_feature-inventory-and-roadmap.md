# Feature inventory and release roadmap

Project codename: **Reelsmith** (placeholder; not affiliated with Cardboard Inc. Check the name for trademark conflicts before any public use.)
Prepared: 2026-10-15. Companion to `cardboardrebuild.txt` (the main specification).

## How to read this

- **Feature** is written in our own neutral words. It describes a capability Cardboard *publicly claims*. It does not describe how Cardboard built it.
- **Evidence V** means the capability is stated on a public Cardboard page that we read on 2026-10-15: the changelog, llms.txt, recipes, Mac page or pricing. Every row here is V. Implementation ideas in the "Local approach" column are **our recommendations**, not facts about Cardboard.
- **First seen** is the changelog release date where the feature first appears. If the only source is llms.txt, pricing or recipes, the value is the fetch date (2026-10-15), not a launch date.
- Source links point to changelog anchors (`#N` = release number N), llms.txt, /recipes, /desktop or /pricing.
- The machine-readable copy is `02_feature-inventory.csv`.

Phase legend:

| Code | Meaning |
|---|---|
| R1 | Release 1: Instagram Reels. Needed for the core workflow (browse recipes → import → choose recipe → AI assembles → chat changes → preview → export) |
| R2 | Next release. Valuable, buildable locally, and not needed for the first reel |
| R3 | Later. Larger local ML or UI work (segmentation, tracking, NLE interchange, motion graphics) |
| EXP | Experimental. Quality, licensing or hardware outcome uncertain; prototype behind a flag |
| OPT-PAID | Possible only through a paid third-party service or API key. Never required |
| OOS | Out of scope. Needs a hosted backend, conflicts with the constraints, or carries legal or abuse risk |

## Roadmap summary

```
R1  Instagram Reels (target: one complete, reliable workflow)
    P0 Foundations + spikes ─┬─> P1 Project model/ops/undo/autosave ─┬─> P3 Compositor+preview ─> P4 Export+validation
                             ├─> P2 Media pipeline (probe/proxy/cache) ┘                        │
                             │                                                                   v
                             ├─> P5 Transcription + captions ───────────────────────> P7 Recipes (5) + gallery
                             ├─> P6 Audio mixer + beat grid ───────────────────────────────┘     │
                             └─> P8 Agent bridge (Claude CLI, Codex CLI, MCP tools) <─────────────┘
                                                         └─> P9 Hardening, QA, packaging -> R1 done
R2  Asset library, tracking reframe, keyframe lanes, colour/effects, cleanup (silence/fillers),
    visual search (embeddings), HDR export, 4K, GIF, portable .reelpack, more recipes
R3  Segmentation (background removal, captions behind subject), speaker layouts, FCPXML export,
    motion-graphics templates, style references, multicam sync, translation via agent
EXP 3D/programmatic graphics, local TTS voiceover, paper-cutout and other stylised effects
```

R1 is **done** when every acceptance criterion in `cardboardrebuild.txt` §22 passes on the reference Mac (Apple M5, 24 GB). Broad feature parity is explicitly **not** an R1 goal.

## What R1 deliberately leaves out (and why)

- Cloud projects, share links, comments and collaboration. These need a hosted backend, which the constraints rule out.
- Music and SFX libraries, stock footage, generative video and AI music. These raise licensing and cost problems. R1 uses your own music and footage.
- Voice cloning and dubbing. These carry consent and abuse risk.
- Posting directly to Instagram. Programmatic publishing needs a professional account plus Meta app review, which is not worth it for a personal tool. R1 exports an MP4 that you AirDrop or upload.


## Full inventory

119 features. Phase counts: EXP: 3, OOS: 10, OPT-PAID: 3, R1: 64, R2: 26, R3: 13


### Release 1 — Instagram Reels (64)

| ID | Area | Feature | Public source(s) | First seen | Local approach / notes |
|---|---|---|---|---|---|
| MED-01 | Media | Import video, images and music into a project | [changelog#1](https://www.cardboard.ai/changelog#1) | 2025-11-09 | FFmpeg/ffprobe + AVFoundation probe; copy-or-reference |
| MED-02 | Media | HEIC/HEIF photo import | [changelog#9](https://www.cardboard.ai/changelog#9) | 2026-01-22 | sips/ImageIO (macOS) or FFmpeg; convert to PNG/JPEG cache |
| MED-03 | Media | Large files (multi-GB) and hours of footage | [changelog#9](https://www.cardboard.ai/changelog#9) [changelog#13](https://www.cardboard.ai/changelog#13) [desktop](https://www.cardboard.ai/desktop) | 2026-01-22 | Local files have no upload limit; proxies keep preview fast |
| MED-04 | Media | Reconnect/relink moved files | [changelog#9](https://www.cardboard.ai/changelog#9) | 2026-01-22 | Path + fingerprint (size, mtime, partial hash) relink dialog |
| MED-05 | Media | Background media preparation (proxies, thumbnails, analysis) with per-file progress | [changelog#19](https://www.cardboard.ai/changelog#19) [changelog#20](https://www.cardboard.ai/changelog#20) [changelog#26](https://www.cardboard.ai/changelog#26) | 2026-04-06 | Local job queue with progress + cancellation |
| MED-07 | Media | ProRes and Dolby AC-3/E-AC-3 audio support | [changelog#36](https://www.cardboard.ai/changelog#36) | 2026-08-03 | FFmpeg decodes; WebCodecs can't decode ProRes → mezzanine/proxy |
| MED-08 | Media | 'Any camera format' opens immediately and prepares in background | [changelog#45](https://www.cardboard.ai/changelog#45) | 2026-10-05 | Probe first, show placeholder, proxy in background |
| MED-11 | Media | Detach audio from video onto its own track | [changelog#6](https://www.cardboard.ai/changelog#6) [changelog#31](https://www.cardboard.ai/changelog#31) | 2025-12-22 | Linked A/V items; unlink op |
| MED-13 | Media | Speed change carried into audio and export | [changelog#6](https://www.cardboard.ai/changelog#6) | 2025-12-22 | Speed 0.25–4x; audio time-stretch (rubberband is GPL → use WSOLA own impl or mute)  |
| TL-01 | Timeline | Multi-track timeline with split, trim, drag, zoom, scrub | [changelog#1](https://www.cardboard.ai/changelog#1) [changelog#2](https://www.cardboard.ai/changelog#2) | 2025-11-09 | Core of R1 |
| TL-02 | Timeline | Undo/redo of any timeline change | [changelog#3](https://www.cardboard.ai/changelog#3) [changelog#35](https://www.cardboard.ai/changelog#35) | 2025-11-20 | Transaction log with inverse patches |
| TL-03 | Timeline | Keyboard shortcuts (space, arrows, delete, copy/paste, duplicate, mute) | [changelog#3](https://www.cardboard.ai/changelog#3) [changelog#10](https://www.cardboard.ai/changelog#10) [changelog#9](https://www.cardboard.ai/changelog#9) | 2025-11-20 | Default map; JKL |
| TL-04 | Timeline | Ripple delete | [changelog#8](https://www.cardboard.ai/changelog#8) | 2026-01-11 | Magnetic main track |
| TL-05 | Timeline | Snapping to edges/playhead; snapping toggle | [changelog#2](https://www.cardboard.ai/changelog#2) [changelog#33](https://www.cardboard.ai/changelog#33) | 2025-11-14 | Plus snap-to-beat (ours) |
| TL-06 | Timeline | Multi-select and bulk edit | [changelog#4](https://www.cardboard.ai/changelog#4) [changelog#34](https://www.cardboard.ai/changelog#34) | 2025-12-03 |  |
| TL-07 | Timeline | Waveforms on clips | [changelog#2](https://www.cardboard.ai/changelog#2) [changelog#15](https://www.cardboard.ai/changelog#15) | 2025-11-14 | Peak files generated from PCM cache |
| TL-10 | Timeline | Track management (rename, mute, lock, reorder) | [changelog#3](https://www.cardboard.ai/changelog#3) [changelog#8](https://www.cardboard.ai/changelog#8) | 2025-11-20 |  |
| TL-11 | Timeline | Hide/collapse timeline for clean viewer; fullscreen preview | [changelog#13](https://www.cardboard.ai/changelog#13) [changelog#9](https://www.cardboard.ai/changelog#9) [changelog#44](https://www.cardboard.ai/changelog#44) | 2026-01-22 | Fullscreen preview (F) |
| CV-01 | Canvas | Aspect ratios 16:9, 9:16, 1:1 (+4:3, 3:4, 4:5) | [changelog#1](https://www.cardboard.ai/changelog#1) [changelog#11](https://www.cardboard.ai/changelog#11) [changelog#16](https://www.cardboard.ai/changelog#16) | 2025-11-09 | R1 default 9:16 1080×1920; others selectable |
| CV-02 | Canvas | On-canvas drag/scale/rotate/crop with guides and snapping | [changelog#4](https://www.cardboard.ai/changelog#4) [changelog#5](https://www.cardboard.ai/changelog#5) [changelog#7](https://www.cardboard.ai/changelog#7) | 2025-12-03 | Crop/reframe rect in normalized source coords |
| CV-03 | Canvas | Backgrounds (solid, gradient, image) behind media | [changelog#6](https://www.cardboard.ai/changelog#6) | 2025-12-22 | Blurred-fill background for mismatched aspect (ours) |
| CV-04 | Canvas | Properties panel: position, scale, rotation, opacity, blend, audio | [changelog#2](https://www.cardboard.ai/changelog#2) | 2025-11-14 | Blend modes subset in R1 (normal, screen, multiply) |
| CV-05 | Canvas | Flip/mirror clip | [changelog#16](https://www.cardboard.ai/changelog#16) | 2026-03-16 |  |
| CV-06 | Canvas | Layout presets (split-screen, grids) with drag-to-fill slots | [changelog#11](https://www.cardboard.ai/changelog#11) [changelog#13](https://www.cardboard.ai/changelog#13) [changelog#37](https://www.cardboard.ai/changelog#37) | 2026-02-10 | Needed for collage recipe; 2-up, 3-up, 2×2, 3×3 |
| CV-07 | Canvas | Save current preview frame as image | [changelog#9](https://www.cardboard.ai/changelog#9) | 2026-01-22 |  |
| CV-08 | Canvas | Agent fixes black bars/letterboxing | [changelog#37](https://www.cardboard.ai/changelog#37) | 2026-08-10 | Deterministic 'fill frame' check + op |
| FX-01 | Effects | Transitions: fade, scale, fly; controls at clip seams | [changelog#3](https://www.cardboard.ai/changelog#3) [changelog#12](https://www.cardboard.ai/changelog#12) | 2025-11-20 | cut, crossfade, dip, slide/push, zoom |
| TX-01 | Text | Text overlays with presets, font, weight, colour, shadow, letter spacing, line height | [changelog#3](https://www.cardboard.ai/changelog#3) [changelog#5](https://www.cardboard.ai/changelog#5) [changelog#41](https://www.cardboard.ai/changelog#41) | 2025-11-20 |  |
| TX-02 | Text | Text motion presets (12) | [changelog#15](https://www.cardboard.ai/changelog#15) | 2026-03-09 | R1: 6 in/out animations |
| CAP-01 | Captions | Automatic transcription with timestamps; searchable transcript | [changelog#4](https://www.cardboard.ai/changelog#4) | 2025-12-03 | whisper.cpp local (MIT code + MIT weights) |
| CAP-02 | Captions | Word-level captions with presets and per-caption editing | [llms.txt](https://www.cardboard.ai/llms.txt) [changelog#35](https://www.cardboard.ai/changelog#35) | 2025-12-03 | Edit in place; retime-preserving alignment |
| CAP-03 | Captions | Animated caption styles (line-by-line, word pop, one-word reveal, big keyword) | [changelog#9](https://www.cardboard.ai/changelog#9) [changelog#32](https://www.cardboard.ai/changelog#32) [changelog#36](https://www.cardboard.ai/changelog#36) | 2026-01-22 | 6 original styles in R1 |
| CAP-04 | Captions | Captions pause during silences | [changelog#32](https://www.cardboard.ai/changelog#32) | 2026-07-06 | Gap > threshold hides caption |
| CAP-05 | Captions | Captions keep style after regenerate; resync after audio retime | [changelog#36](https://www.cardboard.ai/changelog#36) | 2026-08-03 | Style stored separately from words |
| CAP-07 | Captions | Multilingual transcription (10+ languages, Mandarin, Hindi fixes); auto language detect | [changelog#8](https://www.cardboard.ai/changelog#8) [changelog#16](https://www.cardboard.ai/changelog#16) [changelog#41](https://www.cardboard.ai/changelog#41) | 2026-01-11 | Whisper multilingual; Devanagari font coverage |
| CAP-09 | Captions | Agent keeps text readable (overlap/too-small detection) | [changelog#33](https://www.cardboard.ai/changelog#33) | 2026-07-13 | Deterministic lint: safe-zone, min size, overlap |
| AU-01 | Audio | Per-item volume (0–200%) and mute | [changelog#6](https://www.cardboard.ai/changelog#6) [changelog#7](https://www.cardboard.ai/changelog#7) | 2025-12-22 | Stored in dB internally |
| AU-03 | Audio | Beat-synced cuts; real beat grid tracking up to 20 min | [changelog#13](https://www.cardboard.ai/changelog#13) [changelog#29](https://www.cardboard.ai/changelog#29) | 2026-02-22 | Local beat tracker; manual grid nudge |
| AU-05 | Audio | Audio-sync robustness on long timelines | [changelog#17](https://www.cardboard.ai/changelog#17) [changelog#18](https://www.cardboard.ai/changelog#18) | 2026-03-23 | Sample-accurate mixer driven by rational time |
| RF-01 | Reframe | Reframe for new aspect ratio keeping subject in view | [changelog#15](https://www.cardboard.ai/changelog#15) [changelog#36](https://www.cardboard.ai/changelog#36) | 2026-03-09 | Static saliency/face crop per clip (Apple Vision) |
| SR-01 | Search | Search footage by what is said (transcript) | [changelog#4](https://www.cardboard.ai/changelog#4) [changelog#24](https://www.cardboard.ai/changelog#24) | 2025-12-03 | SQLite FTS5 |
| SR-04 | Search | Agent analyses clip content (scenes, actions, on-screen text) | [changelog#5](https://www.cardboard.ai/changelog#5) [changelog#41](https://www.cardboard.ai/changelog#41) | 2025-12-15 | Contact sheets sent to your agent as images (privacy note) |
| AG-01 | Agent | Plain-language agent edits of the timeline | [changelog#1](https://www.cardboard.ai/changelog#1) | 2025-11-09 | Claude Code CLI / Codex CLI via local MCP tools |
| AG-02 | Agent | Bring your own Claude or Codex subscription (Mac) | [changelog#44](https://www.cardboard.ai/changelog#44) [desktop](https://www.cardboard.ai/desktop) | 2026-09-28 | Spawn user's own unmodified CLI; app never touches credentials |
| AG-03 | Agent | Model picker | [changelog#4](https://www.cardboard.ai/changelog#4) [changelog#44](https://www.cardboard.ai/changelog#44) | 2025-12-03 | Pass --model / -m |
| AG-04 | Agent | Chat checkpoints: roll timeline back to any message | [changelog#14](https://www.cardboard.ai/changelog#14) | 2026-03-02 | Revision id per message |
| AG-05 | Agent | Agent looks at rendered frames and fixes its own work | [changelog#34](https://www.cardboard.ai/changelog#34) [changelog#39](https://www.cardboard.ai/changelog#39) | 2026-07-20 | render_frames tool + deterministic lints |
| AG-07 | Agent | Message queue and stop button | [changelog#30](https://www.cardboard.ai/changelog#30) | 2026-06-22 | Cancel = SIGINT → SIGTERM |
| AG-08 | Agent | Agent reports when stuck; summary at end; self-check against request | [changelog#39](https://www.cardboard.ai/changelog#39) [changelog#40](https://www.cardboard.ai/changelog#40) [changelog#41](https://www.cardboard.ai/changelog#41) | 2026-08-24 | Turn summary + verify step |
| AG-11 | Agent | Plain-language progress instead of raw tool output; details toggle | [changelog#45](https://www.cardboard.ai/changelog#45) | 2026-10-05 |  |
| AG-12 | Agent | Agents confined to project files | [changelog#45](https://www.cardboard.ai/changelog#45) | 2026-10-05 | No shell/file tools; ops-only MCP |
| AG-13 | Agent | Start a project from a prompt / footage-first start | [changelog#10](https://www.cardboard.ai/changelog#10) [changelog#38](https://www.cardboard.ai/changelog#38) | 2026-01-31 | Recipe-first is our primary flow |
| RC-01 | Recipes | Recipe gallery with preview, required inputs, output format | [recipes](https://www.cardboard.ai/recipes) [llms.txt](https://www.cardboard.ai/llms.txt) | 2026-10-15 | Declarative recipe JSON + built-in assembler strategies |
| RC-02 | Recipes | Travel montage / travel collage / travel vlog recipes | [recipes](https://www.cardboard.ai/recipes) | 2026-10-15 | Our own designs |
| RC-03 | Recipes | Vlog recipes (mini vlog, clock vlog, cinematic story) | [recipes](https://www.cardboard.ai/recipes) | 2026-10-15 | Mini vlog in R1 |
| RC-05 | Recipes | Clipping/talking-head/UGC recipes with captions | [recipes](https://www.cardboard.ai/recipes) | 2026-10-15 | Captioned story recipe |
| RC-06 | Recipes | Montage avoids repeating clips; asks rather than pads | [changelog#39](https://www.cardboard.ai/changelog#39) | 2026-08-24 | Assembler constraint |
| EX-01 | Export | Export video in a range of formats | [changelog#1](https://www.cardboard.ai/changelog#1) | 2025-11-09 | MP4 H.264/AAC 1080×1920 default; HEVC option |
| EX-02 | Export | Exports verified before delivery | [changelog#43](https://www.cardboard.ai/changelog#43) | 2026-09-21 | ffprobe + decode + parity sample checks |
| EX-04 | Export | Adaptive frame rate (keep 60 fps) | [changelog#32](https://www.cardboard.ai/changelog#32) | 2026-07-06 | 30 default, 60 option |
| EX-09 | Export | Muted timeline exports without empty audio track | [changelog#44](https://www.cardboard.ai/changelog#44) | 2026-09-28 |  |
| PR-01 | Projects | Autosave / no save button | [changelog#11](https://www.cardboard.ai/changelog#11) | 2026-02-10 | Local atomic autosave + journal |
| PR-02 | Projects | Recovered version shown side-by-side; user chooses | [changelog#38](https://www.cardboard.ai/changelog#38) | 2026-08-17 |  |
| PR-05 | Projects | Rename, bulk delete, recent projects | [changelog#45](https://www.cardboard.ai/changelog#45) | 2026-10-05 |  |

### Release 2 (26)

| ID | Area | Feature | Public source(s) | First seen | Local approach / notes |
|---|---|---|---|---|---|
| MED-06 | Media | HDR footage import and HDR-correct display/export | [changelog#8](https://www.cardboard.ai/changelog#8) [changelog#13](https://www.cardboard.ai/changelog#13) [changelog#28](https://www.cardboard.ai/changelog#28) | 2026-01-11 | R1: tone-map HDR→SDR Rec.709 consistently; R2: HDR export |
| MED-09 | Media | Central asset library across projects with search/filter | [changelog#37](https://www.cardboard.ai/changelog#37) | 2026-08-10 | SQLite index of all imported media; R1 is per-project bin |
| MED-10 | Media | Download a timeline clip trimmed to its in/out at original quality | [changelog#34](https://www.cardboard.ai/changelog#34) | 2026-07-20 | FFmpeg stream-copy when keyframe-aligned else re-encode |
| MED-12 | Media | Reverse playback of a clip | [changelog#40](https://www.cardboard.ai/changelog#40) | 2026-08-31 | Reverse proxy render; silent (as public note) |
| MED-14 | Media | GIF playback on timeline | [changelog#11](https://www.cardboard.ai/changelog#11) | 2026-02-10 | Convert GIF to video proxy |
| TL-08 | Timeline | Keyframe lanes on timeline (position, scale, opacity, blur, radius) | [changelog#6](https://www.cardboard.ai/changelog#6) [changelog#33](https://www.cardboard.ai/changelog#33) [changelog#35](https://www.cardboard.ai/changelog#35) | 2025-12-22 | R1 = simple 2-point keyframes (Ken Burns); lanes in R2 |
| TL-12 | Timeline | Playback speed controls in previews (e.g. 1.25x) | [changelog#16](https://www.cardboard.ai/changelog#16) [changelog#24](https://www.cardboard.ai/changelog#24) | 2026-03-16 |  |
| FX-02 | Effects | Colour grade presets with hover preview; 10 exact numeric colour controls | [changelog#5](https://www.cardboard.ai/changelog#5) [changelog#36](https://www.cardboard.ai/changelog#36) | 2025-12-15 | R1: 6 looks + exposure/contrast/saturation/temperature |
| FX-04 | Effects | Gaussian blur effect (keyframeable) | [changelog#33](https://www.cardboard.ai/changelog#33) | 2026-07-13 | Two-pass shader |
| FX-05 | Effects | Retro film effects: grain, vignette, scanlines, halation, film presets | [changelog#31](https://www.cardboard.ai/changelog#31) | 2026-06-29 | Shaders |
| FX-06 | Effects | Effect previews rendered on your own footage | [changelog#41](https://www.cardboard.ai/changelog#41) | 2026-09-07 | Thumbnail render via same compositor |
| TX-03 | Text | Floating on-canvas text toolbar | [changelog#41](https://www.cardboard.ai/changelog#41) | 2026-09-07 |  |
| AU-04 | Audio | Music ducking under speech; levelling; noise removal | [llms.txt](https://www.cardboard.ai/llms.txt) | 2026-10-15 | R1: ducking + fades + loudness normalise; R2: noise reduction (RNNoise BSD) |
| CL-01 | Cleanup | Silence/dead-air removal from transcript | [changelog#11](https://www.cardboard.ai/changelog#11) | 2026-02-10 | VAD + transcript gaps; preview before apply |
| CL-02 | Cleanup | Remove bad takes, fillers, repetitions; Light/Balanced/Tight levels | [changelog#21](https://www.cardboard.ai/changelog#21) [changelog#28](https://www.cardboard.ai/changelog#28) [changelog#39](https://www.cardboard.ai/changelog#39) | 2026-04-20 | Agent proposes ranges; user previews |
| RF-02 | Reframe | Subject/speaker tracking reframe (moving crop) | [changelog#23](https://www.cardboard.ai/changelog#23) [changelog#25](https://www.cardboard.ai/changelog#25) [changelog#27](https://www.cardboard.ai/changelog#27) [changelog#29](https://www.cardboard.ai/changelog#29) | 2026-05-04 | Vision face/person tracking + smoothing |
| SR-02 | Search | Search by visual description / scene / objects | [changelog#3](https://www.cardboard.ai/changelog#3) [changelog#8](https://www.cardboard.ai/changelog#8) [changelog#24](https://www.cardboard.ai/changelog#24) | 2025-11-20 | SigLIP2 (Apache-2.0) embeddings + sqlite-vec |
| SR-03 | Search | Media insights while scrubbing; highlight preview before placing | [changelog#24](https://www.cardboard.ai/changelog#24) | 2026-05-11 |  |
| AG-06 | Agent | Agent asks clarifying questions; pickers in chat (music, layouts) | [changelog#13](https://www.cardboard.ai/changelog#13) [changelog#27](https://www.cardboard.ai/changelog#27) | 2026-02-22 |  |
| AG-10 | Agent | Prompt improvement / rewrite | [changelog#15](https://www.cardboard.ai/changelog#15) [changelog#30](https://www.cardboard.ai/changelog#30) | 2026-03-09 |  |
| RC-07 | Recipes | Sample/template projects | [changelog#7](https://www.cardboard.ai/changelog#7) [changelog#14](https://www.cardboard.ai/changelog#14) | 2026-01-01 |  |
| EX-03 | Export | Untouched single clip export copies without re-encode | [changelog#36](https://www.cardboard.ai/changelog#36) | 2026-08-03 |  |
| EX-05 | Export | 4K export | [pricing](https://www.cardboard.ai/pricing) [changelog#13](https://www.cardboard.ai/changelog#13) | 2026-02-22 |  |
| EX-06 | Export | GIF export of a range | [changelog#15](https://www.cardboard.ai/changelog#15) | 2026-03-09 | FFmpeg palettegen |
| EX-08 | Export | Re-export identical cut returns cached file | [changelog#40](https://www.cardboard.ai/changelog#40) | 2026-08-31 | Render hash cache |
| PR-03 | Projects | Share a project as one file with footage included | [changelog#44](https://www.cardboard.ai/changelog#44) | 2026-09-28 | Portable .reelpack (zip) |

### Release 3 (13)

| ID | Area | Feature | Public source(s) | First seen | Local approach / notes |
|---|---|---|---|---|---|
| TL-09 | Timeline | Shortcut presets mimicking other NLEs; rebindable keys | [changelog#33](https://www.cardboard.ai/changelog#33) | 2026-07-13 |  |
| FX-03 | Effects | LUTs and lift/gamma/gain wheels | [llms.txt](https://www.cardboard.ai/llms.txt) | 2026-10-15 | .cube LUT loader in shader |
| CAP-06 | Captions | Captions behind the subject (depth/segmentation) | [changelog#12](https://www.cardboard.ai/changelog#12) [changelog#40](https://www.cardboard.ai/changelog#40) | 2026-02-16 | Apple Vision person segmentation matte |
| CAP-08 | Captions | Caption translation into other languages | [llms.txt](https://www.cardboard.ai/llms.txt) | 2026-10-15 | Via user's agent (Claude/Codex) — optional |
| AU-06 | Audio | Multicam sync by audio | [llms.txt](https://www.cardboard.ai/llms.txt) | 2026-10-15 | Cross-correlation of onset envelopes |
| RF-03 | Reframe | Speaker grids / split layouts from multi-person footage | [changelog#21](https://www.cardboard.ai/changelog#21) | 2026-04-20 |  |
| RF-04 | Reframe | Speaker-aware auto cut to whoever speaks | [changelog#25](https://www.cardboard.ai/changelog#25) | 2026-05-18 | Diarization needed (pyannote: MIT code, gated weights) → verify |
| SEG-01 | Segmentation | Background removal/replacement (with partial-range support) | [changelog#12](https://www.cardboard.ai/changelog#12) [changelog#33](https://www.cardboard.ai/changelog#33) [changelog#45](https://www.cardboard.ai/changelog#45) | 2026-02-16 | Vision person segmentation; BiRefNet (MIT) optional |
| SEG-02 | Segmentation | Depth compositing: text behind subject | [changelog#12](https://www.cardboard.ai/changelog#12) [llms.txt](https://www.cardboard.ai/llms.txt) | 2026-02-16 |  |
| AG-09 | Agent | Style reference: attach video/image to match colour, pacing, fonts, audio | [changelog#35](https://www.cardboard.ai/changelog#35) | 2026-07-27 |  |
| MG-01 | Motion graphics | Animated titles, diagrams, charts, callouts; editable values | [llms.txt](https://www.cardboard.ai/llms.txt) [changelog#42](https://www.cardboard.ai/changelog#42) | 2026-09-14 | Template-based; Lottie (MIT player) later |
| RC-04 | Recipes | Effect recipes requiring segmentation/tracking (subject isolation, invisible man, orbital screens) | [recipes](https://www.cardboard.ai/recipes) | 2026-10-15 | Depends on SEG-01/RF-02 |
| EX-07 | Export | NLE handoff: Premiere XML / FCPXML / DaVinci; AAF | [changelog#4](https://www.cardboard.ai/changelog#4) [changelog#20](https://www.cardboard.ai/changelog#20) [llms.txt](https://www.cardboard.ai/llms.txt) | 2025-12-03 | FCPXML 1.x first; AAF out of scope |

### Experimental (3)

| ID | Area | Feature | Public source(s) | First seen | Local approach / notes |
|---|---|---|---|---|---|
| FX-07 | Effects | Paper-cutout collage effect | [changelog#40](https://www.cardboard.ai/changelog#40) | 2026-08-31 |  |
| VO-01 | Voice | Voiceover generation from script; voice previews | [changelog#7](https://www.cardboard.ai/changelog#7) [changelog#15](https://www.cardboard.ai/changelog#15) | 2026-01-01 | Local TTS candidate (licence to verify) or OPT-PAID |
| MG-02 | Motion graphics | 3D scenes from prompt | [changelog#45](https://www.cardboard.ai/changelog#45) | 2026-10-05 | three.js (MIT) programmatic scenes |

### Optional, needs paid service (3)

| ID | Area | Feature | Public source(s) | First seen | Local approach / notes |
|---|---|---|---|---|---|
| AU-07 | Audio | AI-generated music | [pricing](https://www.cardboard.ai/pricing) | 2026-10-15 | Paid APIs or heavy local models; not in plan |
| GEN-01 | Generative | AI video/image generation (third-party models) | [pricing](https://www.cardboard.ai/pricing) | 2026-10-15 | Paid APIs; not planned |
| GEN-02 | Generative | Stock and archival footage sourcing with credits | [changelog#31](https://www.cardboard.ai/changelog#31) | 2026-06-29 | Would need API keys (e.g. free stock APIs) — optional |

### Out of scope (10)

| ID | Area | Feature | Public source(s) | First seen | Local approach / notes |
|---|---|---|---|---|---|
| MED-15 | Media | Direct clips from X/Instagram/YouTube/Vimeo links | [pricing](https://www.cardboard.ai/pricing) | 2026-10-15 | Platform ToS/copyright risk; out of scope |
| AU-02 | Audio | Music library (royalty-free) and sound-effects library | [changelog#5](https://www.cardboard.ai/changelog#5) [changelog#10](https://www.cardboard.ai/changelog#10) [changelog#45](https://www.cardboard.ai/changelog#45) | 2025-12-15 | Licensing; R1 uses your own music; optional CC0 SFX pack later |
| VO-02 | Voice | Voice cloning from sample | [changelog#8](https://www.cardboard.ai/changelog#8) | 2026-01-11 | Consent/abuse risk; out of scope |
| VO-03 | Voice | Dubbing into another language | [llms.txt](https://www.cardboard.ai/llms.txt) | 2026-10-15 |  |
| AG-14 | Agent | Native in-app agent with its own model access ('Director') | [changelog#3](https://www.cardboard.ai/changelog#3) [desktop](https://www.cardboard.ai/desktop) | 2025-11-20 | Would need hosted backend/API billing |
| PR-04 | Projects | Cloud projects, cloud sync, chats synced across devices | [changelog#6](https://www.cardboard.ai/changelog#6) [changelog#11](https://www.cardboard.ai/changelog#11) [changelog#20](https://www.cardboard.ai/changelog#20) | 2025-12-22 | No hosted backend (constraint) |
| CO-01 | Collaboration | Share links / watch page / timestamped comments | [changelog#32](https://www.cardboard.ai/changelog#32) | 2026-07-06 | Needs hosting |
| CO-02 | Collaboration | Live collaboration | [llms.txt](https://www.cardboard.ai/llms.txt) | 2026-10-15 |  |
| BZ-01 | Business | Plans, credits, trials, checkout, billing | [changelog#10](https://www.cardboard.ai/changelog#10) [changelog#28](https://www.cardboard.ai/changelog#28) [pricing](https://www.cardboard.ai/pricing) | 2026-01-31 | Personal app |
| OP-01 | Ops | Status page, telemetry-driven improvements | [changelog#40](https://www.cardboard.ai/changelog#40) | 2026-08-31 | Local logs only |
