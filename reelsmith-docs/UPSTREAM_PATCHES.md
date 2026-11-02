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
| `server/claude-code/turn-runner.ts` | Passes `--effort` from `resolveClaudeEffort()` (`server/reelsmith/claudeEffort.ts`, env `REELSMITH_CLAUDE_EFFORT`, default `medium`, `high` for a Director box request (RS-1214), `default` = CLI default) | Agent speed: ~87% of a measured reel edit's output tokens were hidden reasoning | 2026-10-17 |
| `server/plugins/export-rendering.ts` | `h264RenderOptions(codec, {preferSpeed})` forces software x264 for exports (env `REELSMITH_EXPORT_ENCODER=hardware` opts out); our preview/baseline callers pass `preferSpeed` | Export quality: x264 beats VideoToolbox at equal bitrate (SSIM .951 vs .945 at 15 Mbps) and costs seconds on a reel | 2026-10-17 |
| `src/export/bitrate.ts`, `server/plugins/export-params.verify.ts` | "High" bitrate multiplier 1.5 → 2.5 (15 → 25 Mbps at 1080p30) | Export quality: SSIM .945 → .969 on detailed phone footage | 2026-10-17 |
| `src/transcript/provider.ts`, `src/transcript/local-asr.ts`, `src/transcript/assemblyai.ts`, `src/transcript/generic-cloud-asr.ts`, `src/components/settings/SettingsDialog.tsx` | Fallback transcription language `'zh'` → `DEFAULT_TRANSCRIPTION_LANGUAGE` (`'en'`, `src/reelsmith/transcriptionLanguage.ts`) | RS-501: Chinese default garbled English/Hindi speech | 2026-10-17 |
| `src/components/chat/chatPanelController.ts` | One call: `useTrendCapture(agent.messages, agent.running)` (`src/reelsmith/useTrendCapture.ts`) | RS-1005: save the agent's Trend Scout reply as notes without pasting | 2026-10-17 |
| `src/export/serverExportOperation.ts` | `.srt` sidecar block moved into `deliverSrtSidecar()` and also called from the recovered/retried export path; recovered context reads its caption track from the saved timeline state instead of `null` | RS-301: Retry-from-failed-job wrote no `.srt` | 2026-10-17 |
| `remotion/performance.mjs` | Added `maxSourcePixels`, `resolveSourceAwareConcurrency` and two constants (existing functions untouched) | RS-803: 4K sources export fastest with 2 render workers; light sources keep the automatic count | 2026-10-17 |
| `remotion/render.mjs` | `concurrency: resolveSourceAwareConcurrency(renderOptions.inputProps?.state)` instead of `currentRenderConcurrency()` (plus the import) | RS-803 | 2026-10-17 |
| `remotion/render.mjs` (second patch) | `renderTimeline` passes `colorSpace: 'bt709'` for h264 renders, unless `RS_RENDER_COLOR_SPACE=default` (set by `remotion/video-decoder-render.verify.mjs`, see the 2026-10-26 sync) | The first render was tagged `yuvj420p` / `smpte170m` and failed V2, so "Make it Instagram-ready" always re-encoded the whole picture (+50 s on a 58 s reel). Now only the audio checks can fail, and finalize rewrites just the audio | 2026-10-18 |
| `remotion/render.mjs` (jpeg quality) | `renderTimeline` passes `jpegQuality: 95` for non-ProRes renders | Only matters when Remotion 4.0.537's shared-memory capture is unavailable and frames fall back to Chrome JPEGs (q80 → q95: ~44 → ~49 dB on a Torna frame). Normally frames reach ffmpeg raw: a 1080x1920 render of a Torna clip matches its source at 51-52 dB, and JPEG/PNG renders are byte-identical | 2026-11-02 |
| `server/plugins/asr-models.ts` | Per-download `AbortController`; `POST /api/asr-models/cancel`; the signal is passed to the downloader; GET rows carry `partialBytes` (bytes of the file in flight); three `__...ForVerify` test seams; `startDownload` takes `cacheDir`/`download` for tests | A running model download could not be cancelled and progress only moved per finished file | 2026-10-17 |
| `shared/asr-models.ts` | `AsrDownloadTask.partialBytes?` | same | 2026-10-17 |
| `src/components/settings/LocalAsrPane.tsx`, `local-asr-model-mutation.ts` | The "…" label became a **Cancel** button; progress uses `downloadPercent()` (`src/reelsmith/asrDownloadProgress.ts`); mutation type gains `cancel` | same | 2026-10-17 |
| `server/external-agent/mcp-result.ts`, `src/agent/external-result-projection.ts` | `projectMcpReply` / `projectExternalReply` take an optional `toolName`; `load_skill` results may be up to 64k characters (`SKILL_RESULT_MAX_CHARS`) instead of the 16k `TOOL_ARTIFACT_THRESHOLD` | RS-1201: the 32k director skill was rejected over MCP, so the claude CLI paged it in 2-3k reads (~70 s) | 2026-10-20 |
| `server/external-agent/mcp.ts`, `src/agent/useExternalAgentBridge.ts` | Pass the tool name to those two projections (one argument each) | same | 2026-10-20 |
| `desktop/native-asr-worker.ts` | One import and one call: `killWithOwner(child.pid)` (`server/reelsmith/orphanGuard.ts`) right after `whisper-server` is spawned | Quitting the app left `whisper-server` running (Electron ends the worker without its `exit` handler; 9 orphans holding models had piled up) | 2026-10-20 |
| `server/frame-grid.ts` | `TileOptions.cellHeight` (default stays 16:9 of the width) | RS-1201: portrait clips were 76 px slivers in 16:9 cells; `server/reelsmith/selectionSheet.ts` now asks for 9:16 cells when most frames are portrait | 2026-10-20 |

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
- `src/export/serverExportOperation.ts` (2026-10-28, RS-1237): in `exportMedia`, `renderId`/`completed` became `let`, and after the Instagram finalize `retakeIfStalled` (`src/reelsmith/exportRetake.ts`) may render once more when V10 warns, delivering the better take and retiring the other job. The recovered-export path is unchanged.
- `src/export/serverExportOperation.ts` (2026-11-01, RS-1241): after the cover, `deliverNoSoundCopy` (`src/reelsmith/exportMusic.ts`) writes `<name>.no-sound.mp4` next to the export when the reel has a song (Instagram-ready on, "No music" off) and puts the Instagram start time of the song in the report. The cover block became an `if (pref.cover)` block instead of an early return.
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
- `src/agent/external-bridge-runtime.ts`: new `onApplied` callback, called once after an edit is committed (two added lines; the `ExternalAppliedChange` type lives in `src/reelsmith/agent/externalAppliedChange.ts` so the file stays within the 500-line gate).
- `src/agent/useExternalAgentBridge.ts`: optional third argument `onApplied`, wired to the runtime (imports `ExternalAppliedChange` from our module).
- `src/i18n/dict/en/transcript.ts`, `src/i18n/dict/en/settings.ts`, `src/i18n/dict/it/settings.ts`: entries for the Hindi/Hinglish model strings (desktop-only error, model label, Hindi/Marathi/auto language, stop download) so the i18n coverage checks pass.
- `src/agent/serverRunProposalBridge.ts`, `src/agent/useAgent.ts`, `src/components/chat/useChatAgentController.ts`, `src/components/chat/chatPanelController.ts`: `recordExternalChange` adds the edit to the existing change log, so the existing "Revert this turn" button appears.
- Test: `src/agent/external-edit-session-apply.verify.ts` (extended).

