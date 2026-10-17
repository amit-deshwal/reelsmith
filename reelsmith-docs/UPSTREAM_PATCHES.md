# Upstream files modified by Reelsmith

Every OpenChatCut file we change goes in this table, so `git merge upstream/main` conflicts are expected and quick to resolve.

| File | Change | Why | Since |
|---|---|---|---|
| `README.md` | Renamed to `UPSTREAM_README.md`; new Reelsmith README added | Project backlog lives in README | 2026-10-15 |
| `.gitignore` | Appended `!CLAUDE.md` exception at end of file | Upstream ignores CLAUDE.md; this fork tracks its agent guide. Reelsmith docs live in `reelsmith-docs/` because upstream ignores `docs/` | 2026-10-15 |
| `desktop/main.ts` | Update service forced `enabled: false`; window title `Reelsmith` | RS-001, RS-002 | 2026-10-15 |
| `src/ui/upstreamUpdate.ts` | Added `UPDATE_CHECKS_ENABLED = false`; `requestUpstreamUpdateCheck` returns early (stops the GitHub API fallback) | RS-001 | 2026-10-15 |
| `config/electron-builder.config.mjs` | `appId` `dev.reelsmith.app`, `productName` `Reelsmith`, linux `executableName` `reelsmith`. The `publish` block is left pointing at upstream but is unused while updates are off | RS-002 | 2026-10-15 |
| `package.json` | `desktopName` → `reelsmith.desktop` | RS-002 | 2026-10-15 |
| `.github/workflows/desktop.yml`, `desktop/update-packaging.verify.ts` | Artifact and app bundle names `OpenChatCut*` → `Reelsmith*` to match the new productName | RS-002 | 2026-10-15 |
| `src/i18n/locale.ts` | Default locale is English instead of the OS language; a saved choice still wins | RS-006 | 2026-10-16 |
| `src/i18n/dict/en/index.ts` | Import and merge our `reelsmith.ts` EN dictionary (one import, one merge entry) | RS-006 | 2026-10-16 |
| `src/persist/projectStore.ts`, `src/persist/migrations/normalize.ts`, `server/external-agent/projects.ts` | Default sequence name `序列 1` → `Sequence 1` | RS-006 | 2026-10-16 |
| `src/components/timeline/TimelineTabs.tsx`, `src/editor/useEditorController.tsx` | Names of the vertical-duplicate timeline (`竖屏` → `Vertical`) and the recorded voiceover (`旁白` → `Voiceover`) | RS-006 | 2026-10-16 |
| `index.html`, `src/components/icons.tsx`, `config/electron-builder.config.mjs` | Page `<title>` → Reelsmith; app icon switched to our own `reelsmith-icon` (SVG source `assets/branding/reelsmith-icon.svg`; generated `public/reelsmith-icon.png` and `assets/branding/reelsmith-icon.icns`); upstream `openchatcut-icon.*` files deleted | RS-002 | 2026-10-16 |
| `server/claude-code/turn-runner.ts` | Passes `--effort` from `resolveClaudeEffort()` (`server/reelsmith/claudeEffort.ts`, env `REELSMITH_CLAUDE_EFFORT`, default `medium`, `default` = CLI default) | Agent speed: ~87% of a measured reel edit's output tokens were hidden reasoning | 2026-10-17 |
| `server/plugins/export-rendering.ts` | `h264RenderOptions(codec, {preferSpeed})` forces software x264 for exports (env `REELSMITH_EXPORT_ENCODER=hardware` opts out); our preview/baseline callers pass `preferSpeed` | Export quality: x264 beats VideoToolbox at equal bitrate (SSIM .951 vs .945 at 15 Mbps) and costs seconds on a reel | 2026-10-17 |
| `src/export/bitrate.ts`, `server/plugins/export-params.verify.ts` | "High" bitrate multiplier 1.5 → 2.5 (15 → 25 Mbps at 1080p30) | Export quality: SSIM .945 → .969 on detailed phone footage | 2026-10-17 |
| `src/transcript/provider.ts`, `src/transcript/local-asr.ts`, `src/transcript/assemblyai.ts`, `src/transcript/generic-cloud-asr.ts`, `src/components/settings/SettingsDialog.tsx` | Fallback transcription language `'zh'` → `DEFAULT_TRANSCRIPTION_LANGUAGE` (`'en'`, `src/reelsmith/transcriptionLanguage.ts`) | RS-501: Chinese default garbled English/Hindi speech | 2026-10-17 |

