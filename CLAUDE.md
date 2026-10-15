# Reelsmith: notes for coding agents

Reelsmith is a private, personal fork of OpenChatCut (AGPL-3.0). Its goal is an Instagram Reels editor driven by recipes, with optional Claude/Codex chat edits.

- **The backlog is `README.md`** ("Features we need to add", items RS-xxx). Work in milestone order (M0 first) unless the user says otherwise. Tick boxes in README.md when an item's acceptance check passes.
- The background spec, schemas and example recipes are in `reelsmith-docs/plan/`. Where the spec and OpenChatCut's existing design differ, follow OpenChatCut unless README.md says otherwise.
- The upstream project README is `UPSTREAM_README.md`. The `upstream` remote is https://github.com/0xsline/OpenChatCut.
- Put new code in our own folders (`src/reelsmith/`, `server/reelsmith/`, `shared/reelsmith/`, `recipes/`, `src/agent/skills/reels-*`). Keep edits to upstream files minimal, and log each modified upstream file in `reelsmith-docs/UPSTREAM_PATCHES.md`.
- Node 24.x only (`.nvmrc`). Dev: `npm run desktop:dev` or `npm run dev`. Tests: `npm test`, `npm run verify:affected`. New logic gets a `*.verify.ts` next to it, following upstream convention.
- Never handle Claude.ai/ChatGPT credentials or tokens. Agents run only through the user's own `claude`/`codex` CLIs, with editor-only tools.
