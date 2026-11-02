// Affected-only verify runner: runs the verifies that match files changed
// in the working tree (or an explicit file list). Full `npm test` stays for
// release gates; this covers the daily loop in seconds.
//
// Reelsmith: selection follows the reverse import graph (scripts/import-graph.mjs): every verify
// that reaches a changed file through imports or repo-path literals runs, wherever it lives.
// The old nearest-directory heuristic remains only as the fallback for a file nothing reaches.
// Root configuration and unmapped changes still require the full gate instead of claiming coverage.
//
// Usage:
//   npm run verify:affected            — all working-tree changes vs HEAD
//   npm run verify:affected -- <file>… — explicit files
//   npm run verify:affected -- --list <file>… — inspect without executing tests
import { execFile } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { buildReverseGraph, dependentsOf } from './import-graph.mjs';
import { EXTRA_COMMANDS, verifyCommand } from './verify-discovery.mjs';
import { concurrency, longestFirst, printFailures, runPool } from './verify-timings.mjs';

const CONCURRENCY = concurrency();
const SOURCE_EXTENSION = /\.(?:tsx|mts|cjs|mjs|ts|js|frag|vert|glsl)$/;
const VERIFY_EXTENSION = /\.verify\.(?:tsx|mts|cjs|mjs|ts|js)$/;
/** Changes nothing can be traced from: always the full gate. */
const FULL_GATE = /^(?:package(?:-lock)?\.json$|npm-shrinkwrap\.json$|tsconfig(?:\.[^/]+)?\.json$|config\/|public\/|\.github\/)/;
/** Runtime assets: covered when the graph finds their readers, else the full gate. */
const ASSETS = /^assets\//;
const DOCUMENTATION = /^(?:docs\/|reelsmith-docs\/|[^/]+\.md$|LICENSE$|\.claude\/)/;
/** A bundled skill folder (src/agent/skills/<name>/…): read by directory listing, never imported. */
const SKILL_FILE = /^src\/agent\/skills\/([^/]+)\/.+/;
const SKILL_SUITES = ['server/external-agent/external-skill.verify.mjs', 'server/skills-files.verify.ts'];
const toPosix = (value) => value.split(sep).join('/');

export async function gitChanged(cwd = process.cwd()) {
  const run = promisify(execFile);
  const outputs = await Promise.all([
    run('git', ['diff', '--name-only', '--no-renames', '-z', 'HEAD'], { cwd }),
    run('git', ['ls-files', '--others', '--exclude-standard', '-z'], { cwd }),
  ]);
  return [...new Set(outputs.flatMap(({ stdout }) => stdout.split('\0').filter(Boolean)))];
}

