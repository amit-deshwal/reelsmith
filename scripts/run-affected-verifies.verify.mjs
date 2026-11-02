// verify:affected is the loop developers actually run; npm test is the gate.
// A fast runner that quietly runs nothing is worse than a slow one, and this
// runner did exactly that: the directory fallback bailed out when a directory
// held more than 8 verifies and printed "no affected verifies" — success —
// which silently covered 16 directories and 433 of the repo's verify files,
// the busiest ones included. It also only ever matched `.verify.ts`, leaving
// every `.verify.tsx` and `.verify.mjs` unreachable, and it assumed every
// suite runs under `npx tsx`, which is false for the ones importing Vite-only
// `?raw`/`.frag` modules.
// node scripts/run-affected-verifies.verify.mjs
// import-graph: no-path-literals (the paths below are fixtures, not dependencies)
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { affectedSelection, gitChanged, matchingVerifies, verifyCommand } from './run-affected-verifies.mjs';

const countIn = (dir, re = /\.verify\.(ts|tsx|mjs)$/) => readdirSync(dir).filter((n) => re.test(n)).length;

// ── selection follows imports, wherever the importing suite lives ───────────
{
  const picked = matchingVerifies(['src/export/browserExport.ts']);
  assert.ok(picked.includes('src/export/browserExport.verify.ts'), 'the same-name verify is selected');
  assert.ok(picked.some((p) => !p.startsWith('src/export/')),
    'suites in other directories that import the file are selected too');

  // Precision: a director module selects the suites that reach it, not its whole 25-suite directory.
  const director = matchingVerifies(['src/reelsmith/director/approvalGate.ts']);
  assert.ok(director.includes('src/reelsmith/director/approvalGate.verify.ts'));
  assert.ok(director.length < countIn('src/reelsmith/director'),
    'an import-graph selection is narrower than the directory');

  // A widely imported module reaches its distant suites (the directory rule ran shared/ as the full gate).
  const shared = affectedSelection(['shared/reelsmith/instagramPreset.ts']);
  assert.deepEqual(shared.requiresFullGate, []);
  assert.ok(shared.verifies.includes('server/reelsmith/instagramFinalize.verify.ts'));
}

// ── a file nothing reaches keeps the directory fallback ────────────────────
{
  assert.ok(matchingVerifies(['desktop/prepare-target.mts']).includes('desktop/desktop.verify.ts'),
    '.mts sources nothing imports reach their directory suites');
}

// ── .tsx and .mjs suites are reachable ─────────────────────────────────────
{
  assert.ok(matchingVerifies(['remotion/render-timeout.mjs']).includes('remotion/render-timeout.verify.mjs'),
    'an .mjs verify matches its .mjs source');
  const preview = matchingVerifies(['src/components/preview/previewCanvasGeometry.ts']);
  assert.ok(preview.some((p) => p.endsWith('.verify.tsx')), '.tsx verifies must be selectable');
}

// ── docs, skills, schemas and root configuration ───────────────────────────
{
  for (const doc of ['README.md', 'UPSTREAM_README.md', 'reelsmith-docs/UPSTREAM_PATCHES.md']) {
    assert.deepEqual(affectedSelection([doc]), { verifies: [], commands: [], requiresFullGate: [] }, doc);
  }
  for (const file of ['assets/x.png', 'package.json', 'package-lock.json', 'config/vite.config.ts',
    'tsconfig.app.json', 'no/such/dir/file.ts']) {
    assert.ok(affectedSelection([file]).requiresFullGate.includes(file), `${file} cannot silently pass`);
  }
  const catalog = 'node --import tsx server/agent-runs/generate-tool-catalog.mts --check';
  const skill = affectedSelection(['src/agent/skills/reels-director/SKILL.md']);
  assert.deepEqual(skill.requiresFullGate, [], 'a skill edit is covered, not a full-gate refusal');
  assert.ok(skill.verifies.includes('server/external-agent/external-skill.verify.mjs'));
  assert.ok(skill.verifies.includes('src/agent/skills/skill-loading.verify.ts'));
  assert.ok(skill.verifies.includes('src/reelsmith/director/catalogText.verify.ts'), 'suites naming the skill run');
  assert.ok(skill.commands.includes(catalog));
  const schemas = affectedSelection(['assets/agent/openchatcut-tool-schemas.json']);
  assert.deepEqual(schemas.requiresFullGate, [], 'an imported asset is covered by its readers');
  assert.ok(schemas.commands.includes(catalog), 'the generated catalog is checked against the schemas');
  assert.ok(affectedSelection(['src/agent/tools/beat-tools.ts']).commands.includes(catalog),
    'a tool schema edit runs the catalog check');
  assert.ok(matchingVerifies(['src/gl/fx/invert.frag']).includes('src/gl/clipFxExport.verify.mjs'),
    'shader changes reach the render verification in the parent directory');
  assert.ok(!matchingVerifies(['src/app/EditorGuards.tsx']).includes('scripts/verify-gate-coverage.verify.mjs'),
    'a table of verify paths (the runners) is not a consumer of every suite');
}

