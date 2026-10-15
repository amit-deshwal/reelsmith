// RS-003 / RS-404: bundle the Latin fonts the editor offers (plus Noto Sans Devanagari) so text renders
// without contacting Google Fonts. Build-time only: fetches @fontsource tarballs with `npm pack`, keeps
// WOFF2 files for normal styles in the latin, latin-ext and devanagari subsets, and writes one stylesheet
// per family to assets/fonts/rs/<slug>/<slug>.css (served at /fonts/rs/...).
// Run: npx tsx server/reelsmith/sync-fonts.mts
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { REELSMITH_FONTS } from '../../src/reelsmith/fonts.ts';

const OUT = join(process.cwd(), 'assets', 'fonts', 'rs');
const SUBSETS = new Set(['latin', 'latin-ext', 'devanagari']);
const work = mkdtempSync(join(tmpdir(), 'rs-fonts-'));
let total = 0;

try {
  for (const font of REELSMITH_FONTS) {
    const pkgDir = join(work, font.slug);
    mkdirSync(pkgDir, { recursive: true });
    const tgz = execFileSync('npm', ['pack', `@fontsource/${font.slug}@5`, '--silent', '--pack-destination', pkgDir], { encoding: 'utf8' }).trim().split('\n').pop()!;
    execFileSync('tar', ['-xzf', join(pkgDir, tgz), '-C', pkgDir]);
    const root = join(pkgDir, 'package');
    const outDir = join(OUT, font.slug);
    rmSync(outDir, { recursive: true, force: true });
    mkdirSync(outDir, { recursive: true });
    const blocks: string[] = [];
    for (const weight of font.weights) {
      const cssFile = join(root, `${weight}.css`);
      if (!existsSync(cssFile)) continue;
      const css = readFileSync(cssFile, 'utf8');
      for (const m of css.matchAll(/\/\* ([\w-]+) \*\/\s*@font-face\s*{([^}]*)}/g)) {
        const [name, body] = [m[1]!, m[2]!];
        const subset = name.replace(new RegExp(`^${font.slug}-`), '').replace(/-\d+-(normal|italic)$/, '');
        if (!SUBSETS.has(subset) || !/font-style:\s*normal/.test(body)) continue;
        const woff2 = /url\(\.\/files\/([^)]+\.woff2)\)/.exec(body)?.[1];
        if (!woff2) continue;
        copyFileSync(join(root, 'files', woff2), join(outDir, woff2));
        total += statSync(join(outDir, woff2)).size;
        const rewritten = body
          .replace(/src:[^;]+;/, `src: url(/fonts/rs/${font.slug}/${woff2}) format('woff2');`)
          .replace(/font-family:\s*'[^']+'/, `font-family: '${font.family}'`);
        blocks.push(`/* ${name} */\n@font-face {${rewritten}}`);
      }
    }
    if (!blocks.length) throw new Error(`${font.slug}: no matching faces`);
    writeFileSync(join(outDir, `${font.slug}.css`), `/* @fontsource/${font.slug} (SIL OFL 1.1 / Apache 2.0), latin + latin-ext + devanagari, normal styles */\n${blocks.join('\n')}\n`);
    console.log(`${font.family}: ${readdirSync(outDir).length - 1} files`);
  }
  console.log(`total ${(total / 1024 / 1024).toFixed(1)} MB in ${OUT}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
