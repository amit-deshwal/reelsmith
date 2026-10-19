// The watchdog kills a child when its owner dies (even by SIGKILL), and leaves a child alone while the owner lives.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { killWithOwner } from './orphanGuard.ts';

const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

if (process.platform !== 'win32') {
  const owner = spawn('sleep', ['60'], { stdio: 'ignore' });
  const child = spawn('sleep', ['60'], { stdio: 'ignore', detached: true });
  child.unref();
  killWithOwner(child.pid, owner.pid);
  await wait(2500);
  assert.ok(alive(child.pid!), 'the child runs while its owner lives');
  owner.kill('SIGKILL');
  for (let i = 0; i < 40 && alive(child.pid!); i += 1) await wait(100);
  assert.ok(!alive(child.pid!), 'the child is killed once its owner is gone');

  // a child that exits by itself ends the watchdog quietly
  const owner2 = spawn('sleep', ['60'], { stdio: 'ignore' });
  const quick = spawn('sleep', ['0.2'], { stdio: 'ignore' });
  killWithOwner(quick.pid, owner2.pid);
  await wait(2600);
  owner2.kill('SIGKILL');
}
console.log('orphanGuard.verify: ok');