## Longer Claude CLI turns
- `server/agent-runs/claude-code-turn.ts`: `CLAUDE_CODE_TURN_TIMEOUT_MS` raised from 10 to 30 minutes so a whole-reel turn over many clips is not cut off.

## Contact-sheet shot selection
- `src/agent/external-tool-policy.ts`: `reels_selection_sheet` (ours) added to the read-only tool names.
- `src/agent/skills/reels-editor/SKILL.md` (ours), `assets/agent/openchatcut-tool-schemas.json` (regenerated).
- `src/reelsmith/ui/RecipesPanel.tsx` is ours (no upstream edit): a "★ Starred" button per media slot uses the Media Pool favourites as selects (`src/reelsmith/slotFavorites.ts`).

## Plan a reel (RS-1101)
- `src/agent/external-tool-policy.ts`: `reels_plan_options` is a read tool, `reels_plan_assemble` a draft edit tool (same pattern as the other `reels_*` tools).
- `assets/agent/openchatcut-tool-schemas.json`: regenerated (`npm run generate:server-tool-catalog`) for the two new tools.
- `package.json`: `planTools.verify.ts` added to `test:reelsmith`.

## Import progress and semantic model (performance bugs, 2026-10-17)
- `src/media/mediaPoolImport.ts`, `src/media/media-pool-progressive-import.verify.ts`: overall upload progress is the mean over all files (it was the highest `(index + ratio) / n`, so it read ~100% while earlier files still uploaded and the button stayed disabled); at most `MAX_CONCURRENT_IMPORTS` (3) files upload/normalize at once, so the first clips are usable early and the CPU is not saturated.
- `src/media/semantic-search/useSemanticSearch.ts`, `semanticOperations.ts`, `mediaFrames.ts`, `SemanticSearchControls.tsx`, `semanticSearch.verify.ts`: a change to the media pool no longer aborts the model load (it was aborted by every asset update during an import, and the abort was swallowed, leaving the panel on "loading"); an aborted index run resets the status; load/index finish against the latest snapshot; files still uploading (blob: sources) are not indexed or counted.

## Reels transitions (RS-1102)
- `src/editor/transitionTypes.ts`: ten new `GlslTransitionType`s (zoom-through, whip-blur, spin-zoom, light-leak, chroma-glitch, fluted-glass, ripple-dissolve, tile-pop, cube-turn, slide-over), their labels and order, `REEL_TRANSITION_SECONDS` and `defaultTransitionSeconds()`.
- `src/editor/reducerTrackActions.ts`: the default length of a new transition comes from `defaultTransitionSeconds()` (covers the break-ins as before).
- `src/editor/transitionPreview.ts`: playback fallbacks for the new types.
- `src/gl/transitions.ts`: imports, `GLSL_TRANSITIONS` entries and a `motionDir()` helper; new shaders `src/gl/shaders/*.frag` (+ generated `.frag.ts` twins from `scripts/sync-shader-sources.mjs`).
- `shared/reelsmith/recipe-schema.ts` is regenerated from `reelsmith-docs/plan/schemas/recipe.schema.json` (more allowed `transition` names).

## Reels effects (RS-1103)
- `src/gl/fx/shaderEffects.ts`: imports `REEL_FX_EFFECTS` / `REEL_FX_ORDER` from our `src/gl/fx/reelFx.ts`, spreads the effects into `FX_EFFECTS` and appends the order to `FX_ORDER` (3 lines). The twelve effects and their shaders (`src/gl/fx/reel-*.frag` + generated `.frag.ts` twins) are ours.

## Reel looks (RS-1104)
- `src/library/LibraryPanel.tsx`: passes `items` and `selectedItem` to `RecipesPanel` (one line) so the Recipes tab can show Reel looks.
- `src/agent/external-tool-policy.ts`: `reels_apply_look` is a draft edit tool.
- `assets/agent/openchatcut-tool-schemas.json`: regenerated for the new tool.
- Our own: `src/reelsmith/looks.ts`, `src/reelsmith/ui/LooksPanel.tsx`, `src/reelsmith/agent/lookTools.ts`; effects `fine-grain` and `soft-vignette` in `src/gl/fx/reelFx.ts`.

## Person-matte effects (RS-1105)
Effects that need the person cut out of every frame. The matte is MediaPipe's segmenter run on the frame an effect is about to process (`src/gl/personMask.ts`, maths in `personMaskMath.ts`), bound to the effect passes as `u_mask`, with `u_subjectCenter` / `u_subjectSize` / `u_subjectArea`.
- `src/gl/runtime.ts`, `src/gl/runtimeTypes.ts`: `renderFx` and `renderFxChain` take optional extra named 2D textures (bound only when the shader declares the sampler; created on their own texture unit so they never rebind the input).
- `src/gl/ClipFx.tsx`: when a clip's effects ask for the matte (`FxDef.needsMask`) it loads the segmenter, waits for it (also during export), computes the matte from the staged frame and passes it plus the subject uniforms; the "Find people" slider (`detect`) picks the sharp single-person model or the group/distance model.
- `src/gl/fx/uniforms.ts`: `FxDef.needsMask`; `fxPasses` accepts per-effect `extraUniforms`. `src/gl/shaderFrame.ts`: types follow.
- `src/gl/fxThumb.ts`: library thumbnails of matte effects use a head-and-shoulders stand-in matte.
- `remotion/serve-bundle.mjs`: the export bundle now includes `public/mediapipe` (the render page loads the model from the serve root).
- `scripts/sync-mediapipe.mjs`: also provisions `deeplab_v3.tflite` (2.8 MB, sha256 pinned).
- Later additions: `src/gl/fx/uniforms.ts` `FxDef.needsText` (the shader reads `u_text`, a word cell drawn by `src/gl/textLayer.ts`) and `FxDef.history` (the shader reads `u_hist0..3` / `u_histMask0..3`, the clip a few steps earlier). `src/gl/ClipFx.tsx` mounts hidden `HistoryTap` video copies (own file `src/gl/HistoryTap.tsx`, each held on the first frame until its delay, then playing delayed so frames are deterministic in the export too), waits for them, and caches mattes per source frame (`src/gl/frameCache.ts`). `src/gl/fxThumb.ts`: stand-in text and history frames for library thumbnails.
- Title effects: `src/gl/fx/uniforms.ts` `FxDef.textKind` (`'title'` makes the renderer draw the movie-title cell from `src/gl/titleText.ts` instead of a behind-you word). `src/gl/ClipFx.tsx` and `src/gl/fxThumb.ts`: text effects no longer have to need the person matte (`u_textAspect` is supplied on its own; the library thumbnail of a title effect shows the finished title). `src/gl/fx/reelFx.ts` registers `titleFx.ts`.

