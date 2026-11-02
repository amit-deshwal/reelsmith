// Parallel test runner: executes every discovered verify file
// with bounded concurrency (one child process per segment — verifies are isolated
// by their own HOME/temp dirs, so processes never share state).
//
// Falls back to serial execution on failure collection so a broken verify
// shows its output next to its name. Usage: npm test.
//
// Concurrency budget: many verifies are heavyweight (model loads, vite
// builds, ffmpeg, rendering) and a full parallel suite can exhaust RAM on
// smaller machines (measured: 8 workers × heavy suites filled swap on a
// 32 GB Mac and froze the system). Default 4 is safe; raise explicitly with
// TEST_CONCURRENCY=8 on machines with headroom (and a page file).
//
// Segments come from discovery (scripts/verify-discovery.mjs): every tracked *.verify.* file is a
// test, so adding one needs no package.json edit. Optional filter: `npm test -- <substring>…`.
//
// Reelsmith: `--fast` (npm run test:fast) leaves out SLOW_VERIFIES (renders, exports, CLI and
// server end-to-end runs) for the edit loop; plain `npm test` stays the complete gate. Scheduling
// is longest-first from recorded timings (scripts/verify-timings.mjs).
import { EXTRA_COMMANDS, SLOW_VERIFIES, isSlowSegment, discoverVerifies, verifyCommand } from './verify-discovery.mjs';
import { concurrency, longestFirst, printFailures, runPool } from './verify-timings.mjs';

const fast = process.argv.includes('--fast');
const filters = process.argv.slice(2).filter((arg) => !arg.startsWith('-'));
const files = discoverVerifies()
  .filter((f) => filters.length === 0 || filters.some((p) => f.includes(p)))
  .filter((f) => !fast || !isSlowSegment(f));
const extras = filters.length ? [] : EXTRA_COMMANDS.filter((c) => !fast || !isSlowSegment(c));
const segments = longestFirst([...files.map(verifyCommand), ...extras]);
if (segments.length === 0) throw new Error(`no verify files match: ${filters.join(', ')}`);
const CONCURRENCY = concurrency();

async function main() {
  const started = Date.now();
  const results = await runPool(segments, { parallel: CONCURRENCY });
  const failed = results.filter((r) => r.error);
  const slowest = [...results].sort((a, b) => b.seconds - a.seconds).slice(0, 8);
  console.log('\nslowest segments:');
  for (const r of slowest) console.log(`  ${r.seconds.toFixed(1).padStart(6)}s  ${r.command.slice(0, 100)}`);
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  const tier = fast ? `, fast tier: ${SLOW_VERIFIES.length} slow suites skipped, run \`npm test\` before pushing` : '';
  if (failed.length === 0) {
    console.log(`\n✓ ${results.length} test segments passed in ${elapsed}s (${CONCURRENCY} parallel${tier})`);
    process.exit(0);
  }
  console.log(`\n✗ ${failed.length}/${results.length} segments FAILED in ${elapsed}s:`);
  printFailures(failed);
  process.exit(1);
}

main();
