import assert from 'node:assert/strict';
import { directorLedgerSummary } from './ledgerSummary';

assert.equal(directorLedgerSummary('view_timeline_frames', {}, { ok: true }), undefined);
assert.equal(
  directorLedgerSummary('reels_director_build', { plan: {} }, { ok: true, seconds: 34.87, sections: 11, clipsUsed: 34, unusedClips: { count: 14 } }),
  '34.9 s | 11 sections | 34 clips | 14 not cast',
);
assert.equal(
  directorLedgerSummary('reels_director_fix', { request: 'include my missing videos', plan: { look: 'none' } },
    { ok: true, seconds: 34.9, rebuilt: [2, 6], defects: [{ section: 6, at: 1.2, evidence: 'frozen frame' }] }),
  '34.9 s | rebuilt s2,6 | plan: look | request: "include my missing videos" | defects: s6@1.2 frozen frame',
);
assert.ok(directorLedgerSummary('reels_director_fix', { request: 'x'.repeat(2000) }, { ok: true })!.length <= 600);
console.log('ledgerSummary.verify: ok');
