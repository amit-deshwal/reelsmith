import type { CaptionsData } from '../../captions/types';
import { captionTemplatePatch } from '../../captions/captionTemplatePatch';
import { captionsFor, REELS_CAPTION_STYLES } from '../captionStyles';

/** Apply appearance in one editor update, preserving words, timing and translation. */
export function reelsCaptionPatch(captions: CaptionsData, id: string): Partial<CaptionsData> {
  const look = captionsFor(id);
  return {
    ...captionTemplatePatch(captions, look.template, look.styleOverride),
    ...look,
    enabled: true,
  };
}

export function ReelsCaptionStyles({ captions, onApply }: {
  captions: CaptionsData;
  onApply: (patch: Partial<CaptionsData>) => void;
}) {
  return (
    <div>
      <div className="cc-cap-label">Reels caption styles</div>
      <div className="cc-cap-styles" role="group" aria-label="Reels caption styles">
        {REELS_CAPTION_STYLES.map((style) => (
          <button key={style.id} type="button" className="cc-cap-style" title={style.hint}
            onClick={() => onApply(reelsCaptionPatch(captions, style.id))}>
            <span className="cc-cap-swatch" style={{
              background: style.styleOverride.background ?? '#1a1a1a',
              color: style.styleOverride.highlightColor ?? '#fff',
            }}>Aa</span>
            <span className="cc-cap-style-name">{style.label}</span>
          </button>
        ))}
      </div>
      <p className="cc-cap-hint">Applies the style, animation and Instagram-safe placement.</p>
    </div>
  );
}
