// RS-410: Inspector sliders for the window grow-in (start size, corner radius, centre height, shadow).
import type { CSSProperties } from 'react';
import type { TransitionItem } from '../editor/transitionTypes';
import { WINDOW_DEFAULTS, windowCentreYRange } from './windowProps';

type Key = keyof typeof WINDOW_DEFAULTS;

export function WindowControls({ transition, theme, width, height, onSet }: {
  transition: TransitionItem;
  theme: { textDim: string };
  width: number;
  height: number;
  onSet: (patch: Partial<TransitionItem>) => void;
}) {
  const [lo, hi] = windowCentreYRange({ width, height });
  const stored = transition.customUniforms ?? {};
  const val = (k: Key) => (Number.isFinite(stored[k]) ? stored[k]! : WINDOW_DEFAULTS[k]);
  const set = (k: Key, v: number) => onSet({ customUniforms: { ...stored, [k]: v } });
  const label: CSSProperties = { fontSize: 11, color: theme.textDim };
  const row = (k: Key, name: string, min: number, max: number, step: number, show: (v: number) => string) => (
    <label key={k} style={label} data-testid={`window-${k}`}>
      <div style={{ marginBottom: 4 }}>{name} <span style={{ opacity: 0.7 }}>{show(val(k))}</span></div>
      <input type="range" min={min} max={max} step={step} value={val(k)} onChange={(e) => set(k, Number(e.target.value))} style={{ width: '100%' }} />
    </label>
  );
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  return (
    <>
      {row('u_start', 'Start size', 0.1, 1, 0.05, pct)}
      {row('u_radius', 'Corner radius', 0, 0.1, 0.005, pct)}
      {lo < hi && row('u_cy', 'Centre height', lo, hi, 0.01, pct)}
      {row('u_shadow', 'Shadow', 0, 1, 0.05, pct)}
    </>
  );
}
