// Verify timings + the shared parallel pool (Reelsmith).
//
// Wall time of a parallel run is set by its longest suites. A hand-kept "slow first" list
// went stale (the two 60 s suites were not on it, so they started late and set the finish).
// Each run now records seconds per command in node_modules/.cache (never committed), and the
// next run starts the longest first. A command with no record (new suite, fresh clone, CI)
// is treated as slow, so unknowns never end up as the tail.
import { exec } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const TIMINGS_FILE = join(ROOT, 'node_modules/.cache/reelsmith/verify-timings.json');
const UNKNOWN_SECONDS = 30;

export function loadTimings(file = TIMINGS_FILE) {
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** Merge this run's seconds into the record. Failed runs are kept too: a failure is often a timeout. */
export function saveTimings(results, file = TIMINGS_FILE) {
  const merged = { ...loadTimings(file) };
  for (const { command, seconds } of results) merged[command] = Math.round(seconds * 10) / 10;
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${JSON.stringify(merged, null, 1)}\n`);
  } catch {
    // A read-only checkout still runs its tests; it just schedules by guess next time.
  }
}

/** Longest expected first; ties keep their given order. */
export function longestFirst(commands, timings = loadTimings()) {
  const expected = (command) => timings[command] ?? UNKNOWN_SECONDS;
  return commands.map((command, index) => ({ command, index }))
    .sort((a, b) => expected(b.command) - expected(a.command) || a.index - b.index)
    .map(({ command }) => command);
}

export const concurrency = () => Math.max(1, Math.min(8, Math.floor(Number(process.env.TEST_CONCURRENCY)) || 4));

/** Run commands in a bounded pool, printing one line per finished command. */
export async function runPool(commands, { parallel = concurrency(), label = (command) => command.slice(0, 90) } = {}) {
  const results = [];
  let cursor = 0;
  const run = (command) => new Promise((resolve) => {
    const t0 = Date.now();
    exec(command, { maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
      resolve({
        command, error, seconds: (Date.now() - t0) / 1000,
        output: [stdout.slice(-1200), stderr.slice(-1200)].filter(Boolean).join('\n'),
      });
    });
  });
  await Promise.all(Array.from({ length: parallel }, async () => {
    while (cursor < commands.length) {
      const command = commands[cursor];
      cursor += 1;
      const result = await run(command);
      process.stdout.write(`${result.error ? '❌' : '✅'} ${label(command)}${result.seconds >= 10 ? ` (${result.seconds.toFixed(0)}s)` : ''}\n`);
      results.push(result);
    }
  }));
  saveTimings(results);
  return results;
}

export function printFailures(failed, name = (r) => r.command) {
  for (const f of failed) {
    console.log(`\n--- ${name(f)} ---`);
    console.log(f.output);
  }
}
