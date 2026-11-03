// Verify discovery: every tracked *.verify.* file is a test. Nothing is registered by hand.
//
// A new file runs under tsx (`node --import tsx <file>`; `node <file>` for .mjs/.cjs/.js). A suite that needs a different
// launcher is listed in LAUNCHERS below — that is the only per-file bookkeeping, and forgetting it
// shows up as a failing run, not as a test that quietly never ran.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const VERIFY_FILE = /\.verify\.(?:tsx|mts|cjs|mjs|ts|js)$/;

/** Non-test segments of the gate that are still run with it. */
export const EXTRA_COMMANDS = [
  'node scripts/check-i18n.mjs',
  'node --import tsx server/reelsmith/avsync.mts',
  // Reelsmith: a tool schema edit without `npm run generate:server-tool-catalog` fails here, not in the app.
  'node --import tsx server/agent-runs/generate-tool-catalog.mts --check',
];

/**
 * Reelsmith: suites `npm run test:fast` leaves out: renders, exports, CLI and server end-to-end runs, each 5 s or
 * more in a full 8-parallel run (M-series Mac, 2026-11-02). Together they were ~450 of the suite's ~720 CPU-seconds.
 * `npm test` and `verify:affected` still run them. Entries are verify files or the file an EXTRA_COMMANDS entry runs.
 */
export const SLOW_VERIFIES = [
  'server/agent-runs/routes.verify.ts',
  'server/reelsmith/exportFixtures.verify.ts',
  'cli/cli.verify.ts',
  'server/reelsmith/instagramFinalize.verify.ts',
  'server/external-agent/broker.verify.ts',
  'server/external-agent/mcp.verify.ts',
  'server/reelsmith/avsync.mts',
  'src/gl/clipFxExport.offthread.verify.mjs',
  'src/gl/clipFxExport.verify.mjs',
  'remotion/video-decoder-render.verify.mjs',
  'server/plugins/hf-proxy.verify.ts',
  'server/reelsmith/reverseRender.verify.ts',
  'server/reelsmith/sharedGroupLayer.verify.ts',
  'server/reelsmith/exportValidate.verify.ts',
  'server/reelsmith/orphanGuard.verify.ts',
  'server/reelsmith/parityCheck.verify.ts',
  'server/reelsmith/repeatedFrames.verify.ts',
  'server/reelsmith/captionBehindRender.verify.ts',
];
export const isSlowSegment = (segment) => SLOW_VERIFIES.some((slow) => segment === slow || segment.endsWith(` ${slow}`));

