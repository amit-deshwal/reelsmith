import assert from 'node:assert/strict';
import { isHeicFile, jpegNameFor } from './heicImport';

assert.ok(isHeicFile({ name: 'IMG_0001.HEIC', type: '' }));
assert.ok(isHeicFile({ name: 'photo', type: 'image/heif' }));
assert.ok(!isHeicFile({ name: 'clip.mov', type: 'video/quicktime' }));
assert.equal(jpegNameFor('IMG_0001.HEIC'), 'IMG_0001.jpg');
assert.equal(jpegNameFor('photo'), 'photo.jpg');
console.log('heicImport.verify: ok');
