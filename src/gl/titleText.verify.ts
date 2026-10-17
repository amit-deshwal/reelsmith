import assert from 'node:assert/strict';
import { TITLE_WORDS, titleLabel, titleWord } from './titleText';
import { REEL_FX_EFFECTS } from './fx/reelFx';

assert.equal(titleWord(0), TITLE_WORDS[0]);
assert.equal(titleWord(-3), TITLE_WORDS[0]);
assert.equal(titleWord(999), TITLE_WORDS[TITLE_WORDS.length - 1]);
assert.equal(titleWord(NaN), TITLE_WORDS[0]);
assert.ok(TITLE_WORDS.every((t) => t === t.toUpperCase() && t.split('\n').length <= 2 && t.split('\n').every((l) => l.length <= 10)), 'short capitals, at most two lines');
assert.equal(titleLabel('THE LAST\nSUMMER'), 'the last summer');

const def = REEL_FX_EFFECTS['builtin:fx-title-reveal']!;
assert.ok(def.needsText && def.textKind === 'title' && !def.needsMask, 'title reveal needs a title, not a person');
const word = def.props.find((p) => p.key === 'word')!;
assert.equal((word as { max?: number }).max, TITLE_WORDS.length - 1, 'the word slider covers every title');
for (const t of TITLE_WORDS) assert.ok(def.desc.includes(titleLabel(t)), `description lists "${titleLabel(t)}"`);
console.log('titleText.verify ok');
