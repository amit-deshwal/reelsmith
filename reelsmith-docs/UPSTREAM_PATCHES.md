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
