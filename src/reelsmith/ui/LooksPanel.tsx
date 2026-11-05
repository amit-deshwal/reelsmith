// "Looks": one-click grade + glow + texture stacks (see ../looks.ts), as one compact row.
// The director picks a look itself; this is the manual override.
import { useState } from 'react';
import type { BatchAction } from '../../editor/reducerActions';
import type { TimelineItem } from '../../editor/types';
import { theme } from '../../theme';
import { planLook, REEL_LOOKS } from '../looks';

interface Props {
  items: readonly TimelineItem[];
  selectedItem: TimelineItem | null;
  onApply: (action: BatchAction) => void;
}

export function LooksPanel({ items, selectedItem, onApply }: Props) {
  const [lookId, setLookId] = useState(REEL_LOOKS[0]?.id ?? '');
  const [scope, setScope] = useState<'all' | 'selected'>('all');
  const [message, setMessage] = useState('');
  const styleable = (item: TimelineItem) => item.kind === 'video' || item.kind === 'image';
  const clipCount = items.filter(styleable).length;
  const canUseSelected = !!selectedItem && styleable(selectedItem);
  const selectedOnly = scope === 'selected' && canUseSelected;
  const look = REEL_LOOKS.find((l) => l.id === lookId) ?? null;
  const apply = (remove: boolean) => {
    const target = remove ? null : look;
    const plan = planLook(items, target, selectedOnly && selectedItem ? [selectedItem.id] : undefined);
    if (!plan.clips) { setMessage('Add video or photo clips to the timeline first.'); return; }
    onApply({ type: 'batch', label: plan.label, actions: plan.actions });
    const clips = `${plan.clips} clip${plan.clips === 1 ? '' : 's'}`;
    setMessage(target ? `${target.name} on ${clips}. ⌘Z undoes it.` : `Looks removed from ${clips}.`);
  };
  const control: React.CSSProperties = { padding: '4px 6px', borderRadius: 6, border: `0.5px solid ${theme.border}`, background: theme.panelAlt, color: theme.text, fontSize: 12 };
  const small: React.CSSProperties = { color: theme.textDim, fontSize: 11.5, lineHeight: 1.4 };
  return <section aria-label="Looks" style={{ display: 'grid', gap: 6, padding: 10, border: `0.5px solid ${theme.border}`, borderRadius: 8 }}>
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      <b style={{ fontSize: 13, marginRight: 2 }}>Look</b>
      <select aria-label="Look" value={lookId} onChange={(e) => setLookId(e.target.value)} style={{ ...control, flex: '1 1 120px', minWidth: 0 }}>
        {REEL_LOOKS.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
      </select>
      <select aria-label="Apply to" value={selectedOnly ? 'selected' : 'all'} onChange={(e) => setScope(e.target.value as 'all' | 'selected')} style={control}>
        <option value="all">All clips</option>
        <option value="selected" disabled={!canUseSelected}>Selected clip</option>
      </select>
      <button type="button" disabled={!clipCount || !look} onClick={() => apply(false)} style={{ ...control, cursor: 'pointer' }}>Apply</button>
      <button type="button" disabled={!clipCount} onClick={() => apply(true)} title="Remove the looks from these clips" style={{ ...control, cursor: 'pointer', color: theme.textDim }}>Remove</button>
    </div>
    {look && <span style={small} title={look.mood}>{look.description}</span>}
    {message && <span role="status" style={small}>{message}</span>}
  </section>;
}
