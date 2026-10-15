// RS-002: Reelsmith keeps its data in ~/.reelsmith (was ~/.openchatcut, shared with OpenChatCut).
// One-shot copy of the old folder into the new one. Stop the app / dev server first.
// Run: npx tsx src/reelsmith/migrate-home.mts [--dry-run]
// Copies only; ~/.openchatcut is left as it is. A target profile that already holds a store is moved
// aside to "<name>.before-migration-<time>" rather than overwritten.
import { cpSync, existsSync, readdirSync, renameSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const dry = process.argv.includes('--dry-run');
const from = join(homedir(), '.openchatcut');
const to = join(homedir(), '.reelsmith');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');

if (!existsSync(from)) {
  console.log(`nothing to migrate: ${from} does not exist`);
  process.exit(0);
}

const STORE = 'project-store-v1.sqlite3';
const size = (p: string) => (existsSync(p) ? statSync(p).size : 0);

function copy(src: string, dst: string) {
  if (existsSync(dst)) {
    const aside = `${dst}.before-migration-${stamp}`;
    console.log(`move aside ${dst} -> ${aside}`);
    if (!dry) renameSync(dst, aside);
  }
  console.log(`copy ${src} -> ${dst}`);
  if (!dry) cpSync(src, dst, { recursive: true, errorOnExist: false, preserveTimestamps: true });
}

for (const name of readdirSync(from)) {
  const src = join(from, name);
  const dst = join(to, name);
  if (name === 'dev-profiles' && statSync(src).isDirectory()) {
    for (const id of readdirSync(src)) {
      const s = join(src, id);
      const d = join(dst, id);
      // keep a target profile that has more project data than the source
      if (size(join(d, STORE)) + size(join(d, `${STORE}-wal`)) > size(join(s, STORE)) + size(join(s, `${STORE}-wal`))) {
        console.log(`keep ${d} (it holds more data than ${s})`);
        continue;
      }
      copy(s, d);
    }
    continue;
  }
  if (existsSync(dst)) {
    console.log(`keep ${dst} (already exists)`);
    continue;
  }
  copy(src, dst);
}
console.log(dry ? 'dry run: nothing changed' : 'done; ~/.openchatcut was left untouched');
