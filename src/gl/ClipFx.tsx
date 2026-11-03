import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AbsoluteFill, Img, OffthreadVideo, continueRender, delayRender, getRemotionEnvironment, useCurrentFrame, useVideoConfig } from 'remotion';
import { Video as MediaVideo } from '@remotion/media';
import { createGlRuntime, type GlRuntime } from './runtime';
import { cubeSettled, ensureCube } from './fx/cube';
import { disposeRuntimeSlot, ensureRuntimeSlot } from './runtimeSlot';
import { buildEffectShaderFrame } from './shaderFrame';
import { glPreviewFailureReason } from './previewAdapter';
import type { SelectedPreviewFallbackReason, SelectedPreviewStatusListener } from './previewAdapter';
import type { AspectFit, TimelineItem } from '../editor/types';
import { sourceFrameAt } from '../editor/sourceLimit';
import { offthreadTrimBefore, offthreadVideoTransparent, useRuntimeVideoDecoder } from '../editor/serverVideoDecoder';
import { glEffects } from './clipEffects';
import { cropPositionFromProps, type CropPosition } from '../reelsmith/cropFocus';
import { cloneMaskFrame, fullFrameMask, loadPersonMask, subjectUniforms, type PersonMaskFrame, type PersonMaskProvider, type PersonModel } from './personMask';
import { HistoryTap } from './HistoryTap';
import { LruCache } from './frameCache';
import { textCellFor } from './textLayer';
import { fxUniform } from './fx/uniforms';
import { envelopeFrame, isPersonRegion, isSkyRegion, mixUniformsAt } from '../reelsmith/effectMix';
import { depthRequestFor, depthSrcOf, depthTrackRequestFor, depthTrackSrcOf, parseSkyModel, requestDepthMap, requestDepthTrack, skyModelSrcFor, skyModelUniforms, skySrcFor, type SkyModel } from '../reelsmith/depthMaps';
import { depthTrackMetaName, depthTrackSkyName, parseDepthTrackMeta, skyModelBetween, subjectAt, tileRect, tilesAt, type DepthTrackMeta } from '../../shared/reelsmith/depthTrack';
import { drawFitTile, subjectOfImage } from './depthTrackDraw';
import { depthDetail, visibleWindow } from '../reelsmith/depthView';

// mattes of recent source frames, so echo trails segment each frame once while the playhead moves on
const historyMasks = new LruCache<PersonMaskFrame>(24);
// Reelsmith RS-1238: what depth effects read when the photo has no depth map (yet): flat, so the move is a plain push
let flatDepthCanvas: HTMLCanvasElement | null = null;
function flatDepth(): HTMLCanvasElement {
  if (!flatDepthCanvas) {
    flatDepthCanvas = document.createElement('canvas');
    flatDepthCanvas.width = 2;
    flatDepthCanvas.height = 2;
    const ctx = flatDepthCanvas.getContext('2d');
    if (ctx) { ctx.fillStyle = 'rgb(128,128,128)'; ctx.fillRect(0, 0, 2, 2); }
  }
  return flatDepthCanvas;
}

// Reelsmith RS-1261: no sky (black) until the sky map is loaded, or when the clip has none
let noSkyCanvas: HTMLCanvasElement | null = null;
function noSky(): HTMLCanvasElement {
  if (!noSkyCanvas) {
    noSkyCanvas = document.createElement('canvas');
    noSkyCanvas.width = 2;
    noSkyCanvas.height = 2;
    const ctx = noSkyCanvas.getContext('2d');
    if (ctx) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 2, 2); }
  }
  return noSkyCanvas;
}

const loadImage = (src: string, what: string): Promise<HTMLImageElement | null> => new Promise((resolve) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => { console.warn(`[clip-fx] ${what} failed to load:`, src); resolve(null); };
  image.src = src;
});

// One video/image clip rendered through a builtin:fx-* single-input WebGL pass.
// Mounts a hidden, frame-synced media
// element (Remotion keeps it accurate in preview AND headless render),
// rasterizes it to a 2D staging canvas with the clip's contain/cover layout,
// then runs the effect's fragment shader to the visible canvas (with alpha, so
// luma-key etc. composite over lower tracks). Registered effects are flattened
// into one ordered pass graph, preserving the clip's effects[] order.

