// Director tab: tell the story and the agent directs the reel; reshape a directed reel and put a look on a clip.
// The agent does the work (src/reelsmith/agent, src/reelsmith/director); this file is only the form.
import { useEffect, useState } from 'react';
import type { RatioId } from '../../../shared/reelsmith/ratios';
import { directorPrompt, reshapePrompt, STORY_MAX } from '../director/directorPrompt';
import { findSavedDirector } from '../director/directorSession';
import { warmDirectorInApp } from '../agent/reelsToolsApp';
import type { BatchAction } from '../../editor/reducerActions';
import type { MediaAsset, TimelineItem } from '../../editor/types';
import { theme } from '../../theme';
import { LooksPanel } from './LooksPanel';

export interface DirectorPanelProps {
  assets: MediaAsset[];
  /** timeline clips and the selected one, for Reel looks and the reel's current shape */
  items?: readonly TimelineItem[];
  selectedItem?: TimelineItem | null;
  onApply: (action: BatchAction) => void;
  /** prefill the chat with a request */
  onAskAgent?: (text: string, opts?: { autoSend?: boolean }) => void;
  /** the shape the reel was started in (the home screen's choice) */
  initialRatio?: RatioId;
  /** RS-1258: the project and the timeline's rate, so the clips are watched while the story is written */
  projectId?: string;
  fps?: number;
}

/** Wait for imports to settle before watching the clips (a batch of 20 lands one by one). */
const WARM_DELAY_MS = 1500;

const SHAPES = ['9:16', '4:5', '1:1', '16:9'] as const;
const label: React.CSSProperties = { fontSize: 11.5, color: theme.textDim };
const input: React.CSSProperties = {
  background: theme.inset, color: theme.text, border: `0.5px solid ${theme.border}`, borderRadius: 5, padding: '5px 7px', fontSize: 12.5,
};

export function DirectorPanel({ assets, items, selectedItem, onApply, onAskAgent, initialRatio, projectId, fps }: DirectorPanelProps) {
  const [story, setStory] = useState('');
  const [referenceId, setReferenceId] = useState('');
  const [directorRatio, setDirectorRatio] = useState<RatioId>(SHAPES.find((r) => r === initialRatio) ?? '9:16');
  const [askFirst, setAskFirst] = useState(false);
  // RS-1258: stage 1's analysis starts here, while the story is written; the agent's first call picks it up
  const mediaKey = assets.filter((a) => a.kind === 'video' || a.kind === 'image').map((a) => `${a.id}:${a.src}`).join(',');
  const hasItems = (items?.length ?? 0) > 0;
  useEffect(() => {
    if (!projectId || !fps || !mediaKey || !onAskAgent) return undefined;
    const timer = setTimeout(() => { void warmDirectorInApp({ projectId, assets, fps, timelineHasItems: hasItems, ...(referenceId ? { referenceId } : {}) }); }, WARM_DELAY_MS);
    return () => clearTimeout(timer);
    // assets are read through mediaKey: a re-render with the same media does not start it again
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, fps, mediaKey, hasItems, referenceId, onAskAgent]);
  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'grid', gap: 10, alignContent: 'start' }}>
      {onAskAgent && <section aria-label="Direct my reel" style={{ display: 'grid', gap: 6, padding: 10, border: `0.5px solid ${theme.border}`, borderRadius: 8 }}>
        <b style={{ fontSize: 13 }}>Direct my reel</b>
        <span style={label}>Import your clips, photos and song, then tell the story. Your agent picks the effects, the clips and the words, and builds it.</span>
        {(() => {
          const n = (k: string) => assets.filter((a) => a.kind === k).length;
          const songs = n('audio');
          return <span style={{ ...label, color: songs ? theme.textDim : theme.danger }}>
            Imported: {n('video')} clips, {n('image')} photos, {songs} song{songs === 1 ? '' : 's'}.{songs ? '' : ' No song yet: import yours, or the reel keeps the clips\' own sound.'}
          </span>;
        })()}
        <textarea aria-label="Your story" value={story} onChange={(e) => setStory(e.target.value.slice(0, STORY_MAX))} rows={3} placeholder="2 days on the toughest trek in Maharashtra: climbed at dawn, cooked on the cliff, made it to the top" style={{ ...input, resize: 'vertical' }} />
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <select aria-label="Shape" value={directorRatio} onChange={(e) => setDirectorRatio(e.target.value as RatioId)} style={input}>
            {SHAPES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          {assets.some((a) => a.kind === 'video') && <select aria-label="Reference reel" title="A reel you want yours to feel like (its pace and look). It is not used as footage." value={referenceId} onChange={(e) => setReferenceId(e.target.value)} style={input}>
            <option value="">No reference reel</option>
            {assets.filter((a) => a.kind === 'video').map((a) => <option key={a.id} value={a.id}>Feel like: {a.name}</option>)}
          </select>}
          <label title="Your agent shows the concept, the parts on the song and the signature moment, and builds only when you say go." style={{ ...label, display: 'flex', gap: 4, alignItems: 'center' }}>
            <input type="checkbox" checked={askFirst} onChange={(e) => setAskFirst(e.target.checked)} />Show me the plan first
          </label>
          <button type="button" disabled={!story.trim()} onClick={() => {
            const reference = assets.find((a) => a.id === referenceId);
            onAskAgent(directorPrompt(story, directorRatio, assets.filter((a) => a.kind === 'audio').length, reference ? { id: reference.id, name: reference.name } : undefined, askFirst), { autoSend: true });
          }} style={{ ...input, cursor: story.trim() ? 'pointer' : 'default' }}>Direct my reel</button>
        </div>
        {(() => {
          // RS-1233: the directed reel on this timeline, in another shape
          const shape = findSavedDirector(items ?? [])?.build?.plan.ratio;
          if (!shape) return null;
          return (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={label}>This {shape} reel, also as:</span>
              {SHAPES.filter((r) => r !== shape).map((r) => (
                <button key={r} type="button" title={`A new ${r} timeline with the same sections, clips and lines, laid out for ${r}`} onClick={() => onAskAgent(reshapePrompt(r), { autoSend: true })} style={{ ...input, cursor: 'pointer' }}>{r}</button>
              ))}
            </div>
          );
        })()}
      </section>}
      {items && <LooksPanel items={items} selectedItem={selectedItem ?? null} onApply={onApply} />}
    </div>
  );
}
