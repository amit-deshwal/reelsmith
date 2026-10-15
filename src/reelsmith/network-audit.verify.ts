// RS-003 guard: index.html must not pull remote scripts, styles or fonts, and updates stay off.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const html = readFileSync('index.html', 'utf8');
assert.ok(!/(?:src|href)=["']https?:\/\//.test(html), 'index.html must not load remote resources');

const css = readFileSync('src/index.css', 'utf8');
assert.ok(!/@import\s+url\(["']?https?:/.test(css), 'index.css must not @import remote CSS');
assert.ok(!/url\(["']?https?:/.test(css), 'index.css must not reference remote assets');

const updater = readFileSync('src/ui/upstreamUpdate.ts', 'utf8');
assert.match(updater, /UPDATE_CHECKS_ENABLED\s*=\s*false/, 'update checks must stay disabled');

console.log('network-audit.verify: ok');