interface ClipFxProps {
  item: TimelineItem;
  fit: AspectFit;
  width: number;
  height: number;
  frameOffset?: number;
  onPreviewStatus?: SelectedPreviewStatusListener;
}

// contain/cover placement matching MediaFill's objectFit, so GL frames align
// with the rest of the composition.
function drawFit(ctx: CanvasRenderingContext2D, source: CanvasImageSource, fit: AspectFit, position: CropPosition): void {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  const dimensions = source as CanvasImageSource & {
    videoWidth?: number;
    videoHeight?: number;
    naturalWidth?: number;
    naturalHeight?: number;
    displayWidth?: number;
    displayHeight?: number;
    width?: number;
    height?: number;
  };
  const nw = dimensions.videoWidth
    ?? dimensions.naturalWidth
    ?? dimensions.displayWidth
    ?? dimensions.width
    ?? 0;
  const nh = dimensions.videoHeight
    ?? dimensions.naturalHeight
    ?? dimensions.displayHeight
    ?? dimensions.height
    ?? 0;
  ctx.clearRect(0, 0, W, H);
  if (!nw || !nh) return;
  const scale = fit === 'cover' ? Math.max(W / nw, H / nh) : Math.min(W / nw, H / nh);
  const dw = nw * scale;
  const dh = nh * scale;
  ctx.drawImage(source, (W - dw) * position.x, (H - dh) * position.y, dw, dh);
}