function directoryVerifies(dir, cwd) {
  try {
    return readdirSync(resolve(cwd, dir)).filter((name) => VERIFY_EXTENSION.test(name));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

/** Nearest directory with suites; an exact same-name verify narrows it to that file. */
function directoryFallback(file, cwd) {
  let dir = dirname(file);
  let candidates = directoryVerifies(dir, cwd);
  const base = file.split('/').pop().replace(SOURCE_EXTENSION, '');
  const exact = candidates.filter((name) => name.replace(VERIFY_EXTENSION, '') === base);
  if (exact.length) candidates = exact;
  while (!candidates.length && dir !== '.') {
    dir = dirname(dir);
    candidates = directoryVerifies(dir, cwd);
  }
  return candidates.map((name) => toPosix(join(dir, name)));
}

/** The file an EXTRA_COMMANDS entry runs, so the graph can select the command like a suite. */
const commandEntry = (command) => command.split(' ').filter((part) => !part.startsWith('-')).pop();

const graphs = new Map();
const graphFor = (cwd) => {
  if (!graphs.has(cwd)) graphs.set(cwd, buildReverseGraph(cwd));
  return graphs.get(cwd);
};

export function affectedSelection(changedFiles, cwd = process.cwd()) {
  const matches = new Set();
  const commands = new Set();
  const requiresFullGate = new Set();
  const { known, reverse } = graphFor(cwd);
  const entries = new Map(EXTRA_COMMANDS.map((command) => [commandEntry(command), command]));
  const select = (file) => {
    if (VERIFY_EXTENSION.test(file)) matches.add(file);
    if (entries.has(file)) commands.add(entries.get(file));
  };
  for (const changed of changedFiles) {
    const file = toPosix(relative(cwd, resolve(cwd, changed)));
    if (file.startsWith('../') || FULL_GATE.test(file)) {
      requiresFullGate.add(file);
      continue;
    }
    if (DOCUMENTATION.test(file)) continue;
    const before = matches.size + commands.size;
    select(file);
    const dependents = known.has(file) ? dependentsOf(file, reverse, (f) => VERIFY_EXTENSION.test(f)) : new Set();
    for (const dependent of dependents) select(dependent);

    const skill = SKILL_FILE.exec(file);
    if (skill && !SOURCE_EXTENSION.test(file)) {
      for (const name of directoryVerifies('src/agent/skills', cwd)) matches.add(`src/agent/skills/${name}`);
      for (const suite of SKILL_SUITES) if (known.has(suite)) matches.add(suite);
      for (const suite of suitesMentioning(skill[1], known, cwd)) matches.add(suite);
      commands.add(entries.get('server/agent-runs/generate-tool-catalog.mts'));
      continue;
    }
    if (/^src\/gl\/.*\.(?:frag|vert|glsl)$/.test(file)) {
      for (const name of directoryVerifies('src/gl', cwd)) matches.add(toPosix(join('src/gl', name)));
    }
    if (matches.size + commands.size > before) continue;
    if (ASSETS.test(file) || !SOURCE_EXTENSION.test(file)) {
      requiresFullGate.add(file);
      continue;
    }
    const fallback = directoryFallback(file, cwd);
    if (!fallback.length) requiresFullGate.add(file);
    for (const suite of fallback) matches.add(suite);
  }
  commands.delete(undefined);
  return { verifies: [...matches].sort(), commands: [...commands].sort(), requiresFullGate: [...requiresFullGate].sort() };
}

function suitesMentioning(word, known, cwd) {
  const out = [];
  for (const file of known) {
    if (!VERIFY_EXTENSION.test(file)) continue;
    try {
      if (readFileSync(join(cwd, file), 'utf8').includes(word)) out.push(file);
    } catch { /* deleted in the working tree */ }
  }
  return out;
}

export function matchingVerifies(changedFiles) {
  return affectedSelection(changedFiles).verifies;
}

// How each verify is invoked (tsx, node, run-check.mjs, tsconfig flags) lives in
// scripts/verify-discovery.mjs, shared with `npm test`, so the two cannot drift.
export { verifyCommand };

async function main() {
  const explicit = process.argv.slice(2).filter((arg) => !arg.startsWith('-'));
  const changed = explicit.length > 0 ? explicit : await gitChanged();
  const { verifies, commands, requiresFullGate } = affectedSelection(changed);
  if (process.argv.includes('--list')) console.log([...verifies, ...commands].join('\n'));
  if (requiresFullGate.length) {
    console.error(`Affected selection cannot establish coverage for:\n  ${requiresFullGate.join('\n  ')}`);
    console.error('Run the broader gate: npm run lint && npm test && npm run build');
    process.exitCode = 2;
    return;
  }
  if (process.argv.includes('--list')) return;
  if (verifies.length + commands.length === 0) {
    console.log('✓ no affected verifies (no changes or documentation only)');
    console.log(`  changed: ${changed.slice(0, 6).join(', ') || '(none)'}`);
    return;
  }
  await runSelected([...verifies.map(verifyCommand), ...commands]);
}

async function runSelected(segments) {
  console.log(`Running ${segments.length} affected verifies (${CONCURRENCY} parallel):`);
  const started = Date.now();
  const label = (command) => command.split(' ').filter((part) => !part.startsWith('-')).slice(-1)[0] ?? command;
  const results = await runPool(longestFirst(segments), { parallel: CONCURRENCY, label });
  const failed = results.filter((r) => r.error);
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  if (failed.length === 0) {
    console.log(`\n✓ ${results.length} affected verifies passed in ${elapsed}s`);
    process.exit(0);
  }
  console.log(`\n✗ ${failed.length}/${results.length} failed in ${elapsed}s:`);
  printFailures(failed, (r) => label(r.command));
  process.exit(1);
}

// Only run when invoked directly, so the verify can import the matcher.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error); process.exitCode = 1; });
}