## Signature styles and picture-quality lint
- `src/agent/external-tool-policy.ts`: `reels_apply_signature` is a draft edit tool.
- `assets/agent/openchatcut-tool-schemas.json`: regenerated (`server/agent-runs/generate-tool-catalog.mts`) for the new tool.
- Our own: `src/reelsmith/signatures.ts`, `src/reelsmith/agent/signatureTools.ts`, `src/reelsmith/qualityLint.ts` (called from our `reelLint.ts`).

## Shot matching label
- `src/i18n/dict/en/fx.ts`: EN name for the colour-wheels effect (`三路色轮` -> Color Wheels), which shot matching adds to clips (`src/reelsmith/shotMatch.ts`).

## Recipes tab keeps its place
- `src/library/LibraryPanel.tsx`: the Recipes panel stays mounted once opened and is hidden (not unmounted) when another tab is shown, so the chosen recipe and its form values survive a trip to My Media. The tab chain renders `null` for Recipes; the panel is rendered in its own block above it.

## Re-transcribe finished clips
- `src/transcript/transcribe-jobs.ts`: `force` option on enqueue (skips the "already done for this source" check only when set); new `canRetranscribe` (finished audio/video).
- `src/media/useEditorMediaIngest.ts`: a finished asset is re-transcribed with `force`, and its timeline items get the new transcript.
- `src/media/MediaPoolCard.tsx`, `MediaPoolMenus.tsx`, `MediaPoolOverlays.tsx`, `MediaPoolPanel.tsx`: the mic button, the "..." menu and the bulk action offer 重新转写 on finished clips.

## Auto-detect transcription language
- `src/components/settings/settingsMediaProviders.ts`: new "自动识别（混合语言）" option (`auto`) in 转写语言.
- `src/transcript/local-asr.worker.ts`: `auto` is passed to the pipeline as "no language", so Whisper detects it per clip. The desktop whisper.cpp path already accepts `-l auto` unchanged.

## Hindi/Hinglish Apex model (desktop only)
- `shared/asr-models.ts`: new tier `hinglish-apex` (`desktopOnly`, empty browser file list, whisper.cpp file from `Marquestra/Whisper-Hindi2Hinglish-Apex-GGML`); `GgmlAsrModelFile.repo` optional.
- `server/plugins/asr-models.ts`: the whisper.cpp file is fetched and checked from its own repo when one is set (default unchanged).
- `src/transcript/local-asr-types.ts`: tier union includes `hinglish-apex`.
- `src/transcript/deviceProfile.ts`: a desktop-only tier falls back to Base when the desktop engine is off.
- `src/transcript/local-asr.ts`: a desktop-only tier that the desktop engine cannot run fails with a clear message instead of the browser engine.
- `src/components/settings/settingsMediaProviders.ts`, `src/i18n/dict/en/settings.ts`: option and English label for the new tier; auto-detect language option.
- Verify updates: `server/plugins/asr-models.verify.ts`, `server/plugins/asr-model-downloads.verify.ts`, `src/components/settings/asr-model-tier-selection.verify.ts`.
- Open: `desktop/native-inference-residency.verify.ts` fails for this tier (fp16 estimate 4.79 GiB exceeds the 4 GiB resident cap).

