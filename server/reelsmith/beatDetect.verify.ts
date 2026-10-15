import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { analyzeBeatsFile } from './beatDetect.ts';
import { detectDropBeat } from '../../src/reelsmith/assembler/drop.ts';

const dir = mkdtempSync(join(tmpdir(), 'rs-beat-'));
try {
  // 120 bpm click track (kick-like bursts) starting at 0.3 s; quiet for 8 s then loud
  const f = join(dir, 'clicks.wav');
  const bpm = 120; const period = 60 / bpm;
  const expr = `(lt(t,8)*0.25+gte(t,8)*0.9)*exp(-40*mod(t-0.3,${period}))*sin(2*PI*90*t)*gte(t,0.3)`;
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', `aevalsrc='${expr}':s=44100:d=16`, f]);
  const a = await analyzeBeatsFile(f);
  assert.ok(a, 'a tempo is found');
  assert.ok(Math.abs(a!.bpm - 120) < 2, `bpm ${a!.bpm}`);
  const first = a!.beatTimesSec[0]!;
  assert.ok(Math.abs(((first - 0.3) % period + period) % period) < 0.06 || Math.abs(((first - 0.3) % period + period) % period - period) < 0.06, `phase ${first}`);
  // beat spacing is even
  const gaps = a!.beatTimesSec.slice(1).map((t, i) => t - a!.beatTimesSec[i]!);
  assert.ok(gaps.every((g) => Math.abs(g - 60 / a!.bpm) < 1e-6));
  // the drop at 8 s is found within a bar
  const drop = detectDropBeat(a!.energyPerBeat, 4);
  assert.ok(drop !== null, 'drop found');
  const dropSec = a!.beatTimesSec[drop!]!;
  assert.ok(Math.abs(dropSec - 8) <= 2.1, `drop at ${dropSec}`);
  assert.ok(a!.loudestStartSec >= 6, 'loudest section is after the quiet intro');
  // silence => no tempo, no crash
  const s = join(dir, 'silence.wav');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=mono', '-t', '10', s]);
  assert.equal(await analyzeBeatsFile(s), null);
  console.log('beatDetect.verify: ok');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
