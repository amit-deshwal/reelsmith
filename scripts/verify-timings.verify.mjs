// node scripts/verify-timings.verify.mjs
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadTimings, longestFirst, saveTimings } from './verify-timings.mjs';
import { EXTRA_COMMANDS, SLOW_VERIFIES, discoverVerifies, isSlowSegment, verifyCommand } from './verify-discovery.mjs';

const dir = mkdtempSync(join(tmpdir(), 'rs-verify-timings-'));
try {
  const file = join(dir, 'nested/timings.json');
  assert.deepEqual(loadTimings(file), {}, 'no record yet');
  saveTimings([{ command: 'a', seconds: 1.04 }, { command: 'b', seconds: 60.26 }], file);
  saveTimings([{ command: 'a', seconds: 2 }], file);
  assert.deepEqual(loadTimings(file), { a: 2, b: 60.3 }, 'runs merge, newest wins');
  writeFileSync(file, 'not json');
  assert.deepEqual(loadTimings(file), {}, 'a corrupt record is ignored, not fatal');

  const timings = { fast: 1, slow: 60, mid: 10 };
  assert.deepEqual(longestFirst(['fast', 'mid', 'slow'], timings), ['slow', 'mid', 'fast']);
  assert.deepEqual(longestFirst(['fast', 'new', 'slow'], timings), ['slow', 'new', 'fast'],
    'an unrecorded suite is scheduled as slow so it never ends up as the tail');
  assert.deepEqual(longestFirst(['x', 'y'], {}), ['x', 'y'], 'ties keep their order');
} finally {
  rmSync(dir, { recursive: true, force: true });
}

// ── the fast tier names real suites and leaves the rest alone ──────────────
const discovered = new Set(discoverVerifies());
const entries = new Set(EXTRA_COMMANDS.map((c) => c.split(' ').filter((p) => !p.startsWith('-')).pop()));
for (const slow of SLOW_VERIFIES) {
  assert.ok(discovered.has(slow) || entries.has(slow), `SLOW_VERIFIES entry ${slow} is not a suite (renamed?)`);
}
assert.ok(isSlowSegment(verifyCommand('server/reelsmith/exportFixtures.verify.ts')));
assert.ok(isSlowSegment('node --import tsx server/reelsmith/avsync.mts'), 'extra commands match by file');
assert.ok(!isSlowSegment(verifyCommand('src/reelsmith/director/review.verify.ts')));
assert.ok(SLOW_VERIFIES.length < discovered.size / 10, 'the fast tier must still run nearly everything');

console.log('verify-timings.verify: ok');
