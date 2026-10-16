# Baseline on real footage (RS-004)

Run 2026-10-16 on an Apple Silicon Mac with `npx tsx server/reelsmith/baseline.mts <folder> <recipe-id>`: a scripted
stand-in for import → assemble → export through the app's own server pipeline (no GUI). It does **not** measure preview
smoothness or a manual edit; those still need a hands-on pass in the app.

## Footage
20 iPhone clips + 1 song (a 300 s, 107 bpm Hindi song, mp3), 1.4 GB.

| Property | In the set |
|---|---|
| Codecs | 14 × HEVC, 6 × H.264 |
| Sizes | 12 × 3840×2160, 7 × 1920×1080, 2 × 1080×1920 |
| Rotation flag (±90°) | 18 clips (shown upright in stills and export) |
| Frame rate | 60 fps or 59.94 fps, one 30 fps; no clip with a clearly variable rate (average within 0.5 fps of the nominal rate) |
| Range | one full-range (`yuvj420p`) clip |
| HDR | **none**: every clip is Rec.709 SDR, so HDR/HLG is still unchecked (RS-304) |
| Audio | Apple spatial (`apac`) on several clips: the browser decoder logs "Unsupported audio codec"; the export is unaffected |

## Timings
| Step | Time |
|---|---|
| Probe 21 files | 0.6 s |
| Analyse 20 clips + beat-grid the 5-minute song, then assemble | 35 s (slowest clip 4-5 s: a 9 s 4K clip) |
| Export 1080×1920, 30 fps, server render | Travel Beat Montage 20.2 s reel: 25 s (1.2× real time). Beat Cut 13.5 s: 17 s (1.3×). Collage Grid 13.5 s: 30 s (2.3×) |
| Instagram finalize (re-encode + checks) | 12-27 s |

## Results
All three reels pass V1-V9, including V8 (SSIM ≥ 0.975 against the editor's own frames).

## Problems found and fixed
1. **Loudness failed even after the safe re-encode** (V6: -13.8 LUFS, true peak -0.6 dBTP). AAC overshoots the limiter by about 1 dB on this music, more than the old 0.5 dB margin. The encoder now measures the result and retries with more headroom (`instagramEncode.ts`).
2. **V8 compared the wrong frame.** The seek time was rounded up past the frame's own timestamp, so the export frame was one too late and fast shots scored 0.52. It now seeks half a frame early and also tries ±1 frame.

## Still open
- Preview smoothness and a hand-edited 30 s reel in the GUI.
- A real HDR (HLG) clip and a real variable-frame-rate clip (RS-304 used synthetic fixtures; the 20-clip set has neither).
- Export time on a 3-layer timeline at 60 s (RS-803).
