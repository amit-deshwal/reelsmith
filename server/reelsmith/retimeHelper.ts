// RS-1259: the smooth slow-motion helper. Its Swift source (retimeSwift.ts) travels inside the server bundle; the first
// use writes it to ~/.reelsmith/bin and builds it with the Command Line Tools' swiftc (about 6 s, once per version of the
// source: the file is named by a hash of it). It needs macOS 15.4+ for Apple's frame-rate conversion. Without it (another
// system, no Command Line Tools, an older macOS) slow motion keeps repeating frames, as before.
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { RETIME_SWIFT } from './retimeSwift.ts';

const run = promisify(execFile);

/** Where the helper for this version of the source lives (OPENCHATCUT_RETIME names a ready-built one instead). */
export function retimeBinPath(dir = join(homedir(), '.reelsmith', 'bin')): string {
  const hash = createHash('sha256').update(RETIME_SWIFT).digest('hex').slice(0, 12);
  return join(dir, `rs-retime-${hash}`);
}

const reason = (e: unknown) => String((e as { stderr?: unknown }).stderr || (e instanceof Error ? e.message : e)).trim().split('\n').slice(-3).join(' ');

async function build(bin: string): Promise<void> {
  // no developer tools: say so instead of letting swiftc open the "install the tools" dialog
  await run('/usr/bin/xcode-select', ['-p'], { timeout: 10_000 }).catch(() => { throw new Error('the Command Line Tools are not installed (xcode-select --install)'); });
  await mkdir(dirname(bin), { recursive: true });
  const source = `${bin}.swift`;
  const temp = `${bin}.${process.pid}.tmp`;
  await writeFile(source, RETIME_SWIFT);
  try {
    await run('/usr/bin/swiftc', ['-O', '-swift-version', '5', '-o', temp, source], { timeout: 300_000 });
    await rename(temp, bin);
  } finally {
    await rm(temp, { force: true });
  }
}

let ready: Promise<{ bin: string; blur: boolean } | { error: string }> | null = null;

/** The built helper (`blur`: it can also make motion blur), or why there is none. Decided once per process (a restart tries again). */
export function retimeHelper(): Promise<{ bin: string; blur: boolean } | { error: string }> {
  ready ??= (async () => {
    const override = process.env.OPENCHATCUT_RETIME;
    if (!override && process.platform !== 'darwin') return { error: 'smooth slow motion needs a Mac' };
    const bin = override || retimeBinPath();
    if (override && !existsSync(override)) return { error: `OPENCHATCUT_RETIME names a missing file (${override})` };
    if (!existsSync(bin)) {
      try { await build(bin); } catch (e) { return { error: `smooth slow motion could not be set up: ${reason(e)}` }; }
    }
    try {
      const { stdout } = await run(bin, ['--probe'], { timeout: 15_000 });
      const probe = JSON.parse(stdout) as { supported?: unknown; blur?: unknown };
      return probe.supported === true
        ? { bin, blur: probe.blur === true }
        : { error: 'smooth slow motion needs macOS 15.4 or later' };
    } catch (e) {
      return { error: `smooth slow motion is not available: ${reason(e)}` };
    }
  })();
  return ready;
}
