// Outline (stroke) and shadow for text clips. Props are read by TextLayer via shared/reelsmith/textStyle.ts.
import type { CSSProperties } from 'react';
import { theme } from '../../theme';
import { DEFAULT_SHADOW } from '../../../shared/reelsmith/textStyle';
import type { TimelineItem } from '../../editor/types';

const label: CSSProperties = { fontSize: 11, color: theme.textDim };
const row: CSSProperties = { display: 'flex', justifyContent: 'space-between', marginBottom: 4 };
const hexOr = (v: unknown, fallback: string) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : fallback);

export function TextStyleControls({ item, onPropChange }: { item: TimelineItem; onPropChange: (key: string, value: unknown) => void }) {
  const p = item.props ?? {};
  const stroke = Number(p.strokeWidth ?? 0);
  const shadowOn = p.shadowEnabled !== false && p.textShadow !== 'none';
  const blur = Number(p.shadowBlur ?? DEFAULT_SHADOW.blur);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4, paddingTop: 8, borderTop: `0.5px solid ${theme.borderLight}` }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: theme.text }}>Outline and shadow</div>
      <label style={label}>
        <div style={row}><span>Outline width</span><span style={{ opacity: 0.7 }}>{stroke}px</span></div>
        <input aria-label="Outline width" type="range" min={0} max={20} step={1} value={stroke} onChange={(e) => onPropChange('strokeWidth', Number(e.target.value))} style={{ width: '100%' }} />
      </label>
      {stroke > 0 && (
        <label style={{ ...label, display: 'flex', alignItems: 'center', gap: 6 }}>
          Outline colour <input aria-label="Outline colour" type="color" value={hexOr(p.strokeColor, '#000000')} onChange={(e) => onPropChange('strokeColor', e.target.value)} />
        </label>
      )}
      <label style={{ ...label, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
        <input aria-label="Shadow" type="checkbox" checked={shadowOn} onChange={(e) => onPropChange('shadowEnabled', e.target.checked)} />
        Shadow
      </label>
      {shadowOn && (
        <>
          <label style={label}>
            <div style={row}><span>Shadow blur</span><span style={{ opacity: 0.7 }}>{blur}px</span></div>
            <input aria-label="Shadow blur" type="range" min={0} max={40} step={1} value={blur} onChange={(e) => onPropChange('shadowBlur', Number(e.target.value))} style={{ width: '100%' }} />
          </label>
          <label style={{ ...label, display: 'flex', alignItems: 'center', gap: 6 }}>
            Shadow colour <input aria-label="Shadow colour" type="color" value={hexOr(p.shadowColor, '#000000')} onChange={(e) => onPropChange('shadowColor', e.target.value)} />
          </label>
        </>
      )}
    </div>
  );
}
