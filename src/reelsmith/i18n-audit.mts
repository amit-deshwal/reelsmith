// RS-006: list CJK keys passed to t(...) in src/ that have no English entry.
// Run: npx tsx src/reelsmith/i18n-audit.mts [--json]
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { EN } from '../i18n/dict/en/index.ts';

const ENKEYS = new Set(Object.keys(EN));
const CJK = /[㐀-鿿]/;
const STRING = /'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)"|`((?:\\.|[^`\\])*)`/g;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name !== 'i18n') walk(path, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.verify\./.test(name)) out.push(path);
  }
  return out;
}

/** Text of the balanced (...) group that starts at `open`. */
function callBody(src: string, open: number): string {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '(') depth++;
    else if (src[i] === ')' && --depth === 0) return src.slice(open + 1, i);
  }
  return '';
}

const misses: { file: string; line: number; text: string }[] = [];
for (const file of walk('src')) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/(?<![\w.$])t\(/g)) {
    const open = m.index! + 1;
    const body = callBody(src, open);
    for (const s of body.matchAll(STRING)) {
      const text = (s[1] ?? s[2] ?? s[3] ?? '').replace(/\\(['"`\\])/g, '$1');
      if (CJK.test(text) && !ENKEYS.has(text) && !text.includes('${')) {
        misses.push({ file, line: src.slice(0, m.index).split('\n').length, text });
      }
    }
  }
}

if (process.argv.includes('--json')) console.log(JSON.stringify(misses, null, 2));
else {
  for (const m of misses) console.log(`${m.file}:${m.line}  ${m.text}`);
  console.log(`\n${misses.length} t() keys without an English entry`);
}
