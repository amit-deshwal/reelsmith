import assert from 'node:assert/strict';
import type { RecipeMediaInput } from '../../shared/reelsmith/recipe';
import { importSlotMedia } from './slotImport';

const slot: RecipeMediaInput = { id: 'clips', kind: 'media', accept: ['video', 'image'], min: 1, max: 3, label: 'Trip clips' };
const files = ['first.mp4', 'broken.mp4', 'last.mp4'].map((name) => new File([], name));
const progress: string[] = [];
const partial = await importSlotMedia(slot, [], files, async (file) => {
  if (file.name === 'broken.mp4') throw new Error('Cannot decode file');
  return { id: file.name, name: file.name, kind: 'video', src: '/local', durationInFrames: 90 };
}, (text) => progress.push(text));
assert.deepEqual(partial.selected.map((a) => a.assetId), ['first.mp4', 'last.mp4']);
assert.match(partial.messages.join(), /broken.mp4: Cannot decode file/);
assert.equal(progress.length, 3);
const over = await importSlotMedia(slot, partial.selected, [files[0], files[2]], async () => assert.fail('reject excess before importing'));
assert.match(over.messages[0], /at most 1 more/);
assert.deepEqual(over.selected, partial.selected);
const wrong = await importSlotMedia(slot, [], [new File([], 'song.wav')], async () => ({ id: 'audio', name: 'song', kind: 'audio', src: '/song', durationInFrames: 90 }));
assert.deepEqual(wrong.selected, []);
assert.match(wrong.messages[0], /choose video\/image/);
const duplicate = await importSlotMedia(slot, partial.selected.slice(0, 1), [files[0]], async () => ({ id: 'first.mp4', name: 'first', kind: 'video', src: '/first', durationInFrames: 90 }));
assert.equal(duplicate.selected.length, 1);
const songSlot: RecipeMediaInput = { ...slot, id: 'music', accept: ['audio'], min: 0, max: 1, label: 'Song' };
const oldSong = [{ assetId: 'old', kind: 'audio' as const }];
const failed = await importSlotMedia(songSlot, oldSong, [files[0]], async () => { throw new Error('Failed'); });
assert.deepEqual(failed.selected, oldSong, 'failed replacement preserves the current song');
const replacement = await importSlotMedia(songSlot, oldSong, [files[0]], async () => ({ id: 'new', name: 'new song', kind: 'audio', src: '/new', durationInFrames: 90 }));
assert.deepEqual(replacement.selected, [{ assetId: 'new', kind: 'audio' }]);
console.log('slotImport.verify: ok');