export function ClipFx({ item, fit, width: boxWidth, height: boxHeight, frameOffset = 0, onPreviewStatus }: ClipFxProps) {
  const frame = useCurrentFrame() + frameOffset;
  const { fps, width: canvasWidth, height: canvasHeight } = useVideoConfig();
  // Reelsmith RS-1238: a depth move draws at the clip's scaled-up size (a photo filled into 9:16 is scaled up to 2.4x
  // after this box) and knows which part of the picture is on screen
  const depthClip = useMemo(() => glEffects(item).some(({ def }) => def.needsDepth), [item]);
  const detail = depthClip ? depthDetail(item, boxWidth, boxHeight) : 1;
  const width = Math.max(1, Math.round(boxWidth * detail));
  const height = Math.max(1, Math.round(boxHeight * detail));
  const view = depthClip ? visibleWindow(item, boxWidth, boxHeight, canvasWidth, canvasHeight) : null;
  const isRendering = getRemotionEnvironment().isRendering;
  // Same decoder as the plain layers (RuntimeVideo): a Windows export must not
  // reach the WebCodecs decode through an effect clip either (#162), and one
  // decoder per export keeps effect inputs in lockstep with their neighbours.
  const videoDecoder = useRuntimeVideoDecoder();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sourceLayerRef = useRef<HTMLDivElement | null>(null);
  const runtimeRef = useRef<GlRuntime | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const failedAdapterRef = useRef<{ definitionKey: string; reason: SelectedPreviewFallbackReason } | null>(null);
  const stagedRenderKeyRef = useRef<string | null>(null);
  const hasRenderedRef = useRef(false);
  const [hasRendered, setHasRendered] = useState(false);
  const trimBefore = sourceFrameAt(item, frameOffset);

  const staging = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    return c;
  }, [width, height]);

  const active = useMemo(() => glEffects(item), [item]);
  // Reelsmith: effects that need the person matte load the segmenter once; undefined = still loading, null = unavailable
  const wantsMask = useMemo(() => active.some(({ def, fx }) => def.needsMask || isPersonRegion(fx.mix?.region)), [active]);
  // the effects' "Find people" slider: 0 = one person, sharp edges (default); 1 = groups and people far away, rougher edges
  const maskModel: PersonModel = active.some(({ def, fx }) => def.needsMask && Number(fx.overrides?.detect) >= 0.5) ? 'deeplab' : 'selfie';
  const [maskProvider, setMaskProvider] = useState<PersonMaskProvider | null | undefined>(undefined);
  useEffect(() => {
    if (!wantsMask) return;
    let alive = true;
    setMaskProvider(undefined);
    void loadPersonMask(maskModel).then((provider) => { if (alive) setMaskProvider(provider); });
    return () => { alive = false; };
  }, [wantsMask, maskModel]);
  // Reelsmith RS-1238: depth effects read the clip's depth map; the preview asks for one the clip does not carry yet,
  // an export always carries it (withDepthMaps). undefined = still loading, null = none (flat depth)
  const wantsDepth = useMemo(() => active.some(({ def }) => def.needsDepth), [active]);
  // RS-1260: on a video, lens blur, haze and relight read a depth map per frame (the depth track); photo parallax and a
  // photo read the still map
  const wantsTrack = useMemo(() => item.kind === 'video' && active.some(({ def }) => def.needsDepth && def.depthTrack), [active, item.kind]);
  const wantsStill = useMemo(() => active.some(({ def }) => def.needsDepth && !(def.depthTrack && item.kind === 'video')), [active, item.kind]);
  const subjectWanted = useMemo(() => active.some(({ def }) => def.depthTrack), [active]);
  // RS-1261: the sky map is saved beside the depth map, so a sky effect (or one kept to the land or the sky) asks for that
  const wantsSkyMap = useMemo(() => active.some(({ def, fx }) => def.needsSky || isSkyRegion(fx.mix?.region)), [active]);
  // on a video the sky of every frame comes with the depth track; a still map the clip carries (built before) is the
  // fallback for a track made without one
  const carriedDepth = depthSrcOf(item);
  const skyFromTrack = wantsSkyMap && item.kind === 'video';
  const stillSky = wantsSkyMap && (!skyFromTrack || !!carriedDepth);
  const wantsMaps = wantsStill || stillSky;
  const depthReq = wantsMaps ? depthRequestFor(item, fps) : null;
  const depthKey = wantsMaps ? `${wantsStill ? 'd' : ''}${stillSky ? 's' : ''}|${carriedDepth ?? (depthReq && !isRendering ? `ask|${depthReq.src}|${depthReq.atSec ?? ''}` : '')}` : '';
  const [depthImage, setDepthImage] = useState<{ key: string; image: HTMLImageElement | null; sky: HTMLImageElement | null; skyModel: SkyModel | null; subject: number } | undefined>(undefined);
  useEffect(() => {
    if (!depthKey || depthKey.endsWith('|')) return; // nothing carried, and a render may not ask
    let alive = true;
    let handle = isRendering ? delayRender(`clip-fx depth ${depthKey}`) : null;
    const release = () => { if (handle != null) { continueRender(handle); handle = null; } };
    void (async () => {
      const src = carriedDepth ?? (depthReq ? await requestDepthMap(depthReq) : null);
      const loadModel = async (url: string) => { try { const r = await fetch(url); return r.ok ? parseSkyModel(await r.json()) : null; } catch { return null; } };
      const [image, sky, skyModel] = src
        ? await Promise.all([wantsStill ? loadImage(src, 'depth map (the move stays flat)') : null, stillSky ? loadImage(skySrcFor(src), 'sky map (no sky)') : null, stillSky ? loadModel(skyModelSrcFor(src)) : null])
        : [null, null, null];
      if (alive) setDepthImage({ key: depthKey, image, sky, skyModel, subject: image && subjectWanted ? subjectOfImage(image) : 0.7 });
      release();
    })();
    return () => { alive = false; release(); };
    // depthKey names everything this loads (the carried map, or the photo and moment to ask about, and whether it may ask)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depthKey]);
  const depthReady = !wantsMaps || depthKey.endsWith('|') || depthImage?.key === depthKey;
  // RS-1260: the depth track (atlas and index) of the span this clip shows; like the still map, a render only reads one
  // the clip carries
  const loadsTrack = wantsTrack || skyFromTrack;
  const trackReq = loadsTrack ? depthTrackRequestFor(item, fps) : null;
  const carriedTrack = depthTrackSrcOf(item);
  const trackKey = loadsTrack ? `t${skyFromTrack ? 's' : ''}|${carriedTrack ?? (trackReq && !isRendering ? `ask|${trackReq.src}|${trackReq.fromSec}|${trackReq.toSec}` : '')}` : '';
  const [depthTrack, setDepthTrack] = useState<{ key: string; atlas: HTMLImageElement; meta: DepthTrackMeta; sky: HTMLImageElement | null } | { key: string; atlas: null; meta: null; sky: null } | undefined>(undefined);
  useEffect(() => {
    if (!trackKey || trackKey.endsWith('|')) return;
    let alive = true;
    let handle = isRendering ? delayRender(`clip-fx depth track ${trackKey}`) : null;
    const release = () => { if (handle != null) { continueRender(handle); handle = null; } };
    void (async () => {
      const src = carriedTrack ?? (trackReq ? await requestDepthTrack(trackReq) : null);
      const meta = src ? await (async () => { try { const r = await fetch(depthTrackMetaName(src)); return r.ok ? parseDepthTrackMeta(await r.json()) : null; } catch { return null; } })() : null;
      const [atlas, sky] = src && meta
        ? await Promise.all([loadImage(src, 'depth track (lens blur, haze and relight stay off)'), skyFromTrack && meta.sky ? loadImage(depthTrackSkyName(src), 'sky of each frame (no sky)') : null])
        : [null, null];
      if (alive) setDepthTrack(atlas && meta ? { key: trackKey, atlas, meta, sky } : { key: trackKey, atlas: null, meta: null, sky: null });
      release();
    })();
    return () => { alive = false; release(); };
    // trackKey names what this loads
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackKey]);
  const trackReady = !loadsTrack || trackKey.endsWith('|') || depthTrack?.key === trackKey;
  const depthStaging = useMemo(() => {
    if (!wantsDepth) return null;
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    return c;
  }, [wantsDepth, width, height]);
  const skyStaging = useMemo(() => {
    if (!wantsSkyMap) return null;
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    return c;
  }, [wantsSkyMap, width, height]);
  const cropPosition = cropPositionFromProps(item.props);
  // effects that look at earlier frames (echo trails): how many afterimages, and how many frames apart
  const historyFx = active.find(({ def }) => def.history);
  const historyDef = historyFx?.def.history;
  const tapCount = historyFx && historyDef
    ? Math.round(Number(fxUniform(historyFx.def.props.find((p) => p.key === historyDef.countKey)!, historyFx.fx.overrides)))
    : 0;
  const tapLag = historyFx && historyDef
    ? Math.max(1, Math.round(Number(fxUniform(historyFx.def.props.find((p) => p.key === historyDef.stepKey)!, historyFx.fx.overrides)) * fps))
    : 1;
  const tapStaging = useMemo(() => Array.from({ length: tapCount }, () => {
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    return c;
  }), [tapCount, width, height]);
  const tapKeysRef = useRef<Array<string | null>>([]);
  const stageTap = useCallback((index: number, source: CanvasImageSource, renderKey: string) => {
    const canvas = tapStaging[index];
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    drawFit(ctx, source, fit, cropPosition);
    tapKeysRef.current[index] = renderKey;
  }, [tapStaging, fit, cropPosition.x, cropPosition.y]);
  const definitionKey = useMemo(
    () => active.map(({ def }) => `${def.id}:${def.frag}`).join('\u0000'),
    [active],
  );
  const renderKey = useMemo(
    () => JSON.stringify([frame, fit, width, height, cropPosition.x, cropPosition.y, active.map(({ fx }) => [fx.id, fx.overrides, fx.mix])]),
    [frame, fit, width, height, cropPosition.x, cropPosition.y, active],
  );
  const onVideoFrame = useCallback(
    (source: CanvasImageSource) => {
      const ctx = staging.getContext('2d');
      if (!ctx) return;
      drawFit(ctx, source, fit, cropPosition);
      stagedRenderKeyRef.current = renderKey;
    },
    [fit, cropPosition.x, cropPosition.y, renderKey, staging],
  );
  // <OffthreadVideo> reloads its image element whenever onVideoFrame changes
  // identity, just as it revokes that frame's blob URL for the next frame —
  // one failed-load warning per rendered frame. A stable callback stages under
  // the latest key instead: a server render mounts the next frame's image only
  // after this frame's key is committed.
  const offthreadTargetRef = useRef({ fit, cropPosition, renderKey });
  useLayoutEffect(() => {
    offthreadTargetRef.current = { fit, cropPosition, renderKey };
  }, [fit, cropPosition.x, cropPosition.y, renderKey]);
  const onOffthreadVideoFrame = useCallback(
    (source: CanvasImageSource) => {
      const ctx = staging.getContext('2d');
      if (!ctx) return;
      const target = offthreadTargetRef.current;
      drawFit(ctx, source, target.fit, target.cropPosition);
      stagedRenderKeyRef.current = target.renderKey;
    },
    [staging],
  );

  useEffect(() => {
    if (!onPreviewStatus) return;
    const targetId = item.id;
    return () => {
      onPreviewStatus({
        kind: 'effect',
        targetId,
        adapter: 'gl-effect',
        phase: 'inactive',
      });
    };
  }, [item.id, onPreviewStatus]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || active.length === 0) return;
    const handle = isRendering ? delayRender(`clip-fx ${active.map(({ def }) => def.id).join(',')}`) : null;
    let done = false;
    let raf = 0;
    const report = (phase: 'waiting' | 'ready' | 'fallback', fallbackReason?: SelectedPreviewFallbackReason) => {
      onPreviewStatus?.({
        kind: 'effect',
        targetId: item.id,
        adapter: 'gl-effect',
        phase,
        fallbackReason,
      });
    };
    const finish = () => {
      if (!done && handle != null) {
        done = true;
        continueRender(handle);
      }
    };
    const priorFailure = failedAdapterRef.current?.definitionKey === definitionKey
      ? failedAdapterRef.current.reason
      : null;
    if (priorFailure) {
      report('fallback', priorFailure);
      finish();
      return () => finish();
    }
    let waitingReported = false;
    const reportWaiting = () => {
      if (waitingReported) return;
      waitingReported = true;
      report('fallback', 'media-loading');
    };
    // .cube LUT is loaded first; tick waits until loading has settled. A failed
    // LUT is an intentional pass-through with intensity=0 in fxPasses().
    for (const { def } of active) if (def.cube) void ensureCube(def.cube);
    const tick = () => {
      const decodedVideo = item.kind !== 'image';
      const mediaReady = decodedVideo
        ? stagedRenderKeyRef.current === renderKey
        : !!imageRef.current?.complete;
      if (!mediaReady) { reportWaiting(); raf = requestAnimationFrame(tick); return; }
      if (active.some(({ def }) => def.cube && !cubeSettled(def.cube))) { reportWaiting(); raf = requestAnimationFrame(tick); return; }
      if (wantsMask && maskProvider === undefined) { reportWaiting(); raf = requestAnimationFrame(tick); return; }
      if (!depthReady || !trackReady) { reportWaiting(); raf = requestAnimationFrame(tick); return; }
      if (decodedVideo && tapStaging.some((_, i) => tapKeysRef.current[i] !== renderKey)) { reportWaiting(); raf = requestAnimationFrame(tick); return; }
      try {
        const runtime = ensureRuntimeSlot(runtimeRef, () => createGlRuntime(canvas));
        const ctx = staging.getContext('2d');
        if (!ctx) throw new Error('2d context unavailable');
        if (!decodedVideo && imageRef.current) drawFit(ctx, imageRef.current, fit, cropPosition);
        // a matte per source frame; with echo trails it is remembered so each frame is segmented once, not once per afterimage
        const matteAt = (canvas: HTMLCanvasElement, sourceFrame: number): PersonMaskFrame => {
          if (!maskProvider) return fullFrameMask();
          if (!historyDef) return maskProvider.frameFor(canvas);
          const key = [item.src, Math.round(sourceFrame), maskModel, width, height, fit, cropPosition.x, cropPosition.y].join('|');
          const cached = historyMasks.get(key);
          if (cached) return cached;
          const fresh = cloneMaskFrame(maskProvider.frameFor(canvas));
          historyMasks.set(key, fresh);
          return fresh;
        };
        const maskFrame = wantsMask ? matteAt(staging, sourceFrameAt(item, frame)) : null;
        const textCell = active.some(({ def }) => def.needsText)
          ? (({ def, fx }) => textCellFor(typeof item.props?.rsFxText === 'string' && item.props.rsFxText ? item.props.rsFxText : Number(fx.overrides?.word ?? def.props.find((p) => p.key === 'word')?.default ?? 0), def.textKind))(active.find(({ def }) => def.needsText)!)
          : null;
        const extras: Record<string, TexImageSource> = {};
        if (maskFrame) extras.u_mask = maskFrame.mask;
        if (textCell) extras.u_text = textCell.canvas;
        let subject = 0.7;
        if (wantsDepth) {
          // the depth map placed exactly like the picture (same fit and crop), so each pixel reads its own depth
          const depthCtx = depthStaging?.getContext('2d');
          const image = depthKey && depthImage?.key === depthKey ? depthImage.image : null;
          const track = wantsTrack && depthTrack?.key === trackKey && depthTrack.atlas ? depthTrack : null;
          if (track && depthStaging && depthCtx) {
            // RS-1260: this frame's depth, between the two tiles either side of it
            const sourceSec = sourceFrameAt(item, frame) / fps;
            const { a, b, t } = tilesAt(track.meta, sourceSec);
            drawFitTile(depthCtx, track.atlas, tileRect(track.meta, a), fit, cropPosition, 1);
            if (t > 0.002) drawFitTile(depthCtx, track.atlas, tileRect(track.meta, b), fit, cropPosition, t);
            extras.u_depth = depthStaging;
            subject = subjectAt(track.meta, sourceSec);
          } else if (image && depthStaging && depthCtx && wantsStill) {
            drawFit(depthCtx, image, fit, cropPosition);
            extras.u_depth = depthStaging;
            subject = depthImage?.subject ?? 0.7;
          } else extras.u_depth = flatDepth();
        }
        let skyModel: SkyModel | null = null;
        if (wantsSkyMap) {
          const skyCtx = skyStaging?.getContext('2d');
          const skyTrack = skyFromTrack && depthTrack?.key === trackKey && depthTrack.sky && depthTrack.meta?.sky ? depthTrack : null;
          const sky = depthKey && depthImage?.key === depthKey ? depthImage.sky : null;
          if (skyTrack && skyStaging && skyCtx) {
            // RS-1261: this frame's sky, between the sky of the two tiles either side of it, and its colour between theirs
            const { a, b, t } = tilesAt(skyTrack.meta, sourceFrameAt(item, frame) / fps);
            drawFitTile(skyCtx, skyTrack.sky!, tileRect(skyTrack.meta, a), fit, cropPosition, 1);
            if (t > 0.002) drawFitTile(skyCtx, skyTrack.sky!, tileRect(skyTrack.meta, b), fit, cropPosition, t);
            extras.u_sky = skyStaging;
            skyModel = skyModelBetween(skyTrack.meta.sky![a], skyTrack.meta.sky![b], t);
          } else if (sky && skyStaging && skyCtx) {
            drawFit(skyCtx, sky, fit, cropPosition);
            extras.u_sky = skyStaging;
            skyModel = depthImage?.skyModel ?? null;
          } else extras.u_sky = noSky();
        }
        const hasSky = extras.u_sky && extras.u_sky !== noSky() ? 1 : 0;
        const skyU = skyModelUniforms(hasSky ? skyModel : null);
        tapStaging.forEach((canvas, i) => {
          extras[`u_hist${i}`] = canvas;
          extras[`u_histMask${i}`] = matteAt(canvas, sourceFrameAt(item, frameOffset + Math.max(0, frame - frameOffset - (i + 1) * tapLag))).mask;
        });
        const local = frame / fps; // seconds into the clip, for the effect envelopes
        const shaderFrame = buildEffectShaderFrame(
          active.map(({ fx, def }) => {
            const env = envelopeFrame(def.id, def.props, fx.overrides, mixUniformsAt(fx.mix, local, item.durationInFrames / fps));
            return {
            def,
            overrides: env.overrides,
            ...(env.mix ? { mix: { ...env.mix, hasMask: maskFrame && maskProvider ? 1 : 0, hasSky, sky: skyU } } : {}),
            ...((def.needsMask && maskFrame) || (def.needsText && textCell) || def.needsDepth || def.needsSky
              ? { extraUniforms: {
                ...(def.needsMask && maskFrame ? subjectUniforms(maskFrame.subject) : {}),
                ...(def.needsText && textCell ? { u_textAspect: textCell.aspect } : {}),
                ...(def.needsSky ? { u_hasSky: hasSky, ...skyU } : {}),
                ...(def.needsDepth ? { u_progress: Math.min(1, Math.max(0, frame / Math.max(1, item.durationInFrames - 1))), u_hasDepth: extras.u_depth === flatDepth() ? 0 : 1, u_view: view ?? [0, 0, 1, 1], ...(def.depthTrack ? { u_subject: subject } : {}) } : {}),
              } }
              : {}),
            };
          }),
          frame,
          fps,
        );
        runtime.renderFxChain(shaderFrame.passes, staging, Object.keys(extras).length ? extras : undefined);
        // Make the freshly drawn canvas authoritative before unblocking export;
        // React state then preserves the same choice for subsequent renders.
        canvas.style.opacity = '1';
        if (sourceLayerRef.current) sourceLayerRef.current.style.opacity = '0';
        if (!isRendering && !hasRenderedRef.current) {
          hasRenderedRef.current = true;
          setHasRendered(true);
        }
        report('ready');
      } catch (error) {
        const reason = glPreviewFailureReason(error);
        failedAdapterRef.current = { definitionKey, reason };
        disposeRuntimeSlot(runtimeRef);
        report('fallback', reason);
        console.error('[clip-fx]', error);
      }
      finish();
    };
    tick();
    return () => { cancelAnimationFrame(raf); finish(); };
  }, [active, definitionKey, fit, cropPosition.x, cropPosition.y, staging, item.id, item.kind, frame, fps, isRendering, renderKey, onPreviewStatus, wantsMask, maskProvider, maskModel, tapStaging, tapLag, historyDef, frameOffset, width, height, wantsDepth, wantsSkyMap, depthReady, depthKey, depthImage, depthStaging, skyStaging, item.durationInFrames, view?.join(','), wantsTrack, skyFromTrack, wantsStill, trackReady, trackKey, depthTrack]);

  useEffect(() => () => {
    disposeRuntimeSlot(runtimeRef);
  }, [width, height, definitionKey]);

  // Once any GL frame has been drawn, keep the canvas visible across seeks:
  // falling back to the raw source layer would flash the UNFILTERED frame for
  // the 1-2 frames until the new frame's shader pass is ready. The first
  // (never-drawn) load still falls back to the honest source while media loads.
  const showingShaderFrame = hasRendered;
  if (active.length === 0) return null;
  return (
    <AbsoluteFill>
      {/* The source is the honest Player fallback while media/GL is unavailable.
          Once this exact frame+parameter key is drawn, only the GL canvas shows. */}
      <AbsoluteFill ref={sourceLayerRef} style={{ opacity: showingShaderFrame ? 0 : 1, pointerEvents: 'none' }}>
        {item.kind === 'image'
          // impeccable-disable-next-line broken-image -- Remotion Img component, src comes from item runtime injection
          ? <Img ref={imageRef} src={item.src!} style={{ width: '100%', height: '100%', objectFit: fit }} />
          : videoDecoder === 'offthread'
            ? <OffthreadVideo src={item.src!} trimBefore={offthreadTrimBefore(trimBefore, fps)} playbackRate={item.playbackRate ?? 1} muted
                transparent={offthreadVideoTransparent(item.src!)} onVideoFrame={onOffthreadVideoFrame}
                style={{ width: '100%', height: '100%', objectFit: fit }} />
            : <MediaVideo src={item.src!} trimBefore={trimBefore} playbackRate={item.playbackRate ?? 1} muted
                headless={isRendering} onVideoFrame={onVideoFrame} style={{ width: '100%', height: '100%' }} objectFit={fit} />}
      </AbsoluteFill>
      {item.kind !== 'image' && tapStaging.map((_, i) => (
        <HistoryTap key={i} item={item} src={item.src!} fps={fps} fit={fit} offthread={videoDecoder === 'offthread'} isRendering={isRendering}
          trimBefore={trimBefore} delay={(i + 1) * tapLag} onFrame={(source, key) => stageTap(i, source, key)} renderKey={renderKey} />
      ))}
      <canvas ref={canvasRef} width={width} height={height} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: showingShaderFrame ? 1 : 0 }} />
    </AbsoluteFill>
  );
}
