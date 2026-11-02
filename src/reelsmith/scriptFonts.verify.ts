// RS-1253: Hindi and Marathi text gets the bundled Devanagari face after the style's own, and director text animates
// Devanagari syllable by syllable instead of splitting vowel signs and joined consonants off their letters.
import assert from 'node:assert/strict';
import type { AtomicAction } from '../editor/reducerActions';
import { DEVANAGARI_FONT, hasDevanagari, scriptWeight, withScriptFont, withScriptFonts } from './scriptFonts';
import { TEXT_GRAPHIC_CODE } from './director/textGraphic';

assert.ok(hasDevanagari('दीवाना हुआ'));
assert.ok(!hasDevanagari('Monsoon days') && !hasDevanagari(undefined));
assert.equal(withScriptFont('Anton', 'दीवाना'), `Anton, ${DEVANAGARI_FONT}`);
assert.equal(withScriptFont('Anton', 'Torna'), 'Anton', 'Latin text keeps its face alone');
assert.equal(withScriptFont(DEVANAGARI_FONT, 'हाय'), DEVANAGARI_FONT, 'not twice');
assert.equal(withScriptFont(undefined, 'हाय'), DEVANAGARI_FONT);
assert.equal(scriptWeight(400, 'हाय'), 800, 'Anton is one light weight: Devanagari-only text asks Noto for a heavy cut');
assert.equal(scriptWeight(400, 'Day 2 · हाय'), 400, 'mixed text keeps the face\'s weight');
assert.equal(scriptWeight(900, 'हाय'), 900);

const batch: AtomicAction[] = [
  { type: 'add', startFrame: 0, item: { id: 't1', kind: 'motion-graphic', track: 'T1', durationInFrames: 30, props: { text: 'जादूगर', fontFamily: 'Anton', fontWeight: 400, subFontFamily: 'Inter' } } as never },
  { type: 'add', startFrame: 0, item: { id: 't2', kind: 'motion-graphic', track: 'T2', durationInFrames: 30, props: { text: 'Torna', fontFamily: 'Anton', fontWeight: 400 } } as never },
  { type: 'add', startFrame: 0, item: { id: 'song', kind: 'audio', track: 'A1', durationInFrames: 30, transcript: [{ text: 'दीवाना', start: 0, end: 400 }] } as never },
  { type: 'setCaptions', captions: { enabled: true, styleOverride: { fontFamily: 'Montserrat', fontWeight: 900 } } as never },
];
const out = withScriptFonts(batch) as any[];
assert.deepEqual(out[0].item.props, { text: 'जादूगर', fontFamily: `Anton, ${DEVANAGARI_FONT}`, fontWeight: 800, subFontFamily: `Inter, ${DEVANAGARI_FONT}` });
assert.equal(out[1], batch[1], 'Latin text untouched');
assert.equal(out[3].captions.styleOverride.fontFamily, `Montserrat, ${DEVANAGARI_FONT}`, 'captions over a Devanagari transcript');
assert.equal(out[3].captions.styleOverride.fontWeight, 900);
const latinOnly = withScriptFonts([batch[3]!]);
assert.equal(latinOnly[0], batch[3], 'no Devanagari words, captions untouched');

// the text engine's letters: marks stay on their letter and a virama joins the next consonant
const src = TEXT_GRAPHIC_CODE.match(/const letters = \(str\) => \{[\s\S]*?\n  \};/)![0];
const letters = new Function(`${src}; return letters;`)() as (s: string) => string[];
assert.deepEqual(letters('दीवाना'), ['दी', 'वा', 'ना']);
assert.deepEqual(letters('क्षमा'), ['क्ष', 'मा']);
assert.deepEqual(letters('हुआ'), ['हु', 'आ']);
assert.deepEqual(letters('मैं'), ['मैं']);
assert.deepEqual(letters('Torna'), ['T', 'o', 'r', 'n', 'a']);
console.log('scriptFonts: Devanagari fonts and syllables ok');