## package.json (RS-003, RS-101)
Added script `test:reelsmith` (our verifies) and appended `&& npm run test:reelsmith` to `test:serial`. Add each new Reelsmith `*.verify.ts` to `test:reelsmith`, not to the upstream chain.

## Wordmark and project names (RS-002, RS-006)
- `src/components/icons.tsx`: `OpenChatCutWordmark` now draws "REEL smith" (aria-label Reelsmith). Function name kept to avoid touching its callers.
- `src/persist/projectStore.ts`: `randomProjectName` generates English "Adjective Noun" names instead of Chinese ones.

## Stop leaves the edit session locked (RS-005)
Symptom: after clicking Stop on a built-in Claude Code turn, the next turn said "another active editing session (owned by a different client, not orphaned) has this project locked".
Cause (from reading the code, then confirmed by the user's retest): Stop kills the `claude` child, which never sends the MCP `DELETE`, so the server kept the MCP session and its edit-session owner for up to an hour.
- `server/claude-code/turn-runner.ts`: each turn gets a run key sent as header `x-reelsmith-run`; when the child ends, `evictMcpSessionsForRun(runKey)` runs.
- `server/external-agent/mcp.ts`: `McpSession.runKey`, `runKeyOf(req)`, exported `evictMcpSessionsForRun`. Eviction reuses the normal transport-closed path, which already discards the orphaned edit session.

## Analysis routes (RS-105, RS-203)
`server/plugins/index.ts`: imports and mounts `reelsmithAnalyzePlugin()` (routes `/api/reelsmith/clip-features` and `/api/reelsmith/music-grid`, code in `server/reelsmith/`).

## Recipes tab (RS-102, RS-103)
- `src/library/LibraryPanel.tsx`: new main tab `Recipes` (second tab) rendering `src/reelsmith/ui/RecipesPanel.tsx`; new prop `onApplyRecipe`.
- `src/editor/useEditorController.tsx`: passes `onApplyRecipe` into `libraryPanel` (binds the recipe's lanes to real tracks with `bindTracks`, then `commands.batch`) and imports `bindTracks`.

## Own data folder (RS-002)
Reelsmith data lives in `~/.reelsmith` instead of `~/.openchatcut`, so it never shares projects, keys, skills or models with an installed OpenChatCut. Every `'.openchatcut'` path segment and `~/.openchatcut` mention was replaced with `.reelsmith` in: `server/{data-dir,runtime-profile,mcp-token,skills-files,keystore-names}.ts`, `server/copilot/client.ts`, `server/codex/app-server.ts`, `server/plugins/{skill-install,skill-files,extension-store}.ts`, `desktop/embedded-port.ts`, `shared/model-cache-path.ts`, `scripts/dev-profile.mjs`, `src/plugins/store.ts`, `src/persist/skillStore.ts`, `src/agent/tools/{skill-exec-tools,install-skill-tools,skill-tools,plugin-skill-tools}.ts`, `src/agent/tools/schemas/install-skill-tools.ts`, `src/agent/skills/skill-creator/SKILL.md`, `src/components/settings/settingsAgentProviders.ts`, `src/i18n/dict/{en,it}/settings.ts`, the matching `*.verify.ts` files, and the regenerated `assets/agent/openchatcut-tool-schemas.json`. On merge conflicts, re-run the same replacement.
- `desktop/bootstrap.ts`: `app.setName('Reelsmith')` before anything reads `userData` (dev builds were using `Application Support/openchatcut`); startup error title says Reelsmith.
- `desktop/main.ts`: startup error title says Reelsmith. `desktop/smoke-renderer-recovery.ts`: expects window title `Reelsmith`.
- Existing data: `npx tsx src/reelsmith/migrate-home.mts` copies `~/.openchatcut` into `~/.reelsmith` once (stop the app first).

## Reels agent tools and prompt (RS-106, RS-108, RS-403, RS-702)
- `src/agent/tools.ts`: imports `REELS_TOOL_SCHEMAS`/`REELS_TOOL_NAMES` from `src/reelsmith/agent/reelsToolSchemas.ts`, spreads them before ToolSearch, and adds one executor group (`src/reelsmith/agent/reelsToolsApp.ts`).
- `src/agent/external-tool-policy.ts`: `reels_lint`, `reels_run_info`, `reels_selection_candidates` are read tools; `reels_recut_section`, `reels_snap_cuts_to_beats`, `propose_selection` are draft edit tools (browser-side, not server-direct).
- `assets/agent/openchatcut-tool-schemas.json`: regenerated (`npm run generate:server-tool-catalog`).
- `src/agent/systemPrompt.ts`: `SYSTEM_PROMPT + REELS_SYSTEM_PROMPT` (from `src/reelsmith/agent/reelsPrompt.ts`); product name in the prompt is Reelsmith. `src/agent/systemPromptOrder.verify.ts` updated to match.
- `src/agent/skills/reels-editor/SKILL.md`: new bundled skill (picked up by the skills glob). `src/agent/skills/skill-loading.verify.ts` (count 31) and `plugin-skills.verify.ts` (slug list) updated.
- `src/editor/snap.ts`: new snap point type `beat`; beats of the music clip's stored grid (`props.rsBeats`) are snap targets while dragging/trimming.
- `src/components/timeline/TrackContextMenu.tsx`: optional `onSnapToBeats`; video tracks show "Snap cuts to every beat / every 2 beats / bars". `src/components/timeline/Timeline.tsx` wires it to `src/reelsmith/snapAction.ts`.
- `src/library/LibraryPanel.tsx`: optional `onAskAgent` prop, passes `projectId` and `onAskAgent` to `RecipesPanel`. `src/editor/useEditorController.tsx`: `onAskAgent` opens the chat and prefills it.

## Instagram export step and IG safe-zone overlay (RS-301, RS-302, RS-303)
- `src/export/serverExportOperation.ts`: after a server video render (normal and recovered paths) and before QA/delivery, calls `finalizeExportForInstagram` (`src/reelsmith/instagramExport.ts`). It is a no-op unless the "Make it Instagram-ready" toggle is on, the canvas is 9:16 and the codec is H.264. Browser (WebCodecs) exports are not post-processed.
- `src/export/ExportDialogMain.tsx`: renders `InstagramExportPanel` on the Video tab.
- `server/reelsmith/analyze-plugin.ts` (ours): route `/api/reelsmith/instagram-finalize`.
- `src/components/PreviewPanel.tsx`: an "IG zones" toggle next to the safe-frame toggle draws `InstagramSafeZoneOverlay` (remembered in localStorage).

## Beat grid on the music clip (RS-601)
- `src/components/timeline/ClipMediaLayers.tsx`: audio clips also render `BeatTicks` (bars purple, beats cyan) from `props.rsBeats`, even when no waveform is available.
- `src/components/inspector/InspectorContent.tsx`: a "Beat grid" section for a single selected audio clip (`BeatGridControls`: find the beat, ±20 ms phase, ½×/2×, downbeat at playhead, tap tempo, clear). Changes go through `onItemPropChange('rsBeats', …)`.

## Agent privacy notice and frames switch (RS-703)
- `src/agent/tools.ts`: `executeTool` now refuses `view_timeline_frames`/`view_asset_frames` when the project's frames switch is off and strips `__images` from every tool result (`src/reelsmith/framePrivacy.ts`); the old body is `executeToolUngated`.
- `src/components/chat/ChatPanelView.tsx`: renders `AgentPrivacyNotice` under the capability banner (first-use explanation, then a compact "Allow frames" checkbox).

## Usage-limit messages (RS-704)
- `server/claude-code/turn-runner.ts`: turn errors (result errors and CLI exits without a result) pass through `friendlyAgentError` (`shared/reelsmith/usageLimit.ts`), which rewrites plan/rate-limit errors into a plain message with the reset time and a reminder that manual editing still works. Other errors are unchanged.

## Bundled fonts (RS-003, RS-404)
- `src/fonts/localFonts.ts`: `findLocalFont` and `registerLocalFonts` also cover `REELSMITH_LOCAL_FONTS` (`src/reelsmith/fonts.ts`; files in `assets/fonts/rs/`, built by `server/reelsmith/sync-fonts.mts`).
- `src/fonts/googleFontCatalog.ts`: `FONT_CATALOG` also lists bundled families that are not in the Google list (Noto Sans Devanagari, Poppins).
- `src/fonts/googleFontCatalog.ts`, `src/fonts/googleFonts.ts`: remove four remote-only CJK font choices/loaders, so selecting a catalog font cannot fetch from Google at runtime.

## Recipe previews (RS-102, RS-107)
- No upstream changes. Posters/loops live in `assets/recipe-previews/` (served at `/recipe-previews/` by the upstream product-assets plugin), built by `server/reelsmith/build-previews.mts`.

## English-only UI (RS-006)
- `src/i18n/locale.ts`: the locale is always English (a saved choice is ignored) and `prefetchLocaleDicts` skips the other languages. `src/i18n/locale.verify.ts` updated to match.
- `src/components/TopBar.tsx`: `LocaleToggle` renders nothing (the upstream body is kept as `UpstreamLocaleToggle`).
- `src/i18n/dict/en/index.ts`: also merges `reelsmithSounds` (English sound effect descriptions).
- `src/library/SoundBrowser.tsx`: the sound tooltip passes `desc` through `t()`.
- `src/library/ResourceBrowser.tsx`: card tooltips translate the resource name (`t(item.name)`).
- `src/export/ExportDestinationBar.tsx`: the destination tooltip shows the translated "Browser downloads" label.
- `src/export/useExportDialogModel.ts`: JianYing tab summary is "CapCut draft".
- `shared/asr-models.ts`: Whisper size/language labels are English.
- Runtime messages (errors, toasts, progress) wrapped in `t()` with English entries in `src/i18n/dict/en/reelsmithRuntime.ts`: `src/persist/{sharedKv,sharedKvRecovery,agentSessionGeneration,projectTransfer}.ts`, `src/export/{serverExportRecovery,serverExportRecoveryStore,serverExportOperation,exportDestination,exportDestinationStorage,exportRoutePlanner,backgroundExportStore,videoExportOperation}.ts`, `src/media/projectFile.ts`, `src/media/semantic-search/useSemanticSearch.ts`, `src/transcript/{local-asr,segment,variants}.ts`.
- Changed straight to English (no i18n there): `desktop/main.ts` (native dialog titles), `desktop/runtime-preflight.ts` (+ verify), `desktop/bootstrap.ts`, `src/export/artifactExportOperations.ts`.
- `src/components/VersionHistory.tsx`: stored version names render through `t()`.
- UI leaks found by the runtime scan (caption menus, inspector fields, timeline, design style panel): `src/captions/{CaptionStyleMenu,CaptionTrackLane,CaptionsControls}.tsx`, `src/captions/manualCaptions.ts`, `src/components/inspector/PropSchemaField.tsx`, `src/components/settings/DesignStylePanelSections.tsx`, `src/components/timeline/{useTimelineController,useTimelineShortcuts}.ts`, `src/editor/{TimelineGraphicLayers.tsx,storeCommandBuilder.ts}`, `src/agent/tools/{beat-tools,edit-item-commit}.ts`.
- `src/components/settings/transcription-language.verify.ts`: expects the English "Multilingual (… Hindi …)" label.
- Default names in English: `src/persist/templateStore.ts` ("Untitled template"), `src/persist/ownedStyleStore.ts` ("Untitled style"), `src/plugins/export.ts` ("Custom transition"). AssemblyAI progress and audio-extraction errors in English: `src/transcript/assemblyai.ts`.
- Error messages changed straight to English: `src/plugins/{validate,install,store}.ts`, `src/persist/{mediaBlobStore,projectTransferStream,mediaBlobUpload,projectProposalTransfer,designStyleTransfer}.ts`; `designStyleTransfer.verify.ts` and `projectTransfer.verify.ts` match the English text.

## Recipe-first home screen (RS-102)
- `src/components/dashboard/DashboardViews.tsx`: adds `RecipeHome` above the project list and labels that list "Recent projects"; existing project actions and search remain available.
- `src/components/dashboard/useDashboardModel.ts`: optional `onStartRecipe` callback; active projects displayed by descending update time without mutating the input list.
- `src/app/useDashboardActions.ts`: validates the selected bundled recipe, creates a new empty project at its canvas/fps, and navigates after refreshing the project list. The one-time handoff lives in `src/reelsmith/recipeStart.ts`.
- `src/library/LibraryPanel.tsx`: reads the project-scoped recipe handoff on mount, initially opens Recipes and passes the selected recipe to setup; clears the handoff after mounting. Existing projects keep the usual My Media start.
- `package.json`: adds `recipeStart.verify.ts` and `recipeGallery.verify.tsx` to `test:reelsmith` (the TSX verify uses the app's JSX config).
- Reelsmith-owned UI: `RecipeGallery.tsx` shares cards/filters between home and editor; `RecipeHome.tsx` handles pending creation and visible failures; `RecipesPanel.tsx` accepts an initial recipe.

## Recipe setup imports and validation (RS-103)
- `src/library/LibraryPanel.tsx`: passes the existing `onImportMedia` callback to recipe setup, reusing the normal project media importer. Imports remain in the media pool until assembly adds timeline items.
- `package.json`: registers `src/reelsmith/slotImport.verify.ts` in `test:reelsmith`.
- Reelsmith-owned files: `slotImport.ts` handles counts, per-file failures, deduplication and song replacement; `setupForm.ts` checks selections against current project assets and limits agent selection to Off/Claude; `runRecipe.ts` validates before analysis. `RecipesPanel.tsx` offers direct imports, Clear selection, max-count controls, text maxLength and numeric validation, and locks controls while busy.

## Clip scoring and source-range selection (RS-105)
- No additional upstream code changes. All implementation lives under `src/reelsmith/` and `server/reelsmith/`.
- `server/reelsmith/clipFeatures.ts` uses the app's packaged FFmpeg/ffprobe binaries, reads embedded capture dates, clamps video windows to source duration, and supports still-image quality/dHash extraction. The local analysis route includes media kind in its cache key.
- `src/reelsmith/subjectFeatures.ts` reuses upstream MediaPipe geometry and bundled models for video and photo face scores. Inference is bounded, cached per source revision, and optional; unavailable models preserve the model-free measurements. `analyzeApi.ts` merges these measurements before assembly.
- `src/reelsmith/assembler/sourcePlacement.ts` retains scoring windows and cut bounds through placement, choosing a duration-aware range within a single shot. Montage, vlog, collage and B-roll use it. Captioned Story's talking clips keep the existing transcript-aligned edit path.
- `package.json`: registers `assembler/sourcePlacement.verify.ts`, `subjectFeatures.verify.ts` and `analyzeApi.verify.ts`; expands the existing scoring and FFmpeg fixture checks.

## Optional agent shot selection across recipes (RS-106)
- `assets/agent/openchatcut-tool-schemas.json`: regenerated to describe selectionKey, separate B-roll picks, privacy-aware contact-sheet requests and graceful fallback.
- `package.json`: registers `src/reelsmith/agent/selectionFlow.verify.ts` in `test:reelsmith`.
- Reelsmith-owned files: vlog/collage/captioned-story assemblers honour preferred picks; captioned stories report B-roll use. The assembler tags generated items with their recipe run so replacing shots preserves unrelated manual items, including ids starting with `rs-`.
- `src/reelsmith/agent/selectionContext.ts`: compact candidate facts and SHA-256 selection keys over the project/run snapshot; selection highlights are excluded. `reelsTools.ts` refuses stale picks and changes during analysis, fills partial answers, preserves the existing reel on unusable answers and reports persistence failures after a successful edit accurately.
- `src/agent/skills/reels-editor/SKILL.md` (our bundled skill) and the setup chat prompt describe the updated workflow. Candidate frames remain behind the existing project privacy switch and `view_asset_frames` dispatcher gate.
- Validation: all five recipe integration tests, the full Reelsmith suite, TypeScript, skill loading and MCP tool exposure pass. A real Claude CLI run on synthetic fixture photos successfully inspected frames, proposed picks, linted and reviewed the edit session.

## Reels caption style picker (RS-502)
- `src/captions/CaptionsControls.tsx`, `src/captions/CaptionStyleMenu.tsx`: render the shared `src/reelsmith/ui/ReelsCaptionStyles.tsx` picker. Each preset applies template, style overrides, pacing, motion and safe placement through the existing caption commands; source-entry appearance overrides are cleared so the selected look is visible. Caption content, timing and translations are preserved. Manual testing is delegated to the user.

## Export destination label (RS-006)
- `src/export/exportDestinationModel.ts`: the default "downloads" destination label is now English ("Browser downloads"); it was a Chinese literal that leaked into export error details.

## Instagram SRT sidecar (RS-301)
- `src/export/serverExportOperation.ts`: after a server video export is delivered, `writeSrtSidecar` (ours, `src/reelsmith/instagramSrt.ts`) saves `<video>.srt` to the same destination when the "Also save the captions as an .srt" option is on. It runs only after the target is committed and never fails the export; the outcome shows under the Instagram report.
- `package.json`: `src/reelsmith/network-runtime.verify.ts` added to `test:reelsmith` (it skips without REELSMITH_AUDIT_URL).

## Text outline/shadow/animation, flip and detach audio (RS-404, RS-407)
- `src/editor/TimelineGraphicLayers.tsx`: `TextLayer` reads `strokeWidth`/`strokeColor` and the shadow props through `shared/reelsmith/textStyle.ts` (the old hard-coded shadow stays the default; an explicit `textShadow` string still wins).
- `src/components/inspector/InspectorContent.tsx`: mounts our `TextStyleControls` (Basic tab, after the text controls) and `TextAnimationControls` (Animation tab) for text clips. Animations are ordinary opacity/y/scale keyframes.
- `src/components/timeline/ClipContextMenu.tsx`: "Flip horizontal/vertical" and "Detach audio" items, implemented in `src/reelsmith/clipOps.ts`.
- `src/editor/keyframeRegistry.ts`: the uniform scale readout shows the magnitude, so a flipped (negative) axis does not read as -100%.
- `package.json`: `clipOps.verify.ts`, `textStyle.verify.tsx` and `textAnimation.verify.ts` added to `test:reelsmith`.

## Faster `npm test` (255 s -> ~70 s on an M-series Mac)
- `package.json`: `pretest`/`posttest` renamed `test:pre`/`test:post` (they ran ~210 s of verifies serially around the pool); `npm test` defaults to 8 workers (`TEST_CONCURRENCY` still overrides).
- `scripts/run-tests.mjs`: runs `test:pre`, `test:serial` and `test:post` in one pool, starts the known-slow segments first and prints the slowest segments.
- `scripts/verify-gate-coverage.verify.mjs`: reads `test:pre`/`test:post` instead of `pretest`/`posttest`.
- `src/components/inspector/FontFamilyPicker.tsx`: the "Bundled fonts" group now also lists our bundled families that are not Google entries (Noto Sans Devanagari, Poppins); they were missing from the text-clip font picker.

## Fill canvas and Reframe to subject (RS-402)
- `src/components/timeline/ClipContextMenu.tsx`: "Fill canvas (centre)" and "Reframe to subject" items for video clips, implemented in `src/reelsmith/subjectReframe.ts` (uses `src/reframe/detect.ts` unchanged).
- `package.json`: `subjectReframe.verify.ts` added to `test:reelsmith`.

## Ken Burns motion (RS-406)
- `src/components/timeline/ClipContextMenu.tsx`: "Ken Burns motion" submenu for photo/gif/svg clips, implemented in `src/reelsmith/kenBurns.ts`.
- `package.json`: `kenBurns.verify.ts` added to `test:reelsmith`.
- RS-406 drag-to-fill: `src/components/PreviewPanel.tsx` (new optional prop `onDropAssetInCell`, a "Layout" select in the toolbar and `LayoutFillOverlay` in the canvas box) and `src/editor/useEditorController.tsx` (passes `onDropAssetInCell`, one import). Code in `src/reelsmith/layoutFill.ts`, `src/reelsmith/ui/LayoutFillOverlay.tsx`; `layoutFill.verify.ts` added to `test:reelsmith`.

## Break-in transitions (RS-408..RS-410)
- `src/editor/transitionTypes.ts`: types `bars`, `wide-bars`, `window` added to `GlslTransitionType`, `GLSL_TRANSITION_TYPES`, `TRANSITION_LABELS` (English text), `TRANSITION_ORDER`; new exports `BREAK_IN_TRANSITIONS`, `BREAK_IN_SECONDS`.
- `src/gl/transitions.ts`: three registry entries and `WINDOW_LIMIT`; shaders `src/gl/shaders/bars.frag`, `window.frag` (+ generated `.frag.ts`).
- `src/editor/transitionPreview.ts`: CSS approximations for the new types.
- `src/editor/reducerTrackActions.ts`: default length 0.35 s for the break-in types.
- `package.json`: `breakIn.verify.ts` added to `test:reelsmith`.

## Strobe hook tool (RS-411)
- `src/agent/external-tool-policy.ts`: `reels_strobe` added to the Reelsmith edit tools.
- `assets/agent/openchatcut-tool-schemas.json`: regenerated (`npm run generate:server-tool-catalog`).
- `package.json`: `strobe.verify.ts` added to `test:reelsmith`.

## Break-in transitions for the agent (RS-413)
- `src/agent/tools/library-catalog.ts`: transition descriptions come from `BREAK_IN_INFO` (src/reelsmith/breakInInfo.ts) when there is one (one import, one expression).
- `src/agent/tools/edit-item-validate.ts`: `transitionPlan` takes the timeline fps and uses `breakInDefaultFrames` (0.35 s) as the default length of bars/wide-bars/window (one import, one parameter).
- `package.json`: `breakInTools.verify.ts` added to `test:reelsmith`.

## Window grow-in props (RS-410)
- `src/gl/GlTransition.tsx`: for `window`, the shader def merges the item's `customUniforms` via `windowUniforms` (one import, one branch in the def memo).
- `src/editor/TimelineComposition.tsx`: `customFrag`/`customUniforms` are also passed for `window` (one condition).
- `src/components/inspector/InspectorMediaControls.tsx`: renders `WindowControls` for `window`; `TransitionControl` takes an optional `canvasSize` (one import, one prop, one block).
- `src/components/inspector/InspectorContent.tsx`: passes `canvasSize` to `TransitionControl`.

## HDR, VFR and audio sync (RS-304)
- `server/media-normalization.ts`: probe sets `hdr` for `arib-std-b67`/`smpte2084`; `normalizeReason` and `resolveStreamPlan` treat it as a reason to transcode; the transcode adds `HDR_TO_SDR_FILTERS` (zscale + hable tone-map, 8-bit Rec.709) and bt709 tags. The transcode path no longer passes `-avoid_negative_ts make_zero` (it put re-encoded video 20-45 ms off the copied audio). `resolveTargetFps` snaps a detected rate to the nearest standard rate within 8% (`snapToStandardRate`).
- `server/plugins/export-rendering.ts`: `renderExportPlan` calls `skipAacPriming(filepath)` (ours, `server/reelsmith/audioPriming.ts`) right after the Remotion render of an mp4, so the exported audio is no longer 42.7 ms late.


## Ramped music ducking (RS-603)
- `src/editor/TimelineComposition.tsx`: `duckGain` calls `duckGainAt` (ours, `src/reelsmith/duckEnvelope.ts`): a 0.2 s attack before each anchor clip and a 0.4 s release after it, linear in dB, in place of the hard on/off step (one import, two lines).
- `package.json`: `duckEnvelope.verify.ts` added to the test chain.

## Travel Diary recipe (RS-206)
- `package.json`: `travelDiary.verify.ts` added to the test chain. Everything else is in our folders (the reveals use the editor's existing `custom-shader` transition).
- `src/editor/TimelineComposition.tsx`: in the Player, a transition that is not selected gets a CSS stand-in (a dissolve for custom shaders). For our Travel Diary reveals the preview edge now carries the reveal's uniforms (`revealPreviewUniforms`) and the incoming clip is wrapped in `RevealPreviewIn` (ours, `src/reelsmith/ui/RevealPreviewIn.tsx`), which clips it to the same bars/window and flash as the shader. One import, one field, one branch. (Using the real GL path during playback instead stalled the Player on 4K clips: it mounts two extra video decoders per transition.)

## One-press agent shot choice (RS-106)
- `src/editor/useEditorWorkspaceUi.ts`: `EditorChatSeed` gets an optional `autoSend`.
- `src/components/chat/chatPanelController.ts`: the seed type takes `autoSend`; `useAutoSendSeed` sends such a seed as if Enter were pressed, only when the agent model is ready and no turn is running (otherwise it stays prefilled as before).
- `src/library/LibraryPanel.tsx`, `src/editor/useEditorController.tsx`: `onAskAgent(text, { autoSend })` passes the flag through to the seed.
- `assets/agent/openchatcut-tool-schemas.json`: regenerated (`propose_selection` takes `texts`).

## HEIC photos in exports
- `server/plugins/export-media-plan.ts`: before rendering, `/media/uploads/*.heic|.heif` references are converted to a staged JPEG (`convertHeicReferences`, ours, `server/reelsmith/heicExport.ts`, sips with ffmpeg fallback) and the snapshot points at it; cleaned up with the other staged files.
- `src/media/upload.ts`: `importMedia` converts a HEIC/HEIF photo to JPEG before upload (`heicAsJpeg`, ours, `src/reelsmith/heicImport.ts`, the same `heic-to` converter upstream uses for phone uploads); a failed conversion keeps the original and the export converts it.
- `package.json`: `heicImport.verify.ts` and `heicExport.verify.ts` added to the test chain.

## Visual-semantics pack could not load (RS-109)
- `server/plugins/hf-proxy.ts`: `parseTarget` also resolves revision "main" to the catalog-pinned revision for the `.json`/`.txt` files of catalog model packs. transformers.js 4.2 probes `tokenizer_config.json` with "main" while loading the tokenizer; the proxy answered 400, so the tokenizer came back empty ("Cannot read properties of undefined (reading 'tokenizer_class')") and "Enable local model" always failed, although the pack was installed. Weight files are still never served for "main". Covered in `server/plugins/hf-proxy.verify.ts`.

## Caption edit timing and 1.2 s silence hide (RS-503)
- `src/captions/captionPages.ts`: `withCueEdits` gives inserted words a real span (the cue's average word length at the head or tail, interpolation in gaps, never 1 ms); `activeCaptionPages` hides a caption at the earlier of the next page and 1.2 s after its last word.
- `src/captions/types.ts`: `LINGER_MS` is 1200 (was 1500); `paginate` forces a page break at any silence longer than `LINGER_MS`; `activePage` and `activeTranslation` use the same earlier-of rule.
- `src/captions/captionPreviewTarget.ts`: its private linger constant is 1200 and uses the same rule, so the preview target matches the rendering.
- `src/geometry/caption-qa.ts`: caption QA uses `LINGER_MS` and the same rule, so collision checks match what is on screen.
- `src/geometry/caption-collision.verify.ts`: expected source end moves from 6 to 5.4 s for the 1.2 s linger.
- Tests: `src/captions/cueEditTiming.verify.ts` (ours, next to the code it covers); not added to the `package.json` chain, so `verify:affected` picks it up.

## Crop focus per ratio (RS-903)
- `src/editor/TimelineMediaLayer.tsx`, `src/gl/ClipFx.tsx`: `objectPosition` / `drawFit` read `rsCropX`/`rsCropY` from clip props (ours, `cropFocus.ts`). Recipes and layout cells no longer write these props; the fill now uses a transform. Remove or keep as a later option.
- `src/reelsmith/layoutFill.ts` and `src/reelsmith/runRecipe.ts` are ours; `src/reelsmith/assembler/scoring.ts` and `subjectFeatures.ts` are ours too.

## Lowercase caption transform (RS-502)
- `src/captions/styles.ts`, `src/captions/styleMap.ts`, `src/captions/renderStyles.ts`: `textTransform` accepts `lowercase` (was none/uppercase) so the "Minimal lowercase" style really lowercases; one line each.
- Tests: `src/reelsmith/captionStyles.verify.ts` (ours, in `test:reelsmith`).
- RS-1005: `src/reelsmith/ui/RecipeHome.tsx` is ours; no upstream file changed. `package.json` `test:reelsmith` gains `shared/reelsmith/trendCache.verify.ts`.

## Ken Burns covers the canvas (RS-903)
- `src/components/timeline/ClipContextMenu.tsx`: `kenBurnsActions` is passed the clip's size and the timeline canvas so the zoom starts at the cover scale. Logic is ours (`src/reelsmith/kenBurns.ts`).

## Revert this turn for Claude CLI edits (RS-701)
- `src/agent/external-proposal-apply.ts`: the committed result also returns the project before the edit and the applied operations.
- `src/agent/external-bridge-runtime.ts`: new `onApplied` callback (and `ExternalAppliedChange` type), called once after an edit is committed.
- `src/agent/useExternalAgentBridge.ts`: optional third argument `onApplied`, wired to the runtime.
- `src/agent/serverRunProposalBridge.ts`, `src/agent/useAgent.ts`, `src/components/chat/useChatAgentController.ts`, `src/components/chat/chatPanelController.ts`: `recordExternalChange` adds the edit to the existing change log, so the existing "Revert this turn" button appears.
- Test: `src/agent/external-edit-session-apply.verify.ts` (extended).

## Longer Claude CLI turns
- `server/agent-runs/claude-code-turn.ts`: `CLAUDE_CODE_TURN_TIMEOUT_MS` raised from 10 to 30 minutes so a whole-reel turn over many clips is not cut off.

## Contact-sheet shot selection
- `src/agent/external-tool-policy.ts`: `reels_selection_sheet` (ours) added to the read-only tool names.
- `src/agent/skills/reels-editor/SKILL.md` (ours), `assets/agent/openchatcut-tool-schemas.json` (regenerated).
- `src/reelsmith/ui/RecipesPanel.tsx` is ours (no upstream edit): a "★ Starred" button per media slot uses the Media Pool favourites as selects (`src/reelsmith/slotFavorites.ts`).
