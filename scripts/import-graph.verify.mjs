// node scripts/import-graph.verify.mjs
// import-graph: no-path-literals (the paths below are fixtures, not dependencies)
import assert from 'node:assert/strict';
import { buildReverseGraph, dependenciesOf, dependentsOf, resolveSpecifier } from './import-graph.mjs';

const known = new Set([
  'src/a.ts', 'src/b.tsx', 'src/dir/index.ts', 'src/shader.frag', 'src/data.json', 'src/c.mts',
  'cli/occ.mjs', 'recipes/travel.recipe.json', 'src/a.verify.ts', 'scripts/table.mjs',
]);

// ── specifier resolution ───────────────────────────────────────────────────
assert.equal(resolveSpecifier('src/x.ts', './a', known), 'src/a.ts', 'extensionless');
assert.equal(resolveSpecifier('src/x.ts', './a.js', known), 'src/a.ts', 'TS ESM .js resolves to .ts');
assert.equal(resolveSpecifier('src/x.ts', './c.mjs', known), 'src/c.mts', '.mjs resolves to .mts');
assert.equal(resolveSpecifier('src/x.ts', './b', known), 'src/b.tsx');
assert.equal(resolveSpecifier('src/x.ts', './dir', known), 'src/dir/index.ts', 'directory index');
assert.equal(resolveSpecifier('src/x.ts', './shader.frag?raw', known), 'src/shader.frag', 'Vite query stripped');
assert.equal(resolveSpecifier('src/x.ts', '/src/a.ts', known), 'src/a.ts', 'root-absolute Vite path');
assert.equal(resolveSpecifier('src/x.ts', 'react', known), undefined, 'packages are not edges');
assert.equal(resolveSpecifier('src/x.ts', '../../outside', known), undefined);

// ── edge kinds ─────────────────────────────────────────────────────────────
const source = `
import { x } from './a.js';
import type { Y } from "./b";
export * from './dir';
import './data.json';
const lazy = await import('./c.mjs');
const raw = require('./shader.frag?raw');
const worker = new URL('./a.ts', import.meta.url);
spawn('node', ['cli/occ.mjs']);
readFileSync('recipes/travel.recipe.json');
const notAFile = 'src/missing.ts';
`;
assert.deepEqual([...dependenciesOf('src/x.ts', source, known)].sort(), [
  'cli/occ.mjs', 'recipes/travel.recipe.json', 'src/a.ts', 'src/b.tsx', 'src/c.mts', 'src/data.json',
  'src/dir/index.ts', 'src/shader.frag',
]);
assert.deepEqual([...dependenciesOf('scripts/x.mjs', "// import-graph: no-path-literals\nrun('cli/occ.mjs')", known)], [],
  'the opt-out marker drops literal edges');

// ── walk: transitive, and stops above a leaf ───────────────────────────────
const reverse = new Map([
  ['src/a.ts', new Set(['src/b.tsx', 'src/a.verify.ts'])],
  ['src/b.tsx', new Set(['src/dir/index.ts'])],
  ['src/a.verify.ts', new Set(['scripts/table.mjs'])],
]);
assert.deepEqual([...dependentsOf('src/a.ts', reverse)].sort(),
  ['scripts/table.mjs', 'src/a.verify.ts', 'src/b.tsx', 'src/dir/index.ts']);
assert.deepEqual([...dependentsOf('src/a.ts', reverse, (f) => f.endsWith('.verify.ts'))].sort(),
  ['src/a.verify.ts', 'src/b.tsx', 'src/dir/index.ts'], 'nothing above a leaf is reached through it');

// ── the real repository builds quickly and finds a known edge ──────────────
const t0 = performance.now();
const graph = buildReverseGraph(process.cwd());
const ms = performance.now() - t0;
assert.ok(graph.known.size > 2000, `expected the whole repo, got ${graph.known.size} files`);
assert.ok(graph.reverse.get('server/agent-runs/tool-policy.ts')?.size, 'tool-policy.ts has importers');
assert.ok(ms < 5000, `graph build took ${ms.toFixed(0)} ms`);

console.log(`import-graph.verify: ok (${graph.known.size} files in ${ms.toFixed(0)} ms)`);
