import assert from 'node:assert/strict';
import type { MediaAsset } from '../editor/types';
import { matchRelinkFile } from './mediaRelinkMatch';

const file = (name: string, type = '', size = 1): File => new File([new Uint8Array(size)], name, { type });

const asset = (name: string, extra: Partial<{ sourceFilename: string; kind: string; sourceSize: number }> = {}) => ({
  name,
  sourceFilename: extra.sourceFilename,
  kind: (extra.kind ?? 'image') as MediaAsset['kind'],
  sourceSize: extra.sourceSize,
});

async function main(): Promise<void> {
  // 1. Exact filename match (case-insensitive) wins.
  assert.equal(matchRelinkFile(asset('星图.png'), [file('星图.png')])?.name, '星图.png');
  assert.equal(matchRelinkFile(asset('Star.png'), [file('star.PNG')])?.name, 'star.PNG');
  // sourceFilename (original file name) is preferred over display name.
  assert.equal(
    matchRelinkFile(asset('显示名', { sourceFilename: '原始.mp4' }), [file('原始.mp4'), file('显示名.mp4')])?.name,
    '原始.mp4',
  );

  // 2. Stem match bridges extension changes (mp4 → mov) — the #48 report case.
  assert.equal(matchRelinkFile(asset('舞蹈.mp4', { kind: 'video' }), [file('舞蹈.mov')])?.name, '舞蹈.mov');
  assert.equal(matchRelinkFile(asset('clip.mov', { kind: 'video' }), [file('CLIP.mp4')])?.name, 'CLIP.mp4');

  // 3. Multiple stem candidates: prefer the kind-matching file.
  assert.equal(
    matchRelinkFile(asset('素材', { kind: 'audio' }), [file('素材.mp4'), file('素材.mp3')])?.name,
    '素材.mp3',
  );
  assert.equal(
    matchRelinkFile(asset('素材', { kind: 'video' }), [file('素材.mp4'), file('素材.mp3')])?.name,
    '素材.mp4',
  );
  assert.equal(
    matchRelinkFile(asset('脚本', { kind: 'document' }), [file('脚本.psd'), file('脚本.md')])?.name,
    '脚本.md',
  );

  // 4. Ambiguous stems with no kind match → null (no silent wrong relink).
  assert.equal(matchRelinkFile(asset('素材', { kind: 'image' }), [file('素材.mp4'), file('素材.mp3')]), null);

  // 5. No name / no match → null.
  assert.equal(matchRelinkFile(asset(''), [file('x.png')]), null);
  assert.equal(matchRelinkFile(asset('缺失.png'), [file('别的.png')]), null);

  // 6. Exact match beats stem match even when stems collide.
  assert.equal(
    matchRelinkFile(asset('a.png'), [file('a.png'), file('a.jpg')])?.name,
    'a.png',
  );

  // 7. Recorded source size gates candidates: a same-named file with different bytes is not the moved media.
  assert.equal(matchRelinkFile(asset('a.png', { sourceSize: 10 }), [file('a.png', '', 11)]), null);
  assert.equal(matchRelinkFile(asset('a.png', { sourceSize: 10 }), [file('a.png', '', 10)])?.size, 10);
  assert.equal(
    matchRelinkFile(asset('舞蹈.mp4', { kind: 'video', sourceSize: 20 }), [file('舞蹈.mov', '', 19)]),
    null,
  );
  assert.equal(
    matchRelinkFile(asset('舞蹈.mp4', { kind: 'video', sourceSize: 20 }), [file('舞蹈.mov', '', 19), file('舞蹈.mkv', '', 20)])?.name,
    '舞蹈.mkv',
  );
  // A same-named file of another size loses to a same-size stem match.
  assert.equal(
    matchRelinkFile(asset('b.png', { sourceSize: 5 }), [file('b.jpg', '', 5), file('b.png', '', 7)])?.name,
    'b.jpg',
  );

  console.log('mediaRelinkMatch.verify: all assertions passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
