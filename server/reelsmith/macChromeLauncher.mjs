// Since Remotion 4.0.537 (its own Chromium 157 headless shell), Chrome started straight from the app on macOS dies as
// soon as a page loads a composition ("Target closed" / "browser has disconnected"), so every still, frame sheet and
// export fails in the running app; the tsx CLI showed the same. The same binary started through `/bin/sh` with `exec`
// renders normally (2026-10-28: 0 of n stills before, 3 of 3 after, same app process). The root cause inside the
// direct spawn was not found; this launcher is the workaround: a two-line script that execs the real shell.
import { createHash } from 'node:crypto';
import { chmodSync, existsSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

/** chrome-headless-shell under `root`, a few levels down (the folder names carry the platform). */
export function findHeadlessShell(root, depth = 4) {
  if (depth < 0 || !existsSync(root)) return null;
  for (const name of readdirSync(root)) {
    const p = join(root, name);
    const st = statSync(p);
    if (st.isFile() && name === 'chrome-headless-shell') return p;
    if (st.isDirectory()) {
      const hit = findHeadlessShell(p, depth - 1);
      if (hit) return hit;
    }
  }
  return null;
}

/** Where Remotion downloads its headless shell: node_modules/.remotion next to @remotion/renderer. */
function downloadedShell() {
  try {
    const pkg = createRequire(import.meta.url).resolve('@remotion/renderer/package.json');
    return findHeadlessShell(join(dirname(dirname(dirname(pkg))), '.remotion', 'chrome-headless-shell'));
  } catch {
    return null;
  }
}

export function launcherScript(real) {
  return `#!/bin/sh\nexec ${JSON.stringify(real)} "$@"\n`;
}

const made = new Map();

/**
 * The executable to hand Remotion: on macOS a launcher for `real` (the override, or the downloaded shell), elsewhere
 * `real` as is. Undefined leaves Remotion to find (or download) its own, as before.
 */
export function browserExecutableFor(real, platform = process.platform, dir = tmpdir()) {
  if (platform !== 'darwin') return real || undefined;
  const target = real || downloadedShell();
  if (!target) return undefined;
  const cached = made.get(target);
  if (cached && existsSync(cached)) return cached;
  const file = join(dir, `reelsmith-chrome-${createHash('sha1').update(target).digest('hex').slice(0, 10)}.sh`);
  writeFileSync(file, launcherScript(target));
  chmodSync(file, 0o755);
  made.set(target, file);
  return file;
}

let shellReady = null;

/**
 * Remotion only checks (and re-downloads) its headless shell when it picks the browser itself; handed our launcher it
 * sees a user path and keeps whatever shell is on disk, so after a Remotion upgrade the old Chrome stayed in use. On
 * macOS with no override, run Remotion's own `ensureBrowser()` once per process first, then build the launcher.
 */
export async function currentBrowserExecutable(real, platform = process.platform, ensure = defaultEnsure) {
  if (platform === 'darwin' && !real) {
    shellReady ??= ensure().catch((err) => {
      shellReady = null;
      throw err;
    });
    await shellReady;
  }
  return browserExecutableFor(real, platform);
}

async function defaultEnsure() {
  const { ensureBrowser } = await import('@remotion/renderer');
  await ensureBrowser({ logLevel: 'warn' });
}