/** launcher prefix -> suites that cannot run under the default one (tsconfig paths, Vite `?raw` imports, ESM loader). */
export const LAUNCHERS = {
  "tsx --tsconfig tsconfig.app.json": [
    "src/app/EditorGuards.verify.tsx",
    "src/audio/intelligence/nativeBeatThisWorkerAdapter.verify.ts",
    "src/audio/intelligence/nativeClapWorkerAdapter.verify.ts",
    "src/captions/captionCueContextMenu.verify.ts",
    "src/captions/captionGroupMove.verify.ts",
    "src/captions/captionSelection.verify.ts",
    "src/captions/captionSelectionInteraction.verify.ts",
    "src/captions/captionTimelineClipboard.verify.ts",
    "src/components/SafeZoneOverlay.verify.tsx",
    "src/components/chat/chatPopoverGeometry.verify.ts",
    "src/components/chat/chatScrollNavigation.verify.ts",
    "src/components/chat/chatTextSelection.verify.ts",
    "src/components/chat/editorDragReference.verify.ts",
    "src/components/chat/message-groups.verify.ts",
    "src/components/chat/template-reference-localization.verify.ts",
    "src/components/chat/workflow-starters.verify.tsx",
    "src/components/inspector/background-fill-control.verify.tsx",
    "src/components/inspector/inspectorPropSchemaLayout.verify.ts",
    "src/components/inspector/inspectorTextArea.verify.ts",
    "src/components/preview/preview-transform-overlay.verify.tsx",
    "src/components/preview/previewTextEdit.verify.ts",
    "src/components/preview/previewTransform.verify.ts",
    "src/components/preview/timeline-hover-preview.verify.ts",
    "src/components/previewAudioPool.verify.ts",
    "src/components/settings/design-style-localization.verify.ts",
    "src/components/settings/local-asr-settings-route.verify.ts",
    "src/components/settings/settings-version.verify.tsx",
    "src/components/timeline/TimelineFrameRateControl.verify.tsx",
    "src/components/timeline/clipContextSelection.verify.ts",
    "src/components/timeline/timeline-clip-duration.verify.ts",
    "src/components/timeline/timelineChatDrop.verify.ts",
    "src/components/timeline/timelineFitRange.verify.ts",
    "src/components/timeline/timelineMixedSelectionIntegration.verify.ts",
    "src/components/timeline/timelineSeek.verify.ts",
    "src/components/timeline/timelineWindow.verify.ts",
    "src/components/timeline/track-mute-visual.verify.ts",
    "src/components/timeline/trackContextOperations.verify.ts",
    "src/components/timeline/trackDelete.verify.ts",
    "src/components/timeline/trackOverlap.verify.ts",
    "src/components/timeline/useTimelinePointer.verify.ts",
    "src/components/window-titlebar.verify.tsx",
    "src/editor/TimelineGraphicLayers.verify.ts",
    "src/editor/editorDrag.verify.ts",
    "src/editor/mediaAssetPlacement.verify.ts",
    "src/editor/serverVideoDecoder.verify.ts",
    "src/fonts/notoSansOffline.verify.ts",
    "src/fonts/systemFonts.verify.ts",
    "src/media/add-solid-canvas-card.verify.tsx",
    "src/media/externalFileDrop.verify.ts",
    "src/media/semantic-search/nativeSemanticDuplicateFallback.verify.ts",
    "src/media/semantic-search/nativeSemanticWorkerAdapter.verify.ts",
    "src/reelsmith/textStyle.verify.tsx",
    "src/transcript/desktop-native-asr.verify.ts",
    "src/ui/upstream-update-notice.verify.tsx",
  ],
  "tsx --tsconfig tsconfig.node.json": [
    "desktop/native-asr-pcm.verify.ts",
    "desktop/native-asr-service.verify.ts",
    "desktop/native-asr-worker-lifecycle.verify.ts",
    "desktop/native-asr-worker.verify.ts",
    "desktop/native-hardware-profile.verify.ts",
    "desktop/native-inference-budget.verify.ts",
    "desktop/native-inference-residency.verify.ts",
    "shared/desktop-inference.verify.ts",
  ],
  "tsx": [
    "remotion/render-timeout.verify.mjs",
    "server/external-agent/external-skill.verify.mjs",
  ],
  "node scripts/run-check.mjs": [
    "src/agent/tools/effect-tools.verify.ts",
    "src/agent/tools/library-edit-item.verify.ts",
  ],
  "node --import tsx": [
    "server/plugins/fal-catalog-input.verify.ts",
    "server/plugins/fal-client.verify.ts",
    "server/plugins/fal-provider.verify.ts",
    "server/plugins/fal-routing.verify.ts",
  ],
};

const launcherByFile = new Map(Object.entries(LAUNCHERS).flatMap(([prefix, files]) => files.map((f) => [f, prefix])));

/**
 * `tsx [--tsconfig X]` runs as `node --import tsx` (tsconfig via TSX_TSCONFIG_PATH), as cli/occ.mjs does. Under the
 * tsx CLI, the Chrome Headless Shell that Remotion 4.0.537 ships for macOS loses its GPU process at launch ("icudtl.dat
 * not found in bundle") and every render or still dies with "Target closed"; under plain node it does not.
 */
export const viaNodeImport = (launcher) => launcher.replace(/^tsx(?: --tsconfig (\S+))?$/,
  (_, tsconfig) => `${tsconfig ? `TSX_TSCONFIG_PATH=${tsconfig} ` : ''}node --import tsx`);

export const verifyCommand = (file) => (
  `${viaNodeImport(launcherByFile.get(file) ?? (/\.(?:mjs|cjs|js)$/.test(file) ? 'node' : 'tsx'))} ${file}`
);

/** Tracked plus untracked-but-not-ignored verify files, so a brand-new file runs before it is committed. */
export function discoverVerifies(cwd = fileURLToPath(new URL('..', import.meta.url))) {
  const out = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard', '-z'], { cwd, encoding: 'utf8' });
  return [...new Set(out.split('\0').filter((f) => VERIFY_FILE.test(f) && existsSync(new URL(f, `file://${cwd}/`))))].sort();
}
