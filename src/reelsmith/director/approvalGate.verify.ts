import assert from 'node:assert/strict';
import { directorPrompt } from './directorPrompt';
import { directorSession, updateDirectorSession } from './directorSession';
import { treatmentCard, type Treatment } from './treatment';

// RS-1230: "Show me the plan first" stops the director at the treatment until the user answers its card
const treatment = {
  story: 'two days on the trek', concepts: [{ name: 'Earned', idea: 'a royal climb' }, { name: 'Rain', idea: 'a moody slog' }], chosen: 0, tone: 'royal', heroes: ['#1@2', '#2@4'],
  parts: [
    { role: 'hook', beats: 4, move: 'hold', clips: ['#1'], line: 'two days', purpose: 'where we are' },
    { role: 'build', beats: 8, move: 'flash-cuts', purpose: 'how hard it was' },
    { role: 'ending', beats: 8, move: 'cards-finale', purpose: 'we made it' },
  ],
  signature: 'velocity on the summit', textStyles: ['cinematic-title'], transitions: ['light-dissolve'], effects: [], graphics: [],
} as unknown as Treatment;

const card = treatmentCard(treatment, 120);
assert.match(card, /\*\*Earned\*\* \(royal, about 10 s\)/);
assert.match(card, /1\. 0\.0-2\.0 s · hook · hold · "two days": where we are/);
assert.match(card, /3\. 6\.0-10\.0 s · ending · cards-finale · we made it/);
assert.match(card, /Signature: velocity on the summit/);
assert.match(card, /Other idea: Rain \(a moody slog\)/);

assert.match(directorPrompt('trek', '9:16', 1, undefined, true), /askFirst true/);
assert.doesNotMatch(directorPrompt('trek', '9:16', 1), /askFirst/);

const { directorTreatment, directorBuild } = await import('../agent/directorTools');
const ctx = (id: string) => ({
  getProjectId: () => id, getState: () => ({ fps: 30, items: [] }), audio: [],
  getDoc: () => ({ assets: [{ id: 'v1', name: 'v1.mov', kind: 'video', src: '/x', durationInFrames: 300 }] }),
}) as never;
const plan = { ratio: '9:16', sections: [{ move: 'hold', beats: 8, clips: ['#1'] }] };

// gate on: the treatment returns the card and the build waits for the user's words
updateDirectorSession('g1', { fps: 30, clips: [{ n: 1, kind: 'video', seconds: 10 }], song: { assetId: 's', bpm: 120 }, askFirst: true });
const t = directorTreatment(treatment as never, ctx('g1')) as Record<string, any>;
assert.equal(t.card, card);
assert.match(t.next, /show.*card.*wait/i);
assert.equal(directorSession('g1')!.gate, 'waiting');
const early = await directorBuild({ plan }, ctx('g1'), {} as never) as Record<string, any>;
assert.match(early.error, /approve the treatment first/);
// the user's go opens the gate (the build then goes on to its own checks)
await directorBuild({ plan, approvedBy: 'go' }, ctx('g1'), {} as never).catch(() => undefined);
assert.equal(directorSession('g1')!.gate, 'approved');
// a revised treatment closes it again
directorTreatment(treatment as never, ctx('g1'));
assert.equal(directorSession('g1')!.gate, 'waiting');

// gate off (the default): no card, no wait
updateDirectorSession('g2', { fps: 30, clips: [{ n: 1, kind: 'video', seconds: 10 }] });
const off = directorTreatment(treatment as never, ctx('g2')) as Record<string, any>;
assert.equal(off.card, undefined);
assert.equal(directorSession('g2')!.gate, undefined);
const free = await directorBuild({ plan }, ctx('g2'), {} as never).catch((e: Error) => ({ error: e.message })) as Record<string, any>;
assert.doesNotMatch(String(free.error ?? ''), /approve the treatment/);
console.log('approvalGate.verify ok');
