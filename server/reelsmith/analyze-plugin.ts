// Reelsmith analysis routes (local ffmpeg only):
//   POST /api/reelsmith/clip-features  { src, fps }  -> features for scoring
//   POST /api/reelsmith/music-grid     { src }       -> bpm, beats, downbeat, energy, drop, loudest section
import type { Plugin } from 'vite';
import { resolveUploadFile, uploadNameOfSource } from '../media-dir.ts';
import { readJsonBody, sendJson } from '../plugins/export-http.ts';
import { detectDropBeat } from '../../src/reelsmith/assembler/drop.ts';
import { analyzeBeatsFile } from './beatDetect.ts';
import { extractClipFeatures } from './clipFeatures.ts';

function localFile(src: unknown): string | { error: string } {
  const name = typeof src === 'string' ? uploadNameOfSource(src) : null;
  if (!name) return { error: 'src must be a /media/uploads/ path' };
  return resolveUploadFile(name) ?? { error: `media not found: ${name}` };
}

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
        return { features: await extractClipFeatures(file, String(body.assetId ?? ''), fps, { maxSec: 90 }) };
      });
      route('/api/reelsmith/music-grid', async (body) => {
        const file = localFile(body.src);
        if (typeof file !== 'string') throw new Error(file.error);
        const a = await analyzeBeatsFile(file);
        if (!a) return { grid: null };
        const dropBeat = detectDropBeat(a.energyPerBeat, 4);
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
