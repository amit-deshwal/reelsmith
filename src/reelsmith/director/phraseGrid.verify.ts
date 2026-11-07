import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ffmpegBin } from '../../../server/media-binaries.ts';
import { analyzeBeatsFile } from '../../../server/reelsmith/beatDetect.ts';
import { beatThisSongGrid, phraseGrid } from './phraseGrid.ts';
import type { MusicAnalysis } from '../../audio/intelligence/types.ts';

const model = { beatsMs: Array.from({ length: 48 }, (_, i) => 300 + i * 500), downbeatsMs: [300, 2300], beatEnergy: Array.from({ length: 48 }, (_, i) => i < 16 ? 0.2 : 0.8), durationMs: 25_000, meter: 4, sections: [{ fromMs: 0, energy: 0.2, role: 'build' }, { fromMs: 8300, energy: 0.8, role: 'peak' }] } as MusicAnalysis;
const modelGrid = beatThisSongGrid(model)!;
assert.equal(modelGrid.downbeatIndex, 0);
assert.equal(modelGrid.dropSec, 8.3);
assert.deepEqual(phraseGrid(modelGrid.beatTimesSec, modelGrid.downbeatIndex, modelGrid.energyPerBeat, 0, 36)?.fourBar.slice(0, 3).map((p) => p.songSec), [0.3, 8.3, 16.3]);
assert.equal(beatThisSongGrid({ ...model, beatEnergy: undefined }), null, 'older analysis falls back to the local grid');

const dir = mkdtempSync(join(tmpdir(), 'rs-phrase-grid-'));
try {
  // 120 BPM click track with the first accent at 0.3 s and a lift after four bars.
  const file = join(dir, 'click.wav');
  const click = `(lt(t,8.3)*0.25+gte(t,8.3)*0.9)*exp(-40*mod(t-0.3,0.5))*sin(2*PI*90*t)*gte(t,0.3)`;
  execFileSync(ffmpegBin(), ['-v', 'error', '-y', '-f', 'lavfi', '-i', `aevalsrc='${click}':s=44100:d=25`, file]);
  const analysis = await analyzeBeatsFile(file);
  assert.ok(analysis);
  const grid = phraseGrid(analysis.beatTimesSec, analysis.downbeatIndex, analysis.energyPerBeat, analysis.downbeatIndex, 36);
  assert.ok(grid);
  assert.deepEqual(grid.fourBar.slice(0, 3).map((p) => p.reelBeat), [0, 16, 32]);
  assert.deepEqual(grid.eightBar.slice(0, 2).map((p) => p.reelBeat), [0, 32]);
  assert.deepEqual(grid.songFourBarSec.slice(0, 3), grid.fourBar.slice(0, 3).map((p) => p.songSec));
  assert.ok(Math.abs(grid.fourBar[1]!.songSec - grid.fourBar[0]!.songSec - 8) < 0.1);
  assert.ok(grid.energyByBeat.slice(16, 28).reduce((a, b) => a + b, 0) > grid.energyByBeat.slice(0, 12).reduce((a, b) => a + b, 0));
  const offset = phraseGrid(analysis.beatTimesSec, analysis.downbeatIndex, analysis.energyPerBeat, analysis.downbeatIndex + 8, 24)!;
  assert.deepEqual(offset.fourBar.slice(0, 2).map((p) => p.reelBeat), [8, 24]);
  assert.equal(phraseGrid([], 0, [], 0, 32), null);
  console.log('phraseGrid.verify: ok');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
