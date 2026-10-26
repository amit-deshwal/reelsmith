// Verify files are discovered, not registered (scripts/verify-discovery.mjs): `npm test` runs every
// tracked *.verify.* file, so a test can no longer exist without running. What can still go wrong is
// the launcher table naming a file that is gone, or a file git does not track (.gitignore excludes
// /scripts/* wholesale, so a new scripts/*.verify.* needs `git add -f` or CI never sees it).
// node scripts/verify-registration.verify.mjs
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { LAUNCHERS, VERIFY_FILE, discoverVerifies, verifyCommand } from './verify-discovery.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const found = discoverVerifies();
assert.ok(found.length > 100, `expected the repo to have many verifies, found ${found.length}`);

const stale = Object.values(LAUNCHERS).flat().filter((file) => !found.includes(file));
assert.deepEqual(stale, [], `LAUNCHERS names files that are not verifies: ${stale.join(', ')}`);

// Untracked-but-unignored files run locally; they must be added before CI can see them.
const tracked = new Set(execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n'));
const untracked = found.filter((file) => !tracked.has(file));
assert.ok(untracked.every((file) => VERIFY_FILE.test(file)));

assert.equal(verifyCommand('shared/x.verify.ts'), 'node --import tsx shared/x.verify.ts');
assert.equal(verifyCommand('src/captions/captionSelection.verify.ts'), 'TSX_TSCONFIG_PATH=tsconfig.app.json node --import tsx src/captions/captionSelection.verify.ts');
assert.equal(verifyCommand('shared/x.verify.mjs'), 'node shared/x.verify.mjs');
assert.equal(verifyCommand('src/agent/tools/effect-tools.verify.ts'), 'node scripts/run-check.mjs src/agent/tools/effect-tools.verify.ts');

console.log(`verify-registration.verify: ${found.length} verify files discovered, launcher table is current`);
