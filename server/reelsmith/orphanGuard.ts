// A helper process (whisper-server) must not outlive the process that started it. macOS has no "die with parent", and
// Electron ends utility processes without running their exit handlers, so each app session left a server holding a
// model in memory. A tiny detached watchdog kills the child as soon as the owner is gone, however the owner ended.
import { spawn } from 'node:child_process';

const POLL_SEC = 2;

/** Kill `childPid` when `ownerPid` exits; the watchdog itself ends when either is gone. No-op on Windows. */
export function killWithOwner(childPid: number | undefined, ownerPid: number = process.pid): void {
  if (process.platform === 'win32' || !childPid) return;
  const script = `while kill -0 ${ownerPid} 2>/dev/null; do kill -0 ${childPid} 2>/dev/null || exit 0; sleep ${POLL_SEC}; done; kill ${childPid} 2>/dev/null; sleep 3; kill -9 ${childPid} 2>/dev/null; exit 0`;
  const guard = spawn('/bin/sh', ['-c', script], { detached: true, stdio: 'ignore' });
  guard.on('error', () => {});
  guard.unref();
}
