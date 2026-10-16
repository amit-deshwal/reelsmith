import assert from 'node:assert/strict';
import type { MediaAsset } from '../editor/types';
import { favoriteCount, favoritesSelection, isFavoritesSelected } from './slotFavorites';

const asset = (id: string, favorite?: boolean, kind: MediaAsset['kind'] = 'video'): MediaAsset => ({ id, name: id, kind, src: `/${id}`, durationInFrames: 30, ...(favorite !== undefined ? { favorite } : {}) });
const pool = [asset('a', true), asset('b'), asset('c', true, 'image'), asset('d', false), asset('e', true)];

assert.equal(favoriteCount(pool), 3);
assert.deepEqual(favoritesSelection(pool, 10), [{ assetId: 'a', kind: 'video' }, { assetId: 'c', kind: 'image' }, { assetId: 'e', kind: 'video' }]);
assert.deepEqual(favoritesSelection(pool, 2).map((m) => m.assetId), ['a', 'c'], 'never more than the slot allows');
assert.deepEqual(favoritesSelection([asset('x'), asset('y', false)], 10), [], 'no stars: nothing selected');

assert.equal(isFavoritesSelected(pool, 10, favoritesSelection(pool, 10)), true);
assert.equal(isFavoritesSelected(pool, 10, [{ assetId: 'a', kind: 'video' }]), false);
assert.equal(isFavoritesSelected([asset('x')], 10, []), false, 'no stars: never "selected"');
console.log('slotFavorites.verify: ok');
