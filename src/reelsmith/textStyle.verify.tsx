import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { TextLayer } from '../editor/TimelineGraphicLayers';
import type { TimelineItem } from '../editor/types';
import { TextStyleControls } from './ui/TextStyleControls';
import { textShadowCss } from '../../shared/reelsmith/textStyle';

const title: TimelineItem = { id: 't', kind: 'text', name: 'T', track: 'V2', startFrame: 0, durationInFrames: 60, props: { text: 'Hi' } };
const render = (props: Record<string, unknown>) => renderToStaticMarkup(createElement(TextLayer, { item: { ...title, props: { ...title.props, ...props } }, canvasW: 1080, canvasH: 1920, fit: 'contain' }));

// defaults are unchanged for existing projects
assert.match(render({}), /text-shadow:0 3px 16px rgba\(0,0,0,0.55\)/);
assert.doesNotMatch(render({}), /text-stroke/);
// stroke and shadow props
const styled = render({ strokeWidth: 6, strokeColor: '#ff0000', shadowBlur: 4, shadowColor: '#00ff00' });
assert.match(styled, /-webkit-text-stroke:6px #ff0000/);
assert.match(styled, /paint-order:stroke fill/);
assert.match(styled, /text-shadow:0 3px 4px #00ff00/);
assert.match(render({ shadowEnabled: false }), /text-shadow:none/);
assert.equal(textShadowCss({ textShadow: '1px 1px red', shadowEnabled: false }), '1px 1px red', 'an explicit textShadow string still wins');

const ui = renderToStaticMarkup(createElement(TextStyleControls, { item: { ...title, props: { strokeWidth: 3 } }, onPropChange: () => {} }));
assert.match(ui, /aria-label="Outline colour"/);
assert.match(ui, /aria-label="Shadow blur"/);
assert.doesNotMatch(renderToStaticMarkup(createElement(TextStyleControls, { item: { ...title, props: { shadowEnabled: false } }, onPropChange: () => {} })), /Shadow blur/);
console.log('textStyle.verify: ok');
