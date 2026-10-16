// Parallel test runner: executes every segment of the `test:serial` script
// with bounded concurrency (one child process per segment — verifies are isolated
// by their own HOME/temp dirs, so processes never share state).
//
// Falls back to serial execution on failure collection so a broken verify
// shows its output next to its name. Usage: npm test.
import { exec } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Concurrency budget: many verifies are heavyweight (model loads, vite
// builds, ffmpeg, rendering) and a full parallel suite can exhaust RAM on
// smaller machines (measured: 8 workers × heavy suites filled swap on a
// 32 GB Mac and froze the system). Default 4 is safe; raise explicitly with
// TEST_CONCURRENCY=8 on machines with headroom (and a page file).

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const testScript = pkg.scripts['test:serial'];
if (typeof testScript !== 'string' || !testScript.trim()) {
  throw new Error('package.json is missing a test:serial script');
}
// Reelsmith: the old npm pretest/posttest hooks ran ~210 s of verifies one after another around this
// pool (83% of a full run). They are now `test:pre` / `test:post` and join the same pool.
const chain = (name) => (pkg.scripts[name] ?? '').split('&&').map((s) => s.trim()).filter(Boolean);
// Longest-first scheduling: these dominate wall time (see the "slowest segments" printout), so start them
// before the pool fills with short ones. Order does not change what runs.
const SLOW_FIRST = ['npm run verify:server-runs', 'npm run verify:production-contracts', 'npm run verify:mcp', 'tsx cli/cli.verify.ts', 'tsx server/external-agent/broker.verify.ts', 'npm run test:reelsmith'];
const rank = (c) => { const i = SLOW_FIRST.findIndex((p) => c.startsWith(p)); return i === -1 ? SLOW_FIRST.length : i; };
const segments = [...chain('test:pre'), ...chain('test:serial'), ...chain('test:post')].sort((a, b) => rank(a) - rank(b));
const CONCURRENCY = Math.max(1, Math.min(8, Math.floor(Number(process.env.TEST_CONCURRENCY)) || 4));

const run = (command) => new Promise((resolve) => {
  exec(command, { maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
    resolve({ command, error, output: [stdout.slice(-1200), stderr.slice(-1200)].filter(Boolean).join('\n') });
  });
});

async function main() {
  const started = Date.now();
  const results = [];
  let cursor = 0;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (cursor < segments.length) {
      const command = segments[cursor];
      cursor += 1;
      const t0 = Date.now();
      const result = await run(command);
      result.seconds = (Date.now() - t0) / 1000;
      const name = command.slice(0, 90);
      process.stdout.write(`${result.error ? '❌' : '✅'} ${name}\n`);
      results.push(result);
    }
  });
  await Promise.all(workers);
  const failed = results.filter((r) => r.error);
  const slowest = [...results].sort((a, b) => b.seconds - a.seconds).slice(0, 8);
  console.log('\nslowest segments:');
  for (const r of slowest) console.log(`  ${r.seconds.toFixed(1).padStart(6)}s  ${r.command.slice(0, 100)}`);
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  if (failed.length === 0) {
    console.log(`\n✓ ${results.length} test segments passed in ${elapsed}s (${CONCURRENCY} parallel)`);
    process.exit(0);
  }
  console.log(`\n✗ ${failed.length}/${results.length} segments FAILED in ${elapsed}s:`);
  for (const f of failed) {
    console.log(`\n--- ${f.command} ---`);
    console.log(f.output);
  }
  process.exit(1);
}

main();
