// In/out animation presets for text clips, applied as keyframes (see shared/reelsmith/textAnimation.ts).
import type { CSSProperties } from 'react';
import { theme } from '../../theme';
import { ANIM_PROPS, TEXT_ANIM_PRESETS, textAnimationKeyframes, type TextAnimPreset } from '../../../shared/reelsmith/textAnimation';
import type { KeyframeEasing, KeyframeProp } from '../../editor/clipTypes';
import type { TimelineItem } from '../../editor/types';

export interface TextAnimationPanel {
  fps: number;
  onItemPropChange: (key: string, value: unknown) => void;
  onSetItemKeyframe: (prop: KeyframeProp, frame: number, value: number, easing?: KeyframeEasing) => void;
  onRemoveItemKeyframe: (prop: KeyframeProp, frame: number) => void;
  historyGesture: { begin: () => void; end: () => void };
}

const sel: CSSProperties = { background: theme.bg, color: theme.text, border: `0.5px solid ${theme.borderLight}`, borderRadius: 4, padding: '3px 5px' };
const asPreset = (v: unknown): TextAnimPreset => (TEXT_ANIM_PRESETS.some((p) => p.id === v) ? (v as TextAnimPreset) : 'none');

export function TextAnimationControls({ item, panel }: { item: TimelineItem; panel: TextAnimationPanel }) {
  const p = item.props ?? {};
  const inPreset = asPreset(p.rsAnimIn);
  const outPreset = asPreset(p.rsAnimOut);
  const sec = Number(p.rsAnimSec ?? 0.4);

  const apply = (next: { in?: TextAnimPreset; out?: TextAnimPreset; sec?: number }) => {
    const i = next.in ?? inPreset;
    const o = next.out ?? outPreset;
    const s = next.sec ?? sec;
    const t = item.transform ?? {};
    const kfs = textAnimationKeyframes(i, o, item.durationInFrames, Math.round(s * panel.fps), { y: t.y ?? 0, scale: t.scale ?? 1, opacity: t.opacity ?? 1 });
    panel.historyGesture.begin();
    try {
      panel.onItemPropChange('rsAnimIn', i);
      panel.onItemPropChange('rsAnimOut', o);
      panel.onItemPropChange('rsAnimSec', s);
      // Not onResetItemKeyframes: that also resets the clip's static y/scale/opacity (and crop) to defaults.
      for (const prop of ANIM_PROPS) for (const kf of item.keyframes?.[prop] ?? []) panel.onRemoveItemKeyframe(prop, kf.frame);
      for (const k of kfs) panel.onSetItemKeyframe(k.prop, k.frame, k.value, k.easing);
    } finally {
      panel.historyGesture.end();
    }
  };

  const select = (name: string, value: TextAnimPreset, onChange: (v: TextAnimPreset) => void) => (
    <label style={{ fontSize: 11, color: theme.textDim, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      {name}
      <select aria-label={name} value={value} onChange={(e) => onChange(e.target.value as TextAnimPreset)} style={{ ...sel, minWidth: 120 }}>
        {TEXT_ANIM_PRESETS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
      </select>
    </label>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {select('Animate in', inPreset, (v) => apply({ in: v }))}
      {select('Animate out', outPreset, (v) => apply({ out: v }))}
      {(inPreset !== 'none' || outPreset !== 'none') && (
        <label style={{ fontSize: 11, color: theme.textDim }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}><span>Animation length</span><span style={{ opacity: 0.7 }}>{sec.toFixed(1)}s</span></div>
          <input aria-label="Animation length" type="range" min={0.1} max={1.5} step={0.1} value={sec} onChange={(e) => apply({ sec: Number(e.target.value) })} style={{ width: '100%' }} />
        </label>
      )}
    </div>
  );
}
