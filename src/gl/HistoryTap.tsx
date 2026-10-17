// One earlier moment of a clip, for effects that look back (echo trails): a hidden, frame-synced copy of the clip's video, a
// few frames behind the real one, painted into its own staging canvas. Mirrors how ClipFx stages the main frame.
import { useCallback, useLayoutEffect, useRef } from 'react';
import { AbsoluteFill, Freeze, OffthreadVideo, Sequence, useCurrentFrame } from 'remotion';
import { Video as MediaVideo } from '@remotion/media';
import { offthreadTrimBefore, offthreadVideoTransparent } from '../editor/serverVideoDecoder';
import type { AspectFit, TimelineItem } from '../editor/types';

interface HistoryTapProps {
  item: TimelineItem;
  src: string;
  fps: number;
  /** the same trim the clip's own video uses */
  trimBefore: number;
  /** frames this copy runs behind the clip; until then it holds the clip's first frame */
  delay: number;
  fit: AspectFit;
  offthread: boolean;
  isRendering: boolean;
  /** called with the finished frame; the caller draws it and records which render it belongs to */
  onFrame: (source: CanvasImageSource, renderKey: string) => void;
  renderKey: string;
}

function TapVideo({ item, src, fps, trimBefore, fit, offthread, isRendering, onFrame, renderKey }: HistoryTapProps) {
  const target = useRef({ onFrame, renderKey });
  useLayoutEffect(() => { target.current = { onFrame, renderKey }; }, [onFrame, renderKey]);
  const stable = useCallback((source: CanvasImageSource) => target.current.onFrame(source, target.current.renderKey), []);
  // @remotion/media re-delivers the frame when the callback changes, so a parameter change at a paused frame re-stages it
  const keyed = useCallback((source: CanvasImageSource) => onFrame(source, renderKey), [onFrame, renderKey]);
  return (
    <AbsoluteFill style={{ opacity: 0, pointerEvents: 'none' }}>
      {offthread
        ? <OffthreadVideo src={src} trimBefore={offthreadTrimBefore(trimBefore, fps)} playbackRate={item.playbackRate ?? 1} muted
            transparent={offthreadVideoTransparent(src)} onVideoFrame={stable} style={{ width: '100%', height: '100%', objectFit: fit }} />
        : <MediaVideo src={src} trimBefore={trimBefore} playbackRate={item.playbackRate ?? 1} muted
            headless={isRendering} onVideoFrame={keyed} style={{ width: '100%', height: '100%' }} objectFit={fit} />}
    </AbsoluteFill>
  );
}

export function HistoryTap(props: HistoryTapProps) {
  const frame = useCurrentFrame();
  // Sequence only mounts its children once it has started, so the wait is a frozen first frame, then the delayed playback
  return frame < props.delay
    ? <Freeze frame={0}><TapVideo {...props} /></Freeze>
    : <Sequence from={props.delay} layout="none"><TapVideo {...props} /></Sequence>;
}
