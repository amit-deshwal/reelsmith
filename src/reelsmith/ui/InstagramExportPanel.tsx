// RS-301/RS-302: "Instagram-ready" toggle and the last check report, shown on the Video export tab.
import { useState, useSyncExternalStore } from 'react';
import type { TimelineState } from '../../editor/types';
import { ratioOf } from '../../../shared/reelsmith/ratios';
import { theme } from '../../theme';
import { instagramReportStore, isSupportedShape, loadInstagramPreference, saveInstagramPreference } from '../instagramExport';

const NAMES: Record<string, string> = {
  V1: 'MP4, faststart', V2: 'Video H.264 High, canvas size, constant fps, Rec.709', V3: 'Audio AAC 48 kHz stereo', V4: 'Audio and video same length',
  V5: 'Decodes without errors', V6: 'Loudness -14 LUFS, peak -1 dBTP', V7: 'No unintended black frames', V8: 'Export matches the preview', V9: 'File size and bitrate', V10: 'No frozen or stuttering picture',
};

export function InstagramExportPanel({ state }: { state: TimelineState }) {
  const [pref, setPref] = useState(loadInstagramPreference);
  const report = useSyncExternalStore(instagramReportStore.subscribe, instagramReportStore.get, instagramReportStore.get);
  const update = (p: typeof pref) => { setPref(p); saveInstagramPreference(p); };
  const shape = ratioOf(state.width, state.height);
  const supported = isSupportedShape(state);
  const muted: React.CSSProperties = { fontSize: 11.5, color: theme.textDim };
  return (
    <section style={{ display: 'grid', gap: 6, padding: '10px 12px', border: `0.5px solid ${theme.border}`, borderRadius: 8, marginTop: 10 }}>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5 }}>
        <input type="checkbox" checked={pref.enabled} onChange={(e) => update({ ...pref, enabled: e.target.checked })} />
        Make it Instagram-ready
      </label>
      <span style={muted}>
        {supported
          ? `${shape} (${state.width}×${state.height}), H.264 High, AAC 48 kHz, -14 LUFS, faststart. Checked after rendering; fixed with a safe re-encode only if needed. Change the shape with the ratio control on the timeline.`
          : `The canvas is ${state.width}×${state.height}, which is not one of the supported shapes (9:16, 3:4, 4:5, 1:1, 16:9, 4:3), so this step is skipped.`}
      </span>
      {pref.enabled && (
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
          <input type="checkbox" checked={pref.silent} onChange={(e) => update({ ...pref, silent: e.target.checked })} />
          No music (I will add Instagram audio later)
        </label>
      )}
      {pref.enabled && (
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
          <input type="checkbox" checked={pref.srt} onChange={(e) => update({ ...pref, srt: e.target.checked })} />
          Also save the captions as an .srt file next to the video
        </label>
      )}
      {pref.enabled && (
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
          <input type="checkbox" checked={pref.sheet} onChange={(e) => update({ ...pref, sheet: e.target.checked })} />
          Also save a contact sheet of the export (.sheet.jpg)
        </label>
      )}
      {pref.enabled && (
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
          <input type="checkbox" checked={pref.cover} onChange={(e) => update({ ...pref, cover: e.target.checked })} />
          Also save a cover image for Instagram (.cover.jpg)
        </label>
      )}
      {pref.enabled && !pref.silent && (
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
          <input type="checkbox" checked={pref.noSound} onChange={(e) => update({ ...pref, noSound: e.target.checked })} />
          When the reel has a song, also save a copy without the song (.no-song.mp4, voice and natural sound kept) to add the song from Instagram&apos;s music
        </label>
      )}
      {report && report.status !== 'skipped' && (
        <div style={{ display: 'grid', gap: 3, fontSize: 12 }}>
          <b style={{ color: report.status === 'failed' || report.status === 'error' ? theme.danger : theme.text }}>
            {report.status === 'running' && 'Checking for Instagram…'}
            {report.status === 'passed' && 'Instagram check passed.'}
            {report.status === 'fixed' && 'Re-encoded for Instagram; all checks pass.'}
            {report.status === 'failed' && 'Still fails Instagram checks after a safe re-encode.'}
            {report.status === 'error' && `Instagram check could not run: ${report.message ?? ''}`}
          </b>
          {report.checks?.map((c) => (
            <span key={c.id} style={{ ...muted, color: c.status === 'FAIL' ? theme.danger : c.status === 'WARN' ? theme.gold : theme.textDim }}>
              {c.status === 'PASS' ? '✓' : c.status === 'WARN' ? '!' : '✗'} {NAMES[c.id] ?? c.id}: {c.detail}
            </span>
          ))}
          {report.status !== 'error' && report.message && <span style={muted}>{report.message}</span>}
          {report.srt && <span style={muted}>{report.srt}</span>}
          {report.sheet && <span style={muted}>{report.sheet}</span>}
          {report.cover && <span style={muted}>{report.cover}</span>}
          {report.music && <span style={muted}>{report.music}</span>}
          {report.qa && <span style={muted}>{report.qa}</span>}
          {report.failedPath && <span style={muted}>The failed re-encode was kept as {report.failedPath.split('/').pop()}; the original export was delivered.</span>}
        </div>
      )}
    </section>
  );
}
