// Reverse import graph for verify selection (Reelsmith).
//
// `verify:affected` used to pick suites by directory: a changed file with no same-name
// verify pulled in every suite in its folder (59 suites, 40 s for one server/ file) and
// still missed suites elsewhere that import it. This graph answers the real question:
// which verify files reach this file through imports?
//
// Edges come from a source scan, not a type checker, so it stays fast (~2.7k files in well
// under a second):
//   - static/dynamic `import`, `export … from`, `require()`, and `new URL('./x', import.meta.url)`
//     with relative specifiers (Vite `?raw`/`?worker` queries stripped, `.js` resolved to `.ts`);
//   - repo-path string literals such as 'recipes/travel.recipe.json' or 'cli/occ.mjs', which is
//     how suites reach scripts they spawn and data they read (a file containing the marker
//     NO_PATH_LITERALS opts out, for tests whose fixtures are file names).
// Anything reached another way (directory listings, globbed folders) is not an edge; the
// affected runner keeps a directory fallback for files the graph cannot reach.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';

export const GRAPH_SOURCE = /\.(?:tsx|mts|cts|cjs|mjs|ts|js|jsx)$/;
const GRAPH_NODE = /\.(?:tsx|mts|cts|cjs|mjs|ts|js|jsx|json|md|frag|vert|glsl|css)$/;
const RESOLVE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.js', '.mjs', '.cjs', '.jsx', '.json'];
const SPECIFIERS = [
  /\b(?:import|export)\s+(?:type\s+)?[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]/g,
  /\bimport\s*['"]([^'"]+)['"]/g,
  /\bimport\s*\(\s*['"]([^'"]+)['"]\s*[,)]/g,
  /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\bnew\s+URL\s*\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url/g,
];
const PATH_LITERAL = /['"`]((?:\.{1,2}\/)?[\w@.-]+(?:\/[\w@.-]+)+\.[a-z]+)['"`]/g;

export const NO_PATH_LITERALS = 'import-graph: no-path-literals';

const toPosix = (value) => value.split('\\').join('/');

/** Every tracked or untracked-but-not-ignored file the graph can hold. */
export function graphFiles(cwd) {
  const out = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd, encoding: 'utf8' });
  return [...new Set(out.split('\0').filter((f) => GRAPH_NODE.test(f) && existsSync(join(cwd, f))))];
}

/** Resolve a relative specifier from `from` to a known file, or undefined. */
export function resolveSpecifier(from, specifier, known) {
  const bare = specifier.replace(/[?#].*$/, '');
  if (!bare.startsWith('.') && !bare.startsWith('/')) return undefined;
  const base = toPosix(normalize(bare.startsWith('/') ? bare.slice(1) : join(dirname(from), bare)));
  if (base.startsWith('../')) return undefined;
  const stem = base.replace(/\.(?:js|jsx|mjs|cjs)$/, '');
  const candidates = [
    base,
    ...(stem !== base ? [`${stem}.ts`, `${stem}.tsx`, `${stem}.mts`, `${stem}.cts`] : []),
    ...RESOLVE_EXTENSIONS.map((ext) => `${base}${ext}`),
    ...RESOLVE_EXTENSIONS.map((ext) => `${base}/index${ext}`),
  ];
  return candidates.find((candidate) => known.has(candidate));
}

/** Files `file` depends on, given its source text. */
export function dependenciesOf(file, source, known) {
  const deps = new Set();
  for (const pattern of SPECIFIERS) {
    for (const match of source.matchAll(pattern)) {
      const target = resolveSpecifier(file, match[1], known);
      if (target && target !== file) deps.add(target);
    }
  }
  // Test tooling whose fixtures name repo files as plain strings opts out of literal edges.
  if (source.includes(NO_PATH_LITERALS)) return deps;
  for (const match of source.matchAll(PATH_LITERAL)) {
    const literal = match[1];
    const target = literal.startsWith('.')
      ? resolveSpecifier(file, literal, known)
      : (known.has(literal) ? literal : undefined);
    if (target && target !== file) deps.add(target);
  }
  return deps;
}

/** Map of file -> files that depend on it directly. */
export function buildReverseGraph(cwd, files = graphFiles(cwd)) {
  const known = new Set(files);
  const reverse = new Map();
  for (const file of files) {
    if (!GRAPH_SOURCE.test(file)) continue;
    let source;
    try { source = readFileSync(join(cwd, file), 'utf8'); } catch { continue; }
    for (const dep of dependenciesOf(file, source, known)) {
      if (!reverse.has(dep)) reverse.set(dep, new Set());
      reverse.get(dep).add(file);
    }
  }
  return { known, reverse };
}

/**
 * Every file that reaches `file` through the graph (not including `file` itself). The walk does not
 * continue upward from a file `isLeaf` accepts: a verify is an end consumer, and files that merely list
 * verify paths (the runners' own tables) must not make every change select every runner suite.
 */
export function dependentsOf(file, reverse, isLeaf = () => false) {
  const seen = new Set();
  const queue = [file];
  while (queue.length) {
    const next = queue.pop();
    for (const parent of reverse.get(next) ?? []) {
      if (seen.has(parent) || parent === file) continue;
      seen.add(parent);
      if (!isLeaf(parent)) queue.push(parent);
    }
  }
  return seen;
}
