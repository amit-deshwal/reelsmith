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
