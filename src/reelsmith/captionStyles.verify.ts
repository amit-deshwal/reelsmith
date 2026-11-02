import assert from 'node:assert/strict';
import { REELS_CAPTION_STYLES, captionsFor, reelsCaptionStyle } from './captionStyles';
import { safeRect } from './safeZone';

const W = 1080;
const H = 1920;
const safe = safeRect({ width: W, height: H });

assert.deepEqual(REELS_CAPTION_STYLES.map((s) => s.id), ['clean-white', 'highlight-word', 'boxed', 'karaoke', 'pop-word', 'minimal-lower', 'behind-speaker', 'lyrics-behind']);
assert.equal(new Set(REELS_CAPTION_STYLES.map((s) => s.label)).size, 8, 'labels are distinct');
assert.equal(new Set(REELS_CAPTION_STYLES.map((s) => `${s.template}|${s.motionPreset}|${s.styleOverride.wordsPerPage}|${s.styleOverride.fontFamily}`)).size, 8, 'eight distinct looks (the two behind styles differ in words a page and face)');
// only the behind styles put the words behind the person; any other style turns it off again
assert.equal(captionsFor('behind-speaker').rsBehind, true);
assert.equal(captionsFor('lyrics-behind').rsBehind, true);
assert.equal(reelsCaptionStyle('lyrics-behind').styleOverride.wordsPerPage, 1, 'lyrics: one sung word at a time');
assert.ok(REELS_CAPTION_STYLES.filter((s) => !['behind-speaker', 'lyrics-behind'].includes(s.id)).every((s) => captionsFor(s.id).rsBehind === false));
assert.equal(reelsCaptionStyle('nope').id, 'highlight-word', 'unknown id falls back');

assert.equal(reelsCaptionStyle('minimal-lower').styleOverride.textTransform, 'lowercase');
assert.equal(captionsFor('minimal-lower').styleOverride?.textTransform, 'lowercase');

// captionsFor returns copies, not shared objects.
const a = captionsFor('boxed');
a.styleOverride!.fontSize = 1;
a.layout!.offsetYRatio = 9;
assert.notEqual(captionsFor('boxed').styleOverride!.fontSize, 1);
assert.notEqual(captionsFor('boxed').layout!.offsetYRatio, 9);

// Safe zone: mirror containerStyle placement (bottom anchor: 8% of H up, then lifted by offsetY;
// middle anchor: centred at 50% then moved down by offsetY; block is 80% wide and centred).
for (const s of REELS_CAPTION_STYLES) {
  const fontPx = (s.styleOverride.fontSize ?? 0.04) * H;
  const perPage = s.styleOverride.wordsPerPage ?? 4;
  const lines = Math.max(1, Math.ceil(perPage / 2)); // worst case wrap
  const blockH = lines * fontPx * 1.3 * (s.layout.scale ?? 1);
  const off = (s.layout.offsetYRatio ?? 0) * H;
  const anchor = s.layout.anchor ?? 'bottom-center';
  let top: number;
  let bottom: number;
  if (anchor.startsWith('middle') || anchor === 'center') {
    const c = H / 2 + off;
    top = c - blockH / 2;
    bottom = c + blockH / 2;
  } else {
    bottom = H - H * 0.08 - off;
    top = bottom - blockH;
  }
  assert.ok(top >= safe.y, `${s.id}: top ${top} inside safe zone (${safe.y})`);
  assert.ok(bottom <= safe.y + safe.h, `${s.id}: bottom ${bottom} above Instagram band (${safe.y + safe.h})`);
  assert.ok(W * 0.9 <= safe.x + safe.w + 1, `${s.id}: right edge clear of the like/share rail`);
}
console.log('captionStyles.verify OK');
