// Big titles wrap to stay big, and their capitals are in the text (text items ignore textTransform).
import assert from 'node:assert/strict';
import { bigTitle, caption, wrapToFit, type TextContext } from './basicTextStyles';

function build(style: typeof bigTitle, text: string): Record<string, unknown> {
  const emitted: Array<{ item: { props: Record<string, unknown> } }> = [];
  const ctx: TextContext = {
    W: 1080, H: 1920, fps: 30, start: 0, end: 90, beatFrame: (b) => b * 15, beats: 6, text, params: {}, seed: 1,
    id: (...parts) => parts.join('-'), lane: (n) => `lane-${n}`, emit: (a) => emitted.push(a as never), warn: () => undefined,
  };
  style.build(ctx);
  return emitted[0].item.props;
}

const title = build(bigTitle, 'school friends are getting married');
assert.equal(title.text, 'SCHOOL FRIENDS\nARE GETTING\nMARRIED', 'a 34-character title wraps into balanced lines');
assert.equal(title.textTransform, undefined);
assert.ok((title.fontSize as number) >= 100, `big title stays big (got ${String(title.fontSize)}, was 51 on one line)`);

const short = build(bigTitle, 'worth it');
assert.equal(short.text, 'WORTH IT', 'a short title stays on one line');
assert.equal(short.fontSize, 140);

assert.equal(wrapToFit('one\ntwo', 100, 1080, 0.8, 0.5).text, 'one\ntwo', 'the plan\'s own line breaks are kept');
const line = build(caption, 'we almost turned back here, but the view at the top was worth every step');
assert.ok(String(line.text).includes('\n') && (line.fontSize as number) > 28, 'a long caption wraps instead of shrinking');
// the landscape title spans most of the width whatever the word's length: "AMK" was a fifth of a 9:16 frame and unreadable
{
  const { sceneryTitleSize } = await import('./textStyles');
  const width = (text: string, W: number, H: number) => sceneryTitleSize(text, W, H) * (([...text].length * 183 + 120) / 320) * (H / W);
  assert.ok(width('AMK', 1080, 1920) > 0.55, `AMK spans ${width('AMK', 1080, 1920).toFixed(2)} of the width`);
  assert.ok(Math.abs(width('HARISHCHANDRAGAD', 1080, 1920) - 0.72) < 0.01);
  assert.equal(sceneryTitleSize('A', 1080, 1920), 0.2, 'one letter stops at the cap, not a frame-high letter');
  assert.ok(width('HARISHCHANDRAGAD', 1920, 1080) <= 0.51);
}
// engine styles wrap too: the typewriter hook "bro lied to me that it would be easy hike" was shrunk to 37px on one line
{
  const { ENGINE_STYLES } = await import('./textStyles');
  const typewriter = ENGINE_STYLES.find((s) => s.id === 'typewriter')!;
  const hook = build(typewriter as typeof bigTitle, 'bro lied to me that it would be easy hike');
  assert.equal(hook.text, 'bro lied to me that\nit would be easy hike');
  assert.ok((hook.fontSize as number) >= 60, `the hook stays readable (got ${String(hook.fontSize)})`);
}
// a line the plan places itself (x or y) is marked, so the passes that move lines off faces, and the one that lays a
// line behind a person across their head, leave it where the plan put it
{
  const { ENGINE_STYLES } = await import('./textStyles');
  const rise = ENGINE_STYLES.find((s) => s.id === 'rise-lines')!;
  const props = (params: Record<string, number>) => {
    const emitted: Array<{ item: { props: Record<string, unknown> } }> = [];
    rise.build({ W: 1080, H: 1920, fps: 30, start: 0, end: 90, beatFrame: (b: number) => b * 15, beats: 6, text: 'we made it', params, seed: 1,
      id: (...parts: string[]) => parts.join('-'), lane: (n: number) => `lane-${n}`, emit: (a: unknown) => emitted.push(a as never), warn: () => undefined } as never);
    return emitted[0]!.item.props;
  };
  assert.deepEqual([props({ y: 0.2 }).y, props({ y: 0.2 }).rsFixedPosition], [0.2, true]);
  assert.equal(props({ x: -1, y: -1 }).rsFixedPosition, undefined, 'the style\'s own place may be moved');
}
console.log('basicTextStyles verify ok');