## Desktop dev always builds the UI fresh
- `package.json`: `desktop:dev:shared` runs `vite build` before launching Electron (the desktop window loads `dist/`, so it used to start the last build). `npm run build` still runs the full type-check gate for releases; it currently fails on 16 type errors that were already in the last commit (`src/gl/*`, `src/reelsmith/agent/lookTools.ts`, `planTools.ts`, and some `*.verify.ts`).
- `assets/agent/openchatcut-tool-schemas.json`: regenerated with `npm run generate:server-tool-catalog` (the build's pre-check said it was stale).

## Resident memory cap raised for the Hindi/Hinglish model
- `desktop/native-inference-residency.ts`: maximum resident limit 4 GiB -> 6 GiB (still 25% of RAM, so a 24 GB Mac gets 6 GiB; machines with 16 GB or less stay at 4 GiB and refuse the fp16 build).
- `desktop/native-inference-residency.verify.ts`: cap expectation updated; the Hindi/Hinglish model is checked for a 24 GB machine instead of 8 GB.

## Assemble does not wait forever on shot tags
- Our own: `src/reelsmith/shotTagApi.ts` (the shot-tag step gets a 2-minute limit and logs a warning; Assemble continues without shot tags).

## Type errors that blocked the build
- `src/gl/frameCache.ts`: constructor parameter property replaced with an explicit field (the build forbids parameter properties).
- `src/gl/fx/reelFx.ts`: the light-rays pipeline is typed `FxPass[]`.
- `src/gl/fxThumb.ts`: `u_word` read through a loose record.
- `src/gl/titleText.verify.ts`: reads `max` through an optional-typed view.
- Our own: `src/reelsmith/agent/lookTools.ts`, `planTools.ts` (removed an unused helper), `looks.verify.ts`, `recipeQuality.verify.ts`, `reelTransitions.verify.ts`.

## Ideas: describe your reel, AI picks a recipe
- `src/app/useDashboardActions.ts`: `onStartRecipe` details type gains `texts` (recipe text inputs prefilled by an Ideas pick).
- `src/library/LibraryPanel.tsx`: passes `initialTexts={recipeHandoff?.texts}` to `RecipesPanel` (one prop).
- Our own: `shared/reelsmith/ideaMatch.ts`, `server/reelsmith/claudeOnce.ts` (one-shot tool-less `claude -p --json-schema`), `server/reelsmith/ideas.ts` (routes `/api/reelsmith/ideas` and `/api/reelsmith/ideas/draft-recipe`, mounted from `user-recipes-plugin.ts`), `src/reelsmith/ideasApi.ts`, `src/reelsmith/ui/IdeasPanel.tsx`, `RecipeHome.tsx`, `RecipesPanel.tsx`, `recipeStart.ts`, `server/reelsmith/ideas.verify.ts`.

## Performance: import and analysis (2026-10-18)
- `server/plugins/asr-models.ts`: the per-file "verified" result for downloaded speech models is saved in `~/.reelsmith/asr-models/.verified-v1.json` (keyed on size, mtime, ctime and catalog sha256), concurrent checks share one hash run, and files are read in 4 MB chunks (persistence in our own `server/plugins/asr-model-verdicts.ts`). Before, every launch re-hashed 3.3 GB on the server thread, once per imported clip in parallel, stalling imports. Test: `server/plugins/asr-model-verdicts.verify.ts`.
- `src/agent/progress/visual-analysis-jobs.ts`: imported videos are only checked for reachability; the 4K contact-sheet "warm" (≈3.4 s of ffmpeg per clip, unbounded, result discarded) is gone. A 12-clip 4K import went from 7.8 s to 1.3 s.
- Our own: `server/reelsmith/clipFeatures.ts` decodes with VideoToolbox on macOS (bit-identical features; `REELSMITH_ANALYSIS_HWACCEL=0` turns it off) and `src/reelsmith/runRecipe.ts` analyses 3 clips at a time: analyse + assemble of 12 4K60 HEVC clips 45 s → 12 s.

## Hindi/Hinglish captions drifted late (2026-10-18)
The Apex fine-tune emits no timestamp tokens, so whisper.cpp spread the words evenly over its 30 s window: on a 27 s clip captions started 0.5 s early and ended ~3.5 s late.
- `shared/asr-models.ts`: `AsrModelEntry.dtwPreset?`; `hinglish-apex` sets `large.v3.turbo`.
- `desktop/native-asr-worker.ts`: a model with `dtwPreset` skips whisper-server (also not warmed on preload) and runs whisper-cli with `-nfa --dtw <preset>` in 30 s windows (Metal, then CPU); `runWhisperCli` takes the mode flags (default `-ml 20 -sow` unchanged).
- Our own: `shared/reelsmith/whisperDtw.ts` (DTW token times to word chunks; re-runs from the last timed token when the model stops early and speech remains), `shared/reelsmith/whisperDtw.verify.ts`.

## Postcard Collage (RS-1111)
- `package.json`: registers `src/reelsmith/assembler/postcardCollage.verify.ts` in `test:reelsmith`.
- Our own: `src/reelsmith/assembler/postcardCollage.ts`, `src/reelsmith/postcardGraphics.ts`, `recipes/postcard-collage.recipe.json`, the `builtin:fx-person-cutout` effect (`src/gl/fx/reel-person-cutout.frag` + twin, registered in `src/gl/fx/subjectFx.ts`), `rsFixedPosition` text opt-out in `src/reelsmith/titleClear.ts`, Bebas Neue and Figtree in `src/reelsmith/fonts.ts` / `assets/fonts/rs/`.

## Director mode (RS-1201)
- `src/agent/external-tool-policy.ts`: `reels_director_options` (read) and `reels_director_build` (edit) added to the Reelsmith tool names.
- `src/agent/skills/plugin-skills.verify.ts`, `src/agent/skills/skill-loading.verify.ts`: expect the new `reels-director` skill (33 skills).
- `assets/agent/openchatcut-tool-schemas.json`: regenerated by `server/agent-runs/generate-tool-catalog.mts`.
- `package.json`: registers `src/reelsmith/director/assembleDirector.verify.ts` in `test:reelsmith`.
- Our own: `shared/reelsmith/directorPlan.ts`, `src/reelsmith/director/` (compiler, moves, prompt), `src/reelsmith/agent/directorTools.ts`, `src/agent/skills/reels-director/`, the Director box in `src/reelsmith/ui/RecipesPanel.tsx`, `plan` in `runRecipe.ts` / `assembler/types.ts`.

## Director library (RS-1202)
- `src/editor/TimelineComposition.tsx`: each GL transition window is rendered right after its incoming clip (same layer) instead of after every clip, so higher tracks (titles, text graphics) stay on top during transitions; windows whose incoming clip is not drawn fall back to the old place.
- `src/gl/ClipFx.tsx`: a text effect draws the clip's `props.rsFxText` when set (any words), else its word index as before.
- `src/gl/textLayer.ts`: `textCellFor` takes a word index or a string; new `scenery` cell (thin, widely spaced capitals). `src/gl/fx/uniforms.ts`: `textKind` adds `'scenery'`.
- `src/gl/fx/titleFx.ts`: registers `builtin:fx-text-scenery` (ours: `reel-text-scenery.frag` + twin). `src/gl/fx/reelFx.verify.ts`: 39 effects.
- `assets/agent/openchatcut-tool-schemas.json`: regenerated.
- Our own: `src/reelsmith/director/{catalog,textGraphic,textStyles}.ts`, new moves in `moves.ts`, compiler support in `assembleDirector.ts`, `fill` on graphic windows in `postcardGraphics.ts`.

## Effects that move with the song, sound, custom shaders, lines behind you (RS-1203 to RS-1206)
- `src/editor/clipTypes.ts`: `ClipEffect.mix` (optional envelope: strength over time and person/background region; type in `src/reelsmith/effectMix.ts`).
- `src/gl/fx/uniforms.ts`: `fxPasses` takes an optional per-effect `mix`: skips an effect at zero strength, otherwise blends it over its input with our `reel-mix.frag` (copying the input first with `reel-copy.frag` when the effect is first in the chain), and still draws the clip when every effect is off. New `FxMix` type.
- `src/gl/shaderFrame.ts`: `buildEffectShaderFrame` passes `mix` through.
- `src/gl/ClipFx.tsx`: computes each effect's envelope for the frame (`envelopeFrame`: motion effects scale their own strength, others blend), loads the person matte when an effect has a subject/background region, and includes `mix` in the render key.
- `src/gl/GlTransition.tsx`: the same envelope on the clips inside a transition (no matte there: regions blend everywhere).
- `src/agent/tools/effect-tools.ts`, `src/agent/tools/schemas/effect-tools.ts`: `manage_effects` add/update take `mix` (`{}` clears it) and list it.
- `src/agent/external-tool-policy.ts`: `reels_custom_shader` added to the Reelsmith edit tools.
- `package.json`: registers the new verifies in `test:reelsmith`. `assets/agent/openchatcut-tool-schemas.json`: regenerated.
- Our own: `src/reelsmith/effectMix.ts`, `src/gl/fx/reel-mix.frag` (+ twin), `src/reelsmith/director/{effectTiming,sfx,frontCutout}.ts`, `src/reelsmith/agent/customShaderTool.ts`, plan fields in `shared/reelsmith/directorPlan.ts`, compiler support in `assembleDirector.ts`, `withFrontCutouts` in `runRecipe.ts`, the reels-director skill.

## Creator effects, transitions and moves (RS-1207, RS-1208)
- `src/editor/transitionTypes.ts`: six new GLSL transitions (pixelate, film-burn, flip-3d, mirror-flip, prism-flash, brush-wipe) in the type, the GLSL set, labels, library order and default lengths; the remaining Chinese transition labels are English now.
- `src/gl/transitions.ts`: their shaders (ours, `src/gl/shaders/<name>.frag` + twins) and uniforms. `src/editor/transitionPreview.ts`: CSS approximations for them.
- `src/gl/fx/reelFx.ts`: includes our `creatorFx.ts` (follow tag, bounce, blackout, sparkle, flare sweep). `src/gl/fx/uniforms.ts`: `textKind` adds `'tag'`. `src/gl/textLayer.ts`: the `tag` cell (pill + letters in two channels).
- `reelsmith-docs/plan/schemas/recipe.schema.json` and the generated `shared/reelsmith/recipe-schema.ts`: the new transition names. `src/agent/skills/reels-editor/SKILL.md`: lists them.
- Our own: `src/reelsmith/director/{creatorMoves,moveKit}.ts` (the move contract and item helpers moved out of `moves.ts`), catalogue/sound cues/text style entries, `fillPlacement` in `runRecipe.ts`.
- RS-1209: `src/agent/external-tool-policy.ts` adds `reels_time_effect`; `src/agent/skills/reels-editor/SKILL.md` covers timed effects and the creator effects. Our own: `src/reelsmith/agent/timeEffectTool.ts`.
- `src/editor/storeCommandBuilder.ts`: `addTextClip` sizes the title box to the canvas instead of a fixed 1920x1080 (a 9:16 title was scaled 1.78x by cover fit and cut off at both edges). Check in `storeCommandBuilder.verify.ts`.

## Stuck edit lock after a refresh in another tab
- `src/agent/external-bridge-runtime.ts`: `markTerminal` ends the session in memory in a `finally`, so a failed proposal-store or run-ledger write (another tab took the run's lease) no longer leaves it `drafting`. Before, the agent's `discard_edit_session` threw and every `begin_edit_session` was refused ("an edit session is already active") until the editor tab was reloaded. Check: `src/reelsmith/agent/externalSessionLock.verify.ts` (registered in `test:reelsmith`).

## Faster, readable frame sheets for the agent
- `server/frame-grid.ts`: `tileContactSheet` sizes, pads and labels each cell in one ffmpeg run straight into its tile slot, six cells at once (it was four runs per cell in a row: a 20-cell sheet took 506 ms, now 64 ms). Without a `cellHeight`, mostly-portrait frames get 9:16 cells, so `view_timeline_frames` on a 9:16 reel and `view_asset_frames` on phone clips no longer return ~100 px slivers. `jpegSize` moved here from our `selectionSheet.ts`. Check: `server/reelsmith/selectionSheet.verify.ts`.
- `server/plugins/extract-frames.ts`: extracts up to four frames at once, kept in time order.
- Our own: `server/reelsmith/selectionSheet.ts` decodes with VideoToolbox on macOS, 8 frames in flight, and tiles the sheets in parallel (the director's 80 cells of 20 HEVC phone clips: 14.2 s → 3.4 s; frames bit-identical). `directorTools.ts` warms shot tags while the agent plans; `director/review.ts` no longer calls two moments of one clip a repeat.

## Black section in director reels (shared decoder runs painted under everything)
- `src/editor/TimelineComposition.tsx`: a `SharedVideoVisualGroup` (consecutive same-source clips sharing one decoder, upstream a3c6d66d) is painted at its first clip's place in the bottom-to-top order instead of before every other item. Painted first, it sat under the director's black canvas on the lowest track, so any run of contiguous moments of one clip (`#1@3.2` then `#1@4.2` in a 1-beat cut) rendered black in the Player, the agent's review frames and the export. Still present upstream as of 2026-10-20. Check: `server/reelsmith/sharedGroupLayer.verify.ts` (a real render; registered in `test:reelsmith`).

## Freeze frames and restyling one line
- `src/agent/external-tool-policy.ts`: `reels_freeze_frame` and `reels_restyle_text` added to the Reelsmith edit tools. `assets/agent/openchatcut-tool-schemas.json`: regenerated. `package.json`: registers the new verifies in `test:reelsmith`.
- Our own: `server/reelsmith/stillFrame.ts` and the `/api/reelsmith/still-frame` route (a still of one moment, saved next to the video), `src/reelsmith/agent/{freezeFrameTool,restyleTextTool}.ts`, `stillFrame` on `AnalyzeApi`, `tagLine` in `assembleDirector.ts` (every item of a line carries `rsLine`, `rsLineText`, `rsTextStyle`), the reels-director skill and reels prompt.

## Graphics drawn in code (RS-1213)
- `src/agent/external-tool-policy.ts`: `reels_custom_graphic` added to the Reelsmith edit tools. `assets/agent/openchatcut-tool-schemas.json`: regenerated. `package.json`: registers `director/graphics.verify.ts` in `test:reelsmith`.
- Our own: `src/reelsmith/director/{graphics,graphicsKit,graphicsTravel,graphicsSocial,customGraphics}.ts`, `src/reelsmith/agent/customGraphicTool.ts`, `graphics` in `shared/reelsmith/directorPlan.ts`, new sound cues in `director/sfx.ts`, graphic findings in `director/review.ts`, `server/reelsmith/{graphics-sheet,director-reel}.mts`, the reels-director skill.


## Claude Opus 5.5 and Sonnet 5.5 in the Claude Code model picker
- `server/plugins/claude-code-agent.ts`: `claude-opus-5-5` and `claude-sonnet-5-5` added to `CURATED_MODELS` (the picker list is hardcoded, not read from the CLI).
- `shared/model-capabilities.ts`: `claude-opus-5-5` and `claude-sonnet-5-5` get the Claude Code 64k output cap like the other Claude models.

## Marker arrows aim at the person they name; a tighter cards-finale
- `scripts/sync-mediapipe.mjs`: pins `efficientdet_lite0.tflite` (MediaPipe object detector, "person" boxes), sha256-checked like the other models. `package.json`: registers `director/aimMarkers.verify.ts` in `test:reelsmith`.
- Our own: `src/reelsmith/peopleFinder.ts` (every person in a frame: a box per body plus the face when seen), `director/aimMarkers.ts` (after the build, each `annotate` with no x/y goes on the head of the person its `who` or label names; "bro" in a selfie is the person behind, not the selfie-taker), `shotAt` in `assembleDirector.ts`, the `who` param in `graphics.ts`. `cards-finale` (`moves.ts`): moves at 75%, idles mostly cut, extra section time holds the panorama; 10-12-24 beats.

## Director as a four-stage pipeline (RS-1214)
- `src/agent/external-tool-policy.ts`: `reels_director_treatment` and `reels_director_critique` (director stages 2 and 4, RS-1214) added to the read-only tool names.
- `server/claude-code/turn-runner.ts`: passes the turn's prompt to `resolveClaudeEffort`, so a Director box request runs at `high` effort.
- `package.json`: registers `director/shotLog.verify.ts` and `director/treatment.verify.ts` in `test:reelsmith`.

## Upstream sync 2026-10-21 (cherry-picked, not merged)
- Taken: `ae3a8c6d` (a split motion graphic continues its animation), `709947a9` (the Claude Code model picker lists what the CLI reports; `CURATED_MODELS` in `server/plugins/claude-code-agent.ts` gave way to `server/claude-code/models.ts`).
- `server/claude-code/models.ts` (ours on top of upstream's new file): the fallback list keeps `claude-sonnet-5-5` and `claude-opus-5-5`, which we had hand-added to the old list.
- Taken and reverted: `5cac33fa` (AAC encoder delay at render). RS-304's `server/reelsmith/audioPriming.ts` already removes the same priming after export; with both, exports ran 43 ms early (avsync fixtures).
- Skipped: Windows-only fixes (`526dbfb4`, `ee45a703`), Portuguese transcription (`d9b517ae`), bundled ffmpeg for generated media and skills (`097f87ae`, `15deadc9`; features Reelsmith does not use), README edits.

## Test discovery (2026-10-21)

- `package.json`: removed `test:pre`, `test:serial`, `test:post`, `test:reelsmith`, `test:contrib-timeline-preview` and the `verify:*` group scripts (kept: `verify:affected`, `verify:server-tool-catalog`, `verify:agent-skill`, `verify:model-persistence-restart`). Hand-listing verify files is gone.
- `scripts/verify-discovery.mjs` (new, force-added past the `/scripts/*` ignore): finds every `*.verify.*` file and picks its launcher.
- `scripts/run-tests.mjs`, `scripts/run-affected-verifies.mjs`: use discovery. `scripts/verify-registration.verify.mjs`, `scripts/verify-gate-coverage.verify.mjs`, `scripts/run-affected-verifies.verify.mjs`: rewritten for it.
- Expect conflicts in `package.json` on the next upstream sync: take ours, then add any new upstream verify to nothing (it is found automatically) unless it needs a `LAUNCHERS` entry.

## Imported GL Transitions (2026-10-21, RS-1215)

- `src/editor/transitionTypes.ts`: `GltTransitionId` joins `GlslTransitionType`; the ids, labels and order are spread in from `src/reelsmith/glTransitionsMeta.ts`; `defaultTransitionSeconds` falls back to the imported lengths.
- `src/gl/transitions.ts`: one spread entry that builds the imported transitions from `shaders/glt/frags.ts`.
- Ours, generated: `src/gl/shaders/glt/*`, `src/reelsmith/glTransitionsMeta.ts` (regenerate with `server/reelsmith/import-gl-transitions.mts`).

## Director: defects fixed in place, reference reel, motion rules, sound check (2026-10-22, RS-1216-1222)

- `src/agent/external-tool-policy.ts`: `reels_director_fix` added to the Reelsmith edit tools.
- `assets/agent/openchatcut-tool-schemas.json`: regenerated (`reels_director_fix`; `reference` on `reels_director_options`; `purpose` and `styleGuide` on `reels_director_treatment`).
- Ours: `src/reelsmith/agent/directorRepairTools.ts` (critique and fix, split out of `directorTools.ts`), `director/motionRules.ts`, `director/reference.ts`, `director/soundCheck.ts`, `director/storyThings.ts`; `director/directorSession.ts` saves the run on the canvas item (`rsDirector`).

## Reverse clip (2026-10-25, RS-1223)

- `src/components/timeline/ClipContextMenu.tsx`: one import line and a "Reverse" / "Play forwards" item next to "Detach audio" (calls `reversedSource` + `reverseActions` / `forwardsActions` from `src/reelsmith/clipOps.ts`).
- Ours: `server/reelsmith/reverseClip.ts` (route in `analyze-plugin.ts`), `server/reelsmith/reverseClip.verify.ts`, `server/reelsmith/reverseRender.verify.ts`.

## Upstream check 2026-10-25

- Not taken: `2ba98fbf` (AI SDK 7.0.148 and dependency upgrade), `0366d521` (tool calls on non-standard finish reasons; the bug starts at ai 7.0.70, we are on 7.0.52), `3d2e053e` (every URL in a download batch; only safe from ai 7.0.136, whose watchdog ignores tool time), `7fa4b790` (TypeScript 7, Remotion 4.0.537), `5b542cf7` (Doubao speaker IDs). Take the first four together as one dependency upgrade.

## Rewind, captions behind the speaker, speech cleanup (2026-10-25, RS-1223 / RS-502 / RS-204)

- `src/agent/external-tool-policy.ts`: `reels_reverse` and `reels_clean_speech` added to the Reelsmith edit tools.
- `assets/agent/openchatcut-tool-schemas.json`: regenerated (the two tools).
- `src/captions/types.ts`: `CaptionsData.rsBehind?: boolean` (one field).
- `src/editor/TimelineComposition.tsx`: the per-item paint (the body of `ordered.flatMap`) is now a named `paintItem`, unchanged; after the captions layer it paints `captionFrontItems(...)` (ours, `src/reelsmith/captionFronts.ts`) inside an `AbsoluteFill` with `zIndex: 2`, because the captions overlay has `zIndex: 1`. On a merge conflict, keep upstream's body and re-wrap it.
- Ours: `src/reelsmith/agent/{reverseTool,rewindClips,cleanSpeechTool}.ts`, `src/reelsmith/{captionFronts,speechCleanup}.ts`, the `rewind` move in `director/creatorMoves.ts`, `server/reelsmith/captionBehindRender.verify.ts`.
- Placing "Behind the speaker" on the speaker's head needs the clips and the canvas shape where the style is picked: `src/captions/CaptionStyleMenu.tsx` passes `scene` (items, fps, canvas) to `ReelsCaptionStyles`; `src/library/LibraryPanel.tsx` passes `canvasRatio` to `CaptionsPanel`, which passes it to `CaptionsControls` (one optional prop each), which passes `scene` to `ReelsCaptionStyles`.

## Upstream sync 2026-10-26: AI SDK, React 19.3, Vite 8.3, TypeScript 7, Remotion 4.0.537 (cherry-picked)

- Taken: `2ba98fbf` (AI SDK 7.0.148 and same-major tooling), `0366d521` (tool calls on non-standard finish reasons), `3d2e053e` (every URL in a download batch), `7fa4b790` (TypeScript 7.0.2, Remotion 4.0.537, i18n scans on `@babel/parser`). This closes the 2026-10-25 "not taken" list except `5b542cf7` (Doubao speaker IDs), still skipped.
- `package.json`: our scripts block kept; dependency blocks and the new `lint` flags taken from upstream. `package-lock.json` is upstream's (our dependencies were identical). `CHANGELOG.md`: ours kept (upstream's entries mention the skipped Doubao change).
- Remotion 4.0.537 shifts AAC audio by the encoder's 2048-sample delay itself (`aac-priming.ts`, since 4.0.531). `server/reelsmith/audioPriming.ts` now skips files whose "Made with Remotion x.y.z" comment is 4.0.531 or later (`remotionLeavesPriming`, `audioPriming.verify.ts`); fixing them again put every export 43 ms early (avsync).
- Remotion 4.0.537's bt709 filter is `zscale=matrix=709:range=limited:primariesin=709:primaries=709:transferin=709:transfer=709` (4.0.509 had `matrix=709:matrixin=709`). Frames still map exactly, but upstream's `video-decoder-render.verify.mjs` tells frames apart by colour against fixtures that are bt601 pixels tagged bt709, and with our bt709 tag it missed its 0.6 ratio by a hair (0.605). The verify sets `RS_RENDER_COLOR_SPACE=default` so it checks upstream's own colour path; ours is covered by `instagramFinalize.verify.ts`, `exportFixtures.verify.ts` and avsync. Against true RGB on testsrc2 the new filter is closer than the old one (MSE 148 vs 230), so exports did not get worse.
- On macOS, Remotion 4.0.537 downloads its own Chromium 157 headless shell (4.0.509 used Google's Chrome for Testing 149). Started from the `tsx` CLI, that build's GPU process dies at launch ("icudtl.dat not found in bundle") and renders fail with "Target closed"; from plain node, or `node --import tsx`, it works. The app (Vite, Electron, `cli/occ.mjs`) never uses the tsx CLI. `scripts/verify-discovery.mjs` runs every `tsx [--tsconfig X]` launcher as `[TSX_TSCONFIG_PATH=X] node --import tsx` (`viaNodeImport`), and avsync the same way; `scripts/verify-registration.verify.mjs` and `scripts/run-affected-verifies.verify.mjs` expect the new commands. Run render scripts by hand as `node --import tsx <file>`, not `npx tsx <file>`.
- RS-1232 (2026-10-28): `src/export/serverExportOperation.ts` `deliverSrtSidecar()` also calls `deliverReviewSheet` and (RS-1234) `deliverCover` (`src/reelsmith/exportCover.ts`, `<video>.cover.jpg`, "Also save a cover image") (ours, `src/reelsmith/exportReview.ts`) after delivery while the rendered file still exists: a contact sheet of the export, saved as `<video>.sheet.jpg` when "Also save a contact sheet" is on (default) and kept in memory for `reels_review_export`; it never fails the export. `src/agent/external-tool-policy.ts`: `reels_review_export` is a read tool. `assets/agent/openchatcut-tool-schemas.json`: regenerated.
- RS-1233 (2026-10-28): `src/agent/external-tool-policy.ts`: `reels_director_reshape` added to the Reelsmith edit tools. `assets/agent/openchatcut-tool-schemas.json`: regenerated.
- RS-1235 (2026-10-28): `shared/asr-models.ts`: `dtwPreset` on the small (`small`) and large-v3-turbo (`large.v3.turbo`) tiers, so the desktop worker times their words with whisper-cli DTW (the Apex path) instead of whisper-server's words; `desktop/native-asr-worker.ts`: comment only.
- 2026-10-28: `remotion/render.mjs`: `browserExecutable()` goes through `browserExecutableFor` (ours, `server/reelsmith/macChromeLauncher.mjs`). On macOS, Remotion 4.0.537's headless shell started directly by the app died on every composition load ("Target closed" / "browser has disconnected"), so stills, frame sheets and the agent's frame checks failed in the running app; started through a two-line `/bin/sh` launcher that execs it, it renders (0 → 3 of 3 stills in the same app). Elsewhere the path is unchanged.
- 2026-10-28: `src/agent/external-edit-session.ts` adds `rebaseUntouchedExternalEditSession`; `src/agent/external-run-ledger.ts` `executeDraftTool` uses it: a drafting session with no operations moves onto the live project instead of going stale (before the tool, and after a tool that drafted nothing). A user's "Direct my reel" right after importing 9 clips lost its first `reels_director_options` call to "became stale while ... was running" (the project changed as the import finished). Sessions with drafted edits keep strict staleness. Test: `src/agent/external-untouched-rebase.verify.ts`.
- RS-1238 (2026-10-28, photos that move): `src/gl/fx/uniforms.ts` `FxDef.needsDepth` (the shader reads `u_depth`, the photo's depth map, and `u_progress`/`u_hasDepth`). `src/gl/ClipFx.tsx`: a clip whose effects need depth loads `props.rsDepthSrc` (or, in the preview only, asks `/api/reelsmith/depth-map` for one through `src/reelsmith/depthMaps.ts`), waits for it like the matte (also during export), draws it with the same fit and crop as the picture and passes it; without one a flat grey stand-in. A clip with a depth effect draws at its own scale-up (`depthDetail`: the fill transform, at most 3x and 4096 px) instead of its contain box, and passes the on-screen part of the picture as `u_view` (`visibleWindow`, both in our `src/reelsmith/depthView.ts`); its `width`/`height` props became the box size. `src/gl/fxThumb.ts`: depth effects get a stand-in depth for the library thumbnail. `src/export/serverExportOperation.ts` `exportMedia`: before a video render, `withDepthMaps` attaches every depth effect's map to the export state (the render page has no `/api`). `shared/model-packs/catalog.ts`: the `depth-lite` pack and its settings page. `src/components/settings/settingsSchema.ts` / `settingsVendorPane.tsx`: Settings → Local models → Photo depth; `src/components/settings/LocalModelPackPane.tsx` exports `DepthModelPackPane` (that page's pack list and text). Ours: `server/reelsmith/{depthMap,depthMath}.ts` (route in `analyze-plugin.ts`), `src/gl/fx/{depthFx.ts,photo-parallax.frag}`, `src/reelsmith/director/depthMoves.ts`, the `depthMotion` option of `assembler/photoDump.ts`.
- RS-1248 (2026-11-02, faster imports): `server/media-normalization.ts`: `ProbeMeta.rotation` (clockwise, from our `clockwiseRotation`); `TranscodeVideoOptions` carries `inputPath`, `hasAudio`, `rotation`; `encodeTranscodedVideo` first tries `encodeOnVideoToolbox` (decode, scale_vt scale and HDR tone map, transpose_vt rotation and h264_videotoolbox on the GPU, through `server/reelsmith/vtNormalize.ts`) and falls back to the CPU path on any failure. It needs an ffmpeg with scale_vt and transpose_vt (7.1+): the bundled ffmpeg-static is 6.0, so a Homebrew ffmpeg is used when present; `REELSMITH_VT_NORMALIZE=0` turns it off. `server/media-normalization-runner.ts` `createNormalizePlan`: a master-quality re-encode is capped at 2560 px on the long side (`capImportSize`, `server/reelsmith/importSize.ts`; `REELSMITH_IMPORT_MAX_PX`), with the bitrate scaled by the pixel count.
- RS-1249 (2026-11-02): `assets/agent/openchatcut-tool-schemas.json`: regenerated (treatment `shotList`, plan `shotList`, section `speed`).

## Upstream sync 2026-11-02: bundled ffmpeg/ffprobe everywhere (cherry-picked)

- Taken: `097f87ae` (voice, sound, music, video, sonilo and isolate-voice media land through `ffmpegBin()`/`ffprobeBin()`, new gate `scripts/media-binary-spawn.verify.mjs`, `server/plugins/voice-media.verify.ts`) and `15deadc9` (`server/plugins/skill-exec.ts` gives skills the bundled ffmpeg/ffprobe). Before them, a packaged app opened from Finder (PATH `/usr/bin:/bin:...`) failed generated media with `spawn ffprobe ENOENT` after the provider had billed. `package.json`: ours kept; our runner discovers the new verifies, no script edit needed.
- The gate has no allowlist, so our `server/reelsmith/` call sites moved to `ffmpegBin()`/`ffprobeBin()` too (`beatDetect.ts` runs in the app; the rest are dev scripts and fixtures).
- Still not taken: `5cac33fa` (AAC encoder delay, reverted in `bb2a9321`, ours does it), `d9b517ae` (Portuguese ASR), `ee45a703`/`526dbfb4` (Windows only), `5b542cf7` (Doubao), README "Pro" links.
- `server/media-binaries.ts` `whisperCliBin()`: reads `process.resourcesPath` through a local cast. The server tsconfig has no Electron types, so `tsc -b` (and with it `npm run build` / `desktop:dist`) failed with TS2339 on those two lines.

## Faster test loop (2026-11-02)

- `scripts/run-affected-verifies.mjs`: selection follows a reverse import graph (our `scripts/import-graph.mjs`) instead of the nearest directory; the directory rule is only the fallback for files nothing reaches. `shared/` and imported `assets/` files are no longer automatic full-gate refusals; top-level and `reelsmith-docs/` Markdown count as docs; skill folder files select the skill suites plus the tool-catalog check; `EXTRA_COMMANDS` are selected like suites. Runs through the shared pool in our `scripts/verify-timings.mjs`.
- `scripts/run-affected-verifies.verify.mjs`: directory-count assertions replaced by graph assertions (cross-directory importers selected, narrower than the directory, skills/schemas/docs covered, runner tables not consumers); the fixture repo is a Git repo before selecting and copies the two new modules.
- `scripts/run-tests.mjs`: `--fast` leaves out `SLOW_VERIFIES`; longest-first order comes from recorded timings (`node_modules/.cache/reelsmith/verify-timings.json`) instead of the hand-kept `SLOW_FIRST` list.
- `scripts/verify-discovery.mjs`: `SLOW_VERIFIES` + `isSlowSegment`; `EXTRA_COMMANDS` gains `generate-tool-catalog.mts --check`.
- `package.json`: `test:fast` script; `verify:affected` defaults to 8 parallel like `npm test`.
- `.gitignore`: `!/scripts/import-graph.mjs`, `!/scripts/verify-timings.mjs`.
- `server/media-normalization.ts`: our RS-1248 `encodeOnVideoToolbox` moved to `server/reelsmith/vtNormalize.ts` (takes the normaliser's runner as a callback); the file was over the 500-line gate.
- `server/outbound-proxy.verify.ts`, `server/xai-oauth-session.verify.ts` (chdir to the fixture), `server/plugins/import-url-errors.verify.ts`, `desktop/embedded-project-store-http.verify.ts` (isolated dev profile id): they wrote the checkout's real `.env.local` through `setKeys` (import-url-errors cleared `UI_LOCALE`), which also made Vite-based suites restart mid-run and fail at random.


## RS-1251 (2026-11-02): export size and fps from submit_export

- `src/generate/media-export.ts`: `applyExportGeometry` (set the canvas height to the preset and the timeline fps to the override) replaced by `exportOutputGeometry`, which only reports the output size; `resolution` and `fps` now go to `/export`, which scales by the shorter side and retimes. A 9:16 reel at 1080p came out 608x1080, laid out on a smaller canvas, and a 60 fps timeline exported at 30 played at half speed.
- `src/generate/media-export.geometry.verify.ts`: asserts the new behaviour (9:16 at 1080p is 1080x1920; the timeline's own size and rate without overrides).
- `assets/agent/openchatcut-tool-schemas.json`: regenerated (plan `voiceover`, `voiceoverStart`, `captions`).
