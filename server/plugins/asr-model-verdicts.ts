import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

type Inspections = Map<string, { fingerprint: string; verified: boolean }>;

// Reelsmith: verified fingerprints persist across launches (in the cache dir), so 3 GB of models are not
// re-hashed on the server's thread after every start. A changed size, mtime, ctime or catalog hash re-hashes.
const VERIFIED_FILE = '.verified-v1.json';
/** Loads saved verdicts for `cacheDir` into `inspections`, once per process. */
export async function loadVerdicts(cacheDir: string, inspections: Inspections, loadedVerdicts: Set<string>): Promise<void> {
  if (loadedVerdicts.has(cacheDir)) return;
  loadedVerdicts.add(cacheDir);
  try {
    const saved = JSON.parse(await readFile(join(cacheDir, VERIFIED_FILE), 'utf8')) as Record<string, string>;
    for (const [key, fingerprint] of Object.entries(saved)) {
      if (typeof fingerprint === 'string' && !inspections.has(`${cacheDir}\0${key}`)) inspections.set(`${cacheDir}\0${key}`, { fingerprint, verified: true });
    }
  } catch { /* none yet */ }
}
export async function saveVerdicts(cacheDir: string, inspections: Inspections): Promise<void> {
  const prefix = `${cacheDir}\0`;
  const saved: Record<string, string> = {};
  for (const [key, value] of inspections) if (value.verified && key.startsWith(prefix)) saved[key.slice(prefix.length)] = value.fingerprint;
  const path = join(cacheDir, VERIFIED_FILE);
  const temp = `${path}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  try { await writeFile(temp, JSON.stringify(saved)); await rename(temp, path); } catch { await rm(temp, { force: true }).catch(() => {}); }
}
