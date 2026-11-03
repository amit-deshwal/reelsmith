// The home screen's start: direct a new reel (pick a shape).
import { useRef, useState } from 'react';
import type { RatioId } from '../../../shared/reelsmith/ratios';
import { theme } from '../../theme';

const SHAPES: ReadonlyArray<{ id: RatioId; label: string }> = [
  { id: '9:16', label: '9:16 Reel' }, { id: '4:5', label: '4:5 Feed' }, { id: '1:1', label: '1:1 Square' }, { id: '16:9', label: '16:9 Wide' },
];

export function ReelHome({ onStart }: { onStart: (ratio: RatioId) => Promise<void> }) {
  const [ratio, setRatio] = useState<RatioId>('9:16');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const starting = useRef(false);
  const start = async (shape: RatioId) => {
    if (starting.current) return;
    starting.current = true; setBusy(true); setError('');
    try { await onStart(shape); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { starting.current = false; setBusy(false); }
  };
  const button: React.CSSProperties = { padding: '7px 10px', borderRadius: 6, border: `0.5px solid ${theme.border}`, background: theme.panelAlt, color: theme.text, cursor: 'pointer' };
  return <section aria-label="Direct a reel" style={{ marginBottom: 36 }}>
    <h1 style={{ fontSize: 24, margin: '0 0 6px' }}>Direct a reel</h1>
    <p style={{ color: theme.textDim, fontSize: 13, margin: '0 0 12px' }}>Bring your clips, photos and a song, tell the story, and your agent directs the edit: the moments, the cuts on the beat, the words and the effects.</p>
    <div role="group" aria-label="Reel shape" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
      {SHAPES.map((shape) => <button key={shape.id} type="button" aria-pressed={ratio === shape.id} onClick={() => setRatio(shape.id)}
        style={{ ...button, background: ratio === shape.id ? theme.accent : theme.inset, color: ratio === shape.id ? theme.onAccent : theme.text }}>{shape.label}</button>)}
    </div>
    <button type="button" disabled={busy} onClick={() => { void start(ratio); }}
      style={{ ...button, background: theme.accent, color: theme.onAccent, fontWeight: 600, padding: '9px 16px' }}>{busy ? 'Starting…' : 'Start a reel'}</button>
    {error && <p role="alert" style={{ color: theme.danger }}>{error}</p>}
  </section>;
}
