// RS-601: correct the music clip's beat grid by hand: analyse, nudge the phase, half/double tempo,
// set the downbeat at the playhead, or tap the tempo while it plays. Each change is one prop update (one undo step).
import { useState } from 'react';
import type { TimelineItem } from '../../editor/types';
import { theme } from '../../theme';
import { analyzeApi } from '../analyzeApi';
import { readBeatGrid } from '../beatSnap';
import { doubleTempo, gridFromTempo, halveTempo, setDownbeat, shiftPhase, tapTempo, type BeatGrid } from '../beatGrid';

export function BeatGridControls({ item, fps, getPlayhead, sourceDurationFrames, onChange }: {
  item: TimelineItem; fps: number; getPlayhead: () => number; sourceDurationFrames?: number;
  onChange: (grid: BeatGrid | undefined) => void;
}) {
  const grid = readBeatGrid(item);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [taps, setTaps] = useState<number[]>([]);
  const rate = Math.max(0.01, item.playbackRate ?? 1);
  const sourceSecAtPlayhead = () => ((item.srcInFrame ?? 0) + (getPlayhead() - item.startFrame) * rate) / fps;
  const btn: React.CSSProperties = {
    fontSize: 11.5, padding: '4px 8px', borderRadius: 5, border: `0.5px solid ${theme.border}`, background: theme.inset, color: theme.text, cursor: 'pointer',
  };
  const analyse = async () => {
    if (!item.src) return;
    setBusy(true); setNote('Finding the beat…');
    const g = await analyzeApi.musicGrid({ id: item.sourceAssetId ?? item.id, src: item.src } as never).catch(() => null);
    setBusy(false);
    if (!g || g.beatTimesSec.length < 2) { setNote('No steady beat found. Tap the tempo instead.'); return; }
    onChange({ beatTimesSec: g.beatTimesSec, beatsPerBar: g.beatsPerBar, downbeatIndex: g.downbeatIndex });
    setNote(`${Math.round(60 / (g.beatTimesSec[1]! - g.beatTimesSec[0]!))} bpm`);
  };
  const bpm = grid && grid.beatTimesSec.length > 1
    ? Math.round(60 * (grid.beatTimesSec.length - 1) / (grid.beatTimesSec[grid.beatTimesSec.length - 1]! - grid.beatTimesSec[0]!))
    : null;
  const tap = () => {
    const now = sourceSecAtPlayhead();
    const next = [...taps.filter((t) => now - t < 8 && now > t), now];
    setTaps(next);
    const t = tapTempo(next);
    setNote(t ? `${Math.round(t)} bpm from ${next.length} taps` : `${next.length} tap(s); keep tapping on the beat while it plays`);
  };
  const applyTaps = () => {
    const t = tapTempo(taps);
    if (!t) return;
    const dur = (sourceDurationFrames ?? (item.srcInFrame ?? 0) + item.durationInFrames * rate) / fps;
    onChange(gridFromTempo(t, taps[0]!, dur, grid?.beatsPerBar ?? 4));
    setTaps([]); setNote(`Grid set to ${Math.round(t)} bpm`);
  };
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <span style={{ fontSize: 11.5, color: theme.textDim }}>
        {grid ? `${bpm ?? '?'} bpm · bars in purple, beats in cyan on the clip` : 'No beat grid yet.'}
      </span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        <button type="button" style={btn} disabled={busy} onClick={() => { void analyse(); }}>{grid ? 'Re-analyse' : 'Find the beat'}</button>
        {grid && <>
          <button type="button" style={btn} title="Move every beat 20 ms earlier" onClick={() => onChange(shiftPhase(grid, -0.02))}>◀ 20 ms</button>
          <button type="button" style={btn} title="Move every beat 20 ms later" onClick={() => onChange(shiftPhase(grid, 0.02))}>20 ms ▶</button>
          <button type="button" style={btn} onClick={() => onChange(halveTempo(grid))}>½× tempo</button>
          <button type="button" style={btn} onClick={() => onChange(doubleTempo(grid))}>2× tempo</button>
          <button type="button" style={btn} title="Make the beat nearest the playhead the first beat of a bar" onClick={() => onChange(setDownbeat(grid, sourceSecAtPlayhead()))}>Downbeat here</button>
          <button type="button" style={btn} onClick={() => onChange(undefined)}>Clear</button>
        </>}
      </div>
      <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <button type="button" style={btn} title="Play the song and tap on each beat" onClick={tap}>Tap</button>
        {tapTempo(taps) && <button type="button" style={btn} onClick={applyTaps}>Use tapped tempo</button>}
        {note && <span style={{ fontSize: 11.5, color: theme.textDim }}>{note}</span>}
      </div>
    </div>
  );
}