// ── the command matches what the suite itself uses ─────────────────────────
{
  // These two reach a Vite-only `?raw` import and fail under bare tsx.
  for (const file of [
    'src/agent/tools/effect-tools.verify.ts',
    'src/agent/tools/library-edit-item.verify.ts',
  ]) {
    assert.match(verifyCommand(file), /run-check\.mjs/,
      `${file} must run through run-check.mjs, as package.json does`);
  }
  assert.match(verifyCommand('src/export/browserExport.verify.ts'), /tsx/,
    'ordinary suites run under tsx');
  // A suite listed in LAUNCHERS always uses that launcher, whatever its extension —
  // remotion/render-timeout.verify.mjs runs under tsx, not node, and
  // this runner must not "correct" it.
  assert.equal(
    verifyCommand('remotion/render-timeout.verify.mjs'),
    'node --import tsx remotion/render-timeout.verify.mjs',
    'the launcher table wins over any extension-based guess',
  );
  // Only unlisted files fall back, and then the extension decides.
  assert.match(verifyCommand('src/does/not/exist.verify.ts'), /^node --import tsx /,
    'an unregistered .ts suite still gets a usable default');
  assert.match(verifyCommand('src/does/not/exist.verify.mjs'), /^node /,
    'an unregistered .mjs suite falls back to bare node');
  assert.match(verifyCommand('src/does/not/exist.verify.cjs'), /^node /);
  assert.match(verifyCommand('src/does/not/exist.verify.js'), /^node /);
  assert.match(verifyCommand('src/does/not/exist.verify.mts'), /^node --import tsx /);
}

const temporary = realpathSync(mkdtempSync(join(tmpdir(), 'openchatcut-affected-')));
try {
  mkdirSync(join(temporary, 'scripts'));
  mkdirSync(join(temporary, 'src'));
  for (const extension of ['mts', 'js', 'cjs']) {
    writeFileSync(join(temporary, `src/example.verify.${extension}`), '');
  }
  const git = (...args) => execFileSync('git', ['-C', temporary, ...args], { stdio: 'pipe' });
  git('init', '-q');
  assert.equal(affectedSelection(['src/example.js'], temporary).verifies.length, 3,
    'all supported same-name suites run, not just the first directory entry');
  assert.deepEqual(affectedSelection(['src/example.verify.cjs'], temporary).verifies,
    ['src/example.verify.cjs'], 'an edited verify runs itself');

  // A real isolated Git repository proves both tracked and untracked collection.
  git('-c', 'user.name=Verify', '-c', 'user.email=verify@example.invalid',
    '-c', 'commit.gpgsign=false', 'commit', '--allow-empty', '-qm', 'test fixture');
  git('add', 'src/example.verify.js');
  assert.deepEqual((await gitChanged(temporary)).sort(), [
    'src/example.verify.cjs', 'src/example.verify.js', 'src/example.verify.mts',
  ]);

  // Execute only tiny fixture suites, never the real expensive selected suite.
  for (const runner of ['run-tests.mjs', 'run-affected-verifies.mjs', 'verify-discovery.mjs', 'import-graph.mjs', 'verify-timings.mjs']) {
    copyFileSync(new URL(runner, import.meta.url), join(temporary, 'scripts', runner));
  }
  writeFileSync(join(temporary, 'src/example.verify.cjs'), `console.log('fixture passed');`);
  const run = (runner, args = []) => spawnSync(process.execPath, [join(temporary, 'scripts', runner), ...args], {
    cwd: temporary, encoding: 'utf8', env: { ...process.env, TEST_CONCURRENCY: '1' },
  });
  const serial = run('run-tests.mjs', ['example.verify.cjs']); // a filter keeps the repo-wide extras out
  assert.equal(serial.status, 0, serial.stderr);
  assert.match(serial.stdout, /\(1 parallel\)/);
  const affected = run('run-affected-verifies.mjs', ['src/example.verify.cjs']);
  assert.equal(affected.status, 0, affected.stderr);
  assert.match(affected.stdout, /\(1 parallel\)/);
  const broader = run('run-affected-verifies.mjs', ['--list', 'package.json']);
  assert.equal(broader.status, 2);
  assert.match(broader.stderr, /broader gate: npm run lint && npm test && npm run build/);

  writeFileSync(join(temporary, 'src/example.verify.cjs'),
    `console.log('stdout failure detail'); console.error('stderr failure detail'); process.exit(1);`);
  for (const runner of ['run-tests.mjs', 'run-affected-verifies.mjs']) {
    const failure = run(runner, ['src/example.verify.cjs']);
    assert.equal(failure.status, 1);
    assert.match(failure.stdout, /stdout failure detail/);
    assert.match(failure.stdout, /stderr failure detail/);
  }
  const missingGit = spawnSync(process.execPath, [resolve('scripts/run-affected-verifies.mjs')], {
    cwd: tmpdir(), encoding: 'utf8',
  });
  assert.equal(missingGit.status, 1, 'Git failure must not become a successful empty selection');
} finally {
  rmSync(temporary, { recursive: true, force: true });
}

console.log('run-affected-verifies.verify: affected selection follows imports and never shrinks silently');
