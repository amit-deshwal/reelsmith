// Reelsmith analysis routes (local ffmpeg only):
//   POST /api/reelsmith/clip-features  { src, fps }  -> features for scoring
//   POST /api/reelsmith/music-grid     { src }       -> bpm, beats, downbeat, energy, drop, loudest section
//   POST /api/reelsmith/instagram-finalize { src, presetId } -> validation report; re-encodes in place when needed
//   POST /api/reelsmith/export-parity  { src, state } -> V8 check: 5 editor stills vs the same frames of the exported file
//   POST /api/reelsmith/selection-sheet { items: [{ src, kind, atSec, label }] } -> numbered contact sheets for agent shot selection
//   POST /api/reelsmith/preview        { project, seconds } -> 360x640 muted loop of an assembled recipe
import { existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import { resolveUploadFile, uploadNameOfSource } from '../media-dir.ts';
import { readJsonBody, sendJson } from '../plugins/export-http.ts';
import { detectDropBeat } from '../../src/reelsmith/assembler/drop.ts';
import { analyzeBeatsFile } from './beatDetect.ts';
import { extractClipFeatures } from './clipFeatures.ts';
import { finalizeForInstagram } from './instagramFinalize.ts';
import { exportParity } from './exportParity.ts';
import { buildSelectionSheets } from './selectionSheet.ts';
import { renderRecipePreview, type PreviewRequest } from './previewRender.ts';
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
const featureCache = new Map<string, Awaited<ReturnType<typeof extractClipFeatures>>>();

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
        let features = featureCache.get(key);
        if (!features) {
          features = await extractClipFeatures(file, String(body.assetId ?? ''), fps, { maxSec: 90, stillImage: body.kind === 'image' });
          if (featureCache.size > 500) featureCache.delete(featureCache.keys().next().value!);
          featureCache.set(key, features);
        }
        return { features: { ...features, assetId: String(body.assetId ?? features.assetId) } };
      });
      route('/api/reelsmith/selection-sheet', async (body) => {
        const raw = Array.isArray(body.items) ? body.items.slice(0, 60) : [];
        const items = raw.flatMap((entry) => {
          const e = entry as Record<string, unknown>;
          const file = localFile(e.src);
          return typeof file === 'string' ? [{ file, kind: e.kind === 'image' ? 'image' as const : 'video' as const, atSec: Number(e.atSec) || 0, label: String(e.label ?? '').slice(0, 12) }] : [];
        });
        if (!items.length) throw new Error('no usable items');
        return await buildSelectionSheets(items);
      });
      route('/api/reelsmith/preview', async (body) => renderRecipePreview(body as unknown as PreviewRequest));
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
        return { result: await finalizeForInstagram(file, sized) };
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
          },
        };
      });
    },
  };
}
