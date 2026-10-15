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
