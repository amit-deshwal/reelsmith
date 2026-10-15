# Upstream files modified by Reelsmith

Every OpenChatCut file we change goes in this table, so `git merge upstream/main` conflicts are expected and quick to resolve.

| File | Change | Why | Since |
|---|---|---|---|
| `README.md` | Renamed to `UPSTREAM_README.md`; new Reelsmith README added | Project backlog lives in README | 2026-10-15 |
| `.gitignore` | Appended `!CLAUDE.md` exception at end of file | Upstream ignores CLAUDE.md; this fork tracks its agent guide. Reelsmith docs live in `reelsmith-docs/` because upstream ignores `docs/` | 2026-10-15 |
