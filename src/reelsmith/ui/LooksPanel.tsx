// "Reel looks": one-click grade + glow + texture stacks (see ../looks.ts) for every clip, or just the selected one.
import { useState } from 'react';
import type { BatchAction } from '../../editor/reducerActions';
import type { TimelineItem } from '../../editor/types';
import { theme } from '../../theme';
import { planLook, REEL_LOOKS, type ReelLook } from '../looks';

interface Props {
  items: readonly TimelineItem[];
  selectedItem: TimelineItem | null;
  onApply: (action: BatchAction) => void;
}

export function LooksPanel({ items, selectedItem, onApply }: Props) {
  const [lastLook, setLastLook] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const styleable = (item: TimelineItem) => item.kind === 'video' || item.kind === 'image';
  const clipCount = items.filter(styleable).length;
  const canUseSelected = !!selectedItem && styleable(selectedItem);
  const apply = (look: ReelLook | null, selectedOnly: boolean) => {
    const plan = planLook(items, look, selectedOnly && selectedItem ? [selectedItem.id] : undefined);
    if (!plan.clips) { setMessage('Add video or photo clips to the timeline first.'); return; }
    onApply({ type: 'batch', label: plan.label, actions: plan.actions });
    setLastLook(look?.id ?? null);
    setMessage(look ? `${look.name} on ${plan.clips} clip${plan.clips === 1 ? '' : 's'}. ⌘Z undoes it.` : `Looks removed from ${plan.clips} clip${plan.clips === 1 ? '' : 's'}.`);
  };
  const button: React.CSSProperties = { padding: '5px 8px', borderRadius: 6, border: `0.5px solid ${theme.border}`, background: theme.panelAlt, color: theme.text, cursor: 'pointer', fontSize: 12, textAlign: 'left' };
  const small: React.CSSProperties = { color: theme.textDim, fontSize: 11.5, lineHeight: 1.4 };
  return <section aria-label="Reel looks" style={{ display: 'grid', gap: 8, padding: 10, border: `0.5px solid ${theme.border}`, borderRadius: 8 }}>
    <b style={{ fontSize: 13 }}>Reel looks</b>
    <span style={small}>One click stacks a grade, glow and texture on your clips ({clipCount} on the timeline). Every effect stays editable in the clip's Video tab.</span>
    <div style={{ display: 'grid', gap: 6 }}>
      {REEL_LOOKS.map((look) => <div key={look.id} style={{ display: 'grid', gap: 4, padding: 8, border: `0.5px solid ${lastLook === look.id ? theme.accent : theme.border}`, borderRadius: 7 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, alignItems: 'baseline' }}>
          <strong style={{ fontSize: 12.5 }}>{look.name}</strong>
          <span style={{ ...small, fontSize: 11 }}>{look.mood}</span>
        </div>
        <span style={small}>{look.description}</span>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button type="button" disabled={!clipCount} onClick={() => apply(look, false)} style={button}>Apply to all clips</button>
          <button type="button" disabled={!canUseSelected} onClick={() => apply(look, true)} style={button} title={canUseSelected ? undefined : 'Select a video or photo clip on the timeline first'}>Apply to selected clip</button>
        </div>
      </div>)}
    </div>
    <button type="button" disabled={!clipCount} onClick={() => apply(null, false)} style={{ ...button, justifySelf: 'start' }}>Remove looks</button>
    {message && <span role="status" style={small}>{message}</span>}
  </section>;
}
