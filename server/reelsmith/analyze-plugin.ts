// Reelsmith analysis routes (local ffmpeg only):
//   POST /api/reelsmith/clip-features  { src, fps }  -> features for scoring
//   POST /api/reelsmith/music-grid     { src }       -> bpm, beats, downbeat, energy, drop, loudest section
//   POST /api/reelsmith/instagram-finalize { src, presetId } -> validation report; re-encodes in place when needed
//   POST /api/reelsmith/export-parity  { src, state } -> V8 check: 5 editor stills vs the same frames of the exported file
//   POST /api/reelsmith/selection-sheet { items: [{ src, kind, atSec, label }] } -> numbered contact sheets for agent shot selection
//   POST /api/reelsmith/upscale        { src, width, height } -> 2x enhanced copy of a small photo (`{ available:false }` when not installed)
//   POST /api/reelsmith/still-frame    { src, atSec } -> a still of that moment saved next to the video (freeze frames)
//   POST /api/reelsmith/frame-jpeg     { src, atSec } -> that frame at full size as base64 JPEG (the export's cover)
//   POST /api/reelsmith/reverse-clip   { src, startSec, frames, fps } -> that span played backwards, saved next to the video
//   POST /api/reelsmith/smooth-slow    { src, startSec, rate, frames, fps } -> that span slowed with in-between frames (RS-1259)
//   POST /api/reelsmith/depth-map      { src, atSec? } -> the photo's depth map saved next to it (`{ available:false }` without the depth-lite pack)
//   POST /api/reelsmith/no-sound-copy  { src } -> RS-1241: <name>.no-sound.mp4 next to the export (picture copied, no audio)
//   POST /api/reelsmith/speech-share   { src } -> RS-1251: { share } of seconds that are speech (narration vs song)
//   POST /api/reelsmith/brand-kit      { url } -> RS-1239: name, tagline, lines, facts, actions, links, colours of the one page the user named
import { existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { resolveUploadFile, uploadNameOfSource } from '../media-dir.ts';
import { readJsonBody, sendJson } from '../plugins/export-http.ts';
import { detectDropBeat } from '../../src/reelsmith/assembler/drop.ts';
import { analyzeBeatsFile } from './beatDetect.ts';
import { extractClipFeatures, extractReferenceCuts, speechShareOf } from './clipFeatures.ts';
import { readFrameRate } from './mediaFps.ts';
import { finalizeForInstagram } from './instagramFinalize.ts';
import { upscaleAvailable, upscalePhoto } from './upscale.ts';
import { extractStill, frameJpeg } from './stillFrame.ts';
import { reverseSpan } from './reverseClip.ts';
import { smoothSlowSpan } from './smoothSlow.ts';
import { depthMapFor, depthPackInstalled } from './depthMap.ts';
import { exportParity } from './exportParity.ts';
import { fetchBrandKit } from './brandFetch.ts';
import { noSoundCopy } from './noSoundCopy.ts';
import { buildSelectionSheets, MAX_SHEET_CELLS } from './selectionSheet.ts';
import { REEL_PRESETS, presetForCanvas } from '../../shared/reelsmith/instagramPreset.ts';

const BUILTIN_AUDIO_DIR = fileURLToPath(new URL('../../assets/audio/', import.meta.url));

/** An imported file (/media/uploads/...) or one of the bundled library songs (/audio/track-1.mp3). */
export function localFile(src: unknown): string | { error: string } {
  const builtin = typeof src === 'string' ? /^\/audio\/([\w-]+\.(?:mp3|m4a|wav))$/.exec(src)?.[1] : undefined;
  if (builtin) {
    const file = join(BUILTIN_AUDIO_DIR, builtin);
    return existsSync(file) ? file : { error: `media not found: ${builtin}` };
  }
  const name = typeof src === 'string' ? uploadNameOfSource(src) : null;
  if (!name) return { error: 'src must be a /media/uploads/ or /audio/ path' };
  return resolveUploadFile(name) ?? { error: `media not found: ${name}` };
}

/** Clip analysis is the slow part of Assemble and Preview; cache it per file version. */
const featureCache = new Map<string, ReturnType<typeof extractClipFeatures>>();

export function reelsmithAnalyzePlugin(): Plugin {
  return {
    name: 'reelsmith-analyze',
    configureServer(server) {
      const route = (path: string, handler: (body: Record<string, unknown>) => Promise<unknown>) => {
        server.middlewares.use(path, async (req, res) => {
          if (req.method !== 'POST') { sendJson(res, 405, { error: 'use POST' }); return; }
          try {
            const body = (await readJsonBody(req)) as Record<string, unknown>;
            sendJson(res, 200, { ok: true, ...(await handler(body ?? {}) as object) });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            server.config.logger.error(`[reelsmith-analyze] ${message}`);
            sendJson(res, /ENOENT|spawn/i.test(message) ? 503 : 400, { error: message });
          }
        });
      };
      route('/api/reelsmith/clip-features', async (body) => {
        const file = localFile(body.src);
        if (typeof file !== 'string') throw new Error(file.error);
        const fps = Number(body.fps) > 0 ? Number(body.fps) : 30;
        const { mtimeMs, size } = await stat(file);
        const key = `${file}|${mtimeMs}|${size}|${fps}|${body.kind === 'image'}`;
        // the promise is cached, so a build that arrives while the director's warm-up is still analysing waits for it
        let work = featureCache.get(key);
        if (!work) {
          work = extractClipFeatures(file, String(body.assetId ?? ''), fps, { maxSec: 90, stillImage: body.kind === 'image' });
          if (featureCache.size > 500) featureCache.delete(featureCache.keys().next().value!);
          featureCache.set(key, work);
          work.catch(() => { if (featureCache.get(key) === work) featureCache.delete(key); });
        }
        const features = await work;
        return { features: { ...features, assetId: String(body.assetId ?? features.assetId) } };
      });
      // RS-1250: each clip's frame rate (null when unreadable), for the Director's timeline rate
      route('/api/reelsmith/media-fps', async (body) => {
        const srcs = Array.isArray(body.srcs) ? body.srcs.slice(0, 200) : [];
        return { fps: await Promise.all(srcs.map(async (src) => {
          const file = localFile(src);
          return typeof file === 'string' ? readFrameRate(file) : null;
        })) };
      });
      // RS-1251: how much of an audio file is speech, so the director can tell the user's narration from a song
      route('/api/reelsmith/speech-share', async (body) => {
        const file = localFile(body.src);
        if (typeof file !== 'string') throw new Error(file.error);
        return { share: await speechShareOf(file) };
      });
      route('/api/reelsmith/reference-cuts', async (body) => {
        const file = localFile(body.src);
        if (typeof file !== 'string') throw new Error(file.error);
        return extractReferenceCuts(file, Number(body.fps) > 0 ? Number(body.fps) : 30);
      });
      route('/api/reelsmith/selection-sheet', async (body) => {
        const raw = Array.isArray(body.items) ? body.items.slice(0, MAX_SHEET_CELLS) : [];
        const items = raw.flatMap((entry) => {
          const e = entry as Record<string, unknown>;
          const file = localFile(e.src);
          return typeof file === 'string' ? [{ file, kind: e.kind === 'image' ? 'image' as const : 'video' as const, atSec: Number(e.atSec) || 0, label: String(e.label ?? '').slice(0, 12) }] : [];
        });
        if (!items.length) throw new Error('no usable items');
        return await buildSelectionSheets(items);
      });
      // RS-1234: a full-size frame of a file (the export's cover), returned, not saved
      route('/api/reelsmith/frame-jpeg', async (body) => {
        const file = localFile(body.src);
        if (typeof file !== 'string') throw new Error(file.error);
        const atSec = Number(body.atSec);
        if (!(atSec >= 0)) throw new Error('atSec must be a number of seconds');
        return await frameJpeg(file, atSec);
      });
      route('/api/reelsmith/still-frame', async (body) => {
        const file = localFile(body.src);
        if (typeof file !== 'string') throw new Error(file.error);
        const atSec = Number(body.atSec);
        if (!(atSec >= 0)) throw new Error('atSec must be a number of seconds');
        const still = await extractStill(file, atSec);
        return { src: `/media/uploads/${encodeURIComponent(still.name)}`, width: still.width, height: still.height };
      });
      route('/api/reelsmith/reverse-clip', async (body) => {
        const file = localFile(body.src);
        if (typeof file !== 'string') throw new Error(file.error);
        const r = await reverseSpan(file, Number(body.startSec), Math.round(Number(body.frames)), Number(body.fps));
        return { src: `/media/uploads/${encodeURIComponent(r.name)}`, width: r.width, height: r.height, frames: r.frames, hasAudio: r.hasAudio, cached: r.cached };
      });
      route('/api/reelsmith/smooth-slow', async (body) => {
        const file = localFile(body.src);
        if (typeof file !== 'string') throw new Error(file.error);
        const r = await smoothSlowSpan(file, Number(body.startSec), Number(body.rate), Math.round(Number(body.frames)), Number(body.fps));
        if ('skipped' in r) return { skipped: r.skipped, ...(r.unavailable ? { unavailable: true } : {}) };
        return { src: `/media/uploads/${encodeURIComponent(r.name)}`, width: r.width, height: r.height, frames: r.frames, hasAudio: r.hasAudio, cached: r.cached };
      });
      route('/api/reelsmith/depth-map', async (body) => {
        if (!depthPackInstalled()) return { available: false };
        const file = localFile(body.src);
        if (typeof file !== 'string') throw new Error(file.error);
        const atSec = body.atSec === undefined || body.atSec === null ? undefined : Number(body.atSec);
        if (atSec !== undefined && !(atSec >= 0)) throw new Error('atSec must be a number of seconds');
        const r = await depthMapFor(file, atSec);
        return { available: true, src: `/media/uploads/${encodeURIComponent(r.name)}`, width: r.width, height: r.height, cached: r.cached };
      });
      route('/api/reelsmith/upscale', async (body) => {
        if (!upscaleAvailable()) return { available: false };
        const file = localFile(body.src);
        if (typeof file !== 'string') throw new Error(file.error);
        const width = Number(body.width); const height = Number(body.height);
        if (!(width > 0 && height > 0)) throw new Error('width and height are required');
        const r = await upscalePhoto(file, { width, height });
        return { available: true, src: `/media/uploads/${encodeURIComponent(r.name)}`, width: r.width, height: r.height, cached: r.cached };
      });
      route('/api/reelsmith/no-sound-copy', async (body) => {
        const file = localFile(body.src);
        if (typeof file !== 'string') throw new Error(file.error);
        const copy = await noSoundCopy(file);
        return { src: `/media/uploads/${encodeURIComponent(copy.name)}`, name: copy.name, bytes: copy.bytes };
      });
      route('/api/reelsmith/brand-kit', async (body) => ({ kit: await fetchBrandKit(body.url) }));
      route('/api/reelsmith/export-parity', async (body) => {
        const file = localFile(body.src);
        if (typeof file !== 'string') throw new Error(file.error);
        return { check: await exportParity(file, body.state as never) };
      });
      route('/api/reelsmith/instagram-finalize', async (body) => {
        const file = localFile(body.src);
        if (typeof file !== 'string') throw new Error(file.error);
        const preset = REEL_PRESETS[String(body.presetId ?? 'instagram-reel')];
        if (!preset) throw new Error(`unknown preset ${String(body.presetId)}`);
        // RS-904: the size follows the project's canvas; only supported shapes are accepted
        const sized = body.width === undefined && body.height === undefined ? preset : presetForCanvas(preset, Number(body.width), Number(body.height));
        if (!sized) throw new Error(`unsupported canvas ${String(body.width)}x${String(body.height)}`);
        const holds = Array.isArray(body.holds) ? (body.holds as unknown[]).filter((h): h is [number, number] => Array.isArray(h) && h.length === 2 && h.every(Number.isFinite)) : [];
        // the delivered file has the preset's size when it passes (a 4K render is re-encoded down to it)
        return { result: await finalizeForInstagram(file, sized, {}, holds), width: sized.width, height: sized.height };
      });
      route('/api/reelsmith/music-grid', async (body) => {
        const file = localFile(body.src);
        if (typeof file !== 'string') throw new Error(file.error);
        const a = await analyzeBeatsFile(file);
        if (!a) return { grid: null };
        const dropBeat = detectDropBeat(a.energyPerBeat, 4, 2, a.downbeatIndex);
        return {
          grid: {
            bpm: a.bpm, beatTimesSec: a.beatTimesSec, beatsPerBar: 4, downbeatIndex: a.downbeatIndex,
            durationSec: a.durationSec, loudestStartSec: a.loudestStartSec,
            dropSec: dropBeat === null ? undefined : a.beatTimesSec[dropBeat],
            // RS-1224: loudness per beat, for the director's song map (quiet and loud bars)
            energyPerBeat: a.energyPerBeat.map((x) => Number(x.toPrecision(4))),
          },
        };
      });
    },
  };
}
