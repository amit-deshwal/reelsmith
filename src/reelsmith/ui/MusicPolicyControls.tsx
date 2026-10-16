// RS-602: how the song starts and ends in the assembled reel. Values live in the setup params (see ../musicPolicy.ts).
import { theme } from '../../theme';
import { END_POLICIES, MUSIC_PARAM, START_POLICIES } from '../musicPolicy';

type Params = Record<string, string | number | boolean>;

const label: React.CSSProperties = { fontSize: 11.5, color: theme.textDim };
const input: React.CSSProperties = {
  background: theme.inset, color: theme.text, border: `0.5px solid ${theme.border}`, borderRadius: 5, padding: '5px 7px', fontSize: 12.5,
};

export function MusicPolicyControls({ params, onChange, errorFor, canFitBars }: {
  params: Params;
  /** only reels cut on the beat can change their length to whole bars */
  canFitBars: boolean;
  onChange: (id: string, value: string | number | boolean) => void;
  errorFor: (field: string) => string | undefined;
}) {
  const start = String(params[MUSIC_PARAM.start] ?? 'fromStart');
  const end = String(params[MUSIC_PARAM.end] ?? 'hardCut');
  const offset = params[MUSIC_PARAM.offsetSec];
  const fade = params[MUSIC_PARAM.fadeOutSec];
  const err = (field: string) => errorFor(field) && <span style={{ ...label, color: theme.danger }}>{errorFor(field)}</span>;
  return (
    <div role="group" aria-label="Music" style={{ display: 'grid', gap: 8, borderTop: `0.5px solid ${theme.border}`, paddingTop: 10 }}>
      <span style={{ fontSize: 12.5, fontWeight: 600 }}>Music</span>
      <label style={{ display: 'grid', gap: 4 }}>
        <span style={{ fontSize: 12.5 }}>Start the song</span>
        <select style={input} value={start} onChange={(e) => onChange(MUSIC_PARAM.start, e.target.value)}>
          {START_POLICIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
        {(start === 'loudestSection' || start === 'userOffset') && <span style={label}>Starts on the bar nearest to this point, so the first cut lands on a downbeat.</span>}
      </label>
      {start === 'userOffset' && (
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 12.5 }}>Start at (seconds into the song)</span>
          <input style={input} type="number" min={0} step={0.1} value={typeof offset === 'number' && Number.isFinite(offset) ? offset : ''}
            onChange={(e) => onChange(MUSIC_PARAM.offsetSec, e.target.valueAsNumber)} />
          {err(MUSIC_PARAM.offsetSec)}
        </label>
      )}
      <label style={{ display: 'grid', gap: 4 }}>
        <span style={{ fontSize: 12.5 }}>End the song</span>
        <select style={input} value={end} onChange={(e) => onChange(MUSIC_PARAM.end, e.target.value)}>
          {END_POLICIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
        </select>
      </label>
      {end !== 'hardCut' && (
        <label style={{ display: 'grid', gap: 4 }}>
          <span style={{ fontSize: 12.5 }}>Fade-out (seconds)</span>
          <input style={input} type="number" min={0} max={10} step={0.1} value={typeof fade === 'number' && Number.isFinite(fade) ? fade : ''}
            onChange={(e) => onChange(MUSIC_PARAM.fadeOutSec, e.target.valueAsNumber)} />
          {err(MUSIC_PARAM.fadeOutSec)}
        </label>
      )}
      {canFitBars && <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5 }}>
        <input type="checkbox" checked={params[MUSIC_PARAM.fitBars] === true} onChange={(e) => onChange(MUSIC_PARAM.fitBars, e.target.checked)} />
        Fit reel length to whole bars
      </label>}
    </div>
  );
}
