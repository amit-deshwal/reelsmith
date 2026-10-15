import assert from 'node:assert/strict';

const mem = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => { mem.set(k, v); }, removeItem: (k: string) => { mem.delete(k); },
};
const { executeTool } = await import('../agent/tools');
const { framesAllowed, frameToolGate, setFramesAllowed, stripFramesIfOff, privacyNoticeSeen, markPrivacyNoticeSeen } = await import('./framePrivacy');

assert.equal(framesAllowed('p'), true, 'frames are allowed until switched off');
assert.equal(frameToolGate('view_asset_frames', 'p'), null);
const withImg = { ok: true, __images: [{ frame: 0, base64: 'abc' }] };
assert.equal(stripFramesIfOff(withImg, 'p'), withImg);

setFramesAllowed('p', false);
assert.equal(framesAllowed('p'), false);
assert.equal(framesAllowed('other'), true, 'per project');
assert.match(frameToolGate('view_timeline_frames', 'p')!.error, /Frame sharing is off/);
assert.equal(frameToolGate('read_timeline', 'p'), null, 'other tools unaffected');
const stripped = stripFramesIfOff(withImg, 'p') as Record<string, unknown>;
assert.equal('__images' in stripped, false, 'images removed');
assert.equal(stripped.ok, true);

// enforced at the tool dispatcher, before any frame is rendered
const ctx = { getProjectId: () => 'p' } as never;
const res = await executeTool('view_asset_frames', { assetId: 'x' }, ctx) as { error?: string };
assert.match(res.error ?? '', /Frame sharing is off/);

assert.equal(privacyNoticeSeen(), false);
markPrivacyNoticeSeen();
assert.equal(privacyNoticeSeen(), true);
console.log('framePrivacy.verify ok');
