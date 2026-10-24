import { useState } from 'react';
import type { CaptionsData } from '../../captions/types';
import { captionTemplatePatch } from '../../captions/captionTemplatePatch';
import type { TimelineItem } from '../../editor/types';
import { behindCaptionLayout } from '../captionBehindPlace';
import { captionsFor, REELS_CAPTION_STYLES } from '../captionStyles';
import { findPeople } from '../peopleFinder';

/** Apply appearance in one editor update, preserving words, timing and translation. */
export function reelsCaptionPatch(captions: CaptionsData, id: string): Partial<CaptionsData> {
  const look = captionsFor(id);
  return {
    ...captionTemplatePatch(captions, look.template, look.styleOverride),
    ...look,
    enabled: true,
  };
}

/** The timeline the captions sit on, so "Behind the speaker" can put the words across the speaker's head. */
export interface CaptionScene { items: TimelineItem[]; fps: number; canvas: { width: number; height: number } }

export function ReelsCaptionStyles({ captions, onApply, scene }: {
  captions: CaptionsData;
  onApply: (patch: Partial<CaptionsData>) => void;
  scene?: CaptionScene;
}) {
  const [placing, setPlacing] = useState(false);
  const apply = async (id: string) => {
    const patch = reelsCaptionPatch(captions, id);
    if (!patch.rsBehind || !scene) { onApply(patch); return; }
    setPlacing(true);
    // one update: the style and the height of the speaker's head (the style's own height when nobody is found)
    const layout = await behindCaptionLayout(scene.items, { ...captions, ...patch }, scene.canvas, scene.fps, findPeople).catch(() => null);
    setPlacing(false);
    onApply(layout ? { ...patch, layout } : patch);
  };
  return (
    <div>
      <div className="cc-cap-label">Reels caption styles</div>
      <div className="cc-cap-styles" role="group" aria-label="Reels caption styles">
        {REELS_CAPTION_STYLES.map((style) => (
          <button key={style.id} type="button" className="cc-cap-style" title={style.hint} disabled={placing}
            onClick={() => { void apply(style.id); }}>
            <span className="cc-cap-swatch" style={{
              background: style.styleOverride.background ?? '#1a1a1a',
              color: style.styleOverride.highlightColor ?? '#fff',
            }}>Aa</span>
            <span className="cc-cap-style-name">{style.label}</span>
          </button>
        ))}
      </div>
      <p className="cc-cap-hint">{placing ? 'Finding the speaker…' : 'Applies the style, animation and Instagram-safe placement.'}</p>
    </div>
  );
}
