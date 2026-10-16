// Reelsmith analysis routes (local ffmpeg only):
//   POST /api/reelsmith/clip-features  { src, fps }  -> features for scoring
//   POST /api/reelsmith/music-grid     { src }       -> bpm, beats, downbeat, energy, drop, loudest section
//   POST /api/reelsmith/instagram-finalize { src, presetId } -> validation report; re-encodes in place when needed
//   POST /api/reelsmith/export-parity  { src, state } -> V8 check: 5 editor stills vs the same frames of the exported file
//   POST /api/reelsmith/preview        { project, seconds } -> 360x640 muted loop of an assembled recipe
import { stat } from 'node:fs/promises';
import type { Plugin } from 'vite';
import { resolveUploadFile, uploadNameOfSource } from '../media-dir.ts';
import { readJsonBody, sendJson } from '../plugins/export-http.ts';
import { detectDropBeat } from '../../src/reelsmith/assembler/drop.ts';
import { analyzeBeatsFile } from './beatDetect.ts';
import { extractClipFeatures } from './clipFeatures.ts';
import { finalizeForInstagram } from './instagramFinalize.ts';
import { exportParity } from './exportParity.ts';
import { renderRecipePreview, type PreviewRequest } from './previewRender.ts';
import { REEL_PRESETS } from '../../shared/reelsmith/instagramPreset.ts';

function localFile(src: unknown): string | { error: string } {
  const name = typeof src === 'string' ? uploadNameOfSource(src) : null;
  if (!name) return { error: 'src must be a /media/uploads/ path' };
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
        return { result: await finalizeForInstagram(file, preset) };
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
