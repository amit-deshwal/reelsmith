import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { browserExecutableFor, launcherScript } from './macChromeLauncher.mjs';

// macOS starts Chrome through a launcher that execs the real headless shell; other platforms get the path unchanged
const dir = mkdtempSync(join(tmpdir(), 'rs-launch-'));
try {
  assert.equal(browserExecutableFor('/opt/chrome', 'linux', dir), '/opt/chrome');
  assert.equal(browserExecutableFor(undefined, 'win32', dir), undefined);
  const real = '/Applications/My Chrome/chrome-headless-shell';
  const file = browserExecutableFor(real, 'darwin', dir)!;
  assert.equal(readFileSync(file, 'utf8'), launcherScript(real));
  assert.equal(statSync(file).mode & 0o111, 0o111, 'executable');
  assert.equal(browserExecutableFor(real, 'darwin', dir), file, 'made once');
  // the script passes every argument through to the real binary, spaces included
  const echo = join(dir, 'echo args');
  execFileSync('/bin/sh', ['-c', `printf '#!/bin/sh\\nprintf "%%s|" "$@"\\n' > "${echo}" && chmod +x "${echo}"`]);
  const via = browserExecutableFor(echo, 'darwin', dir)!;
  assert.equal(execFileSync(via, ['--a=1', 'two words']).toString(), '--a=1|two words|');
  // with no override it finds the downloaded shell (dev checkout), if there is one
  const found = browserExecutableFor(undefined, 'darwin', dir);
  if (found) assert.match(readFileSync(found, 'utf8'), /chrome-headless-shell"/);
  console.log('macChromeLauncher.verify ok');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
