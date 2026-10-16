// RS-303: shades the parts of a Reel that Instagram's own UI covers (caption, buttons, header).
// Drawn in percent of the canvas, inside the same box as the upstream title/action safe frame.
import { DEFAULT_SAFE_ZONE, safeAreaFor, type SafeZone } from '../safeZone';

export function InstagramSafeZoneOverlay({ width, height, zone = DEFAULT_SAFE_ZONE }: { width: number; height: number; zone?: SafeZone }) {
  if (!width || !height) return null;
  const pct = (v: number, of: number) => `${(v / of) * 100}%`;
  const area = safeAreaFor({ width, height }, zone);
  if (area.kind === 'none') return null;
  const { bands, labels } = area;
  return (
    <div aria-hidden="true" style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {bands.map((b, i) => (
        <div key={i} style={{
          position: 'absolute', left: pct(b.x, width), top: pct(b.y, height), width: pct(b.w, width), height: pct(b.h, height),
          background: 'rgba(255, 64, 96, 0.22)', outline: '1px dashed rgba(255, 64, 96, 0.8)', outlineOffset: -1,
          display: 'flex', alignItems: i === 1 ? 'flex-start' : 'center', justifyContent: 'center',
        }}>
          {labels[i] && (
            <span style={{
              fontSize: 9, color: '#fff', background: 'rgba(0,0,0,0.55)', padding: '1px 4px', borderRadius: 3, marginTop: i === 1 ? 4 : 0,
              writingMode: area.kind === 'grid' || i === 3 ? 'vertical-rl' : undefined, whiteSpace: 'nowrap',
            }}>{labels[i]}</span>
          )}
        </div>
      ))}
    </div>
  );
}
