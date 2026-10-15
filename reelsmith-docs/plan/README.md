# Reelsmith: a local-first AI Reels editor for Mac (planning package)

Prepared 2026-10-15. This package holds **planning and specification documents only**. It contains no application code.
"Reelsmith" is a placeholder codename. The project is independent of, and not affiliated with, Cardboard Inc.

## Start here
1. **`cardboardrebuild.txt`**: the complete, self-contained specification. Hand this to a developer or coding agent.
2. `01_feature-inventory-and-roadmap.md`: 119 Cardboard-inspired capabilities with public source links, each assigned to R1/R2/R3/EXP/OPT-PAID/OOS.
3. `02_feature-inventory.csv`: the same inventory in machine-readable form.
4. `research/03_research-notes.md`: method, what was and wasn't accessible, license checks, secondary sources.
5. `diagrams/04_architecture-diagrams.md`: 11 Mermaid diagrams (context, processes/IPC, packages, data model, flows, state machines).
6. `research/05_cardboard-changelog-digest.md`: index of all 45 changelog entries (2025-11-09 → 2026-10-05), with section headings and collapsed-bullet labels.
7. `research/06_cardboard-recipe-catalog.md`: metadata for all 80 public Cardboard recipes (inputs, aspect, availability).
8. `schemas/`: JSON Schemas for the project file, recipes, edit operations, plus the agent (MCP) tool contract.
9. `examples/`: an example project, an example agent edit batch, and the five R1 recipes as JSON.

## Folder layout
```
CardboardRebuild_ReelsEditor_Plan_2026-10-15/
├── README.md
├── cardboardrebuild.txt
├── 01_feature-inventory-and-roadmap.md
├── 02_feature-inventory.csv
├── research/
│   ├── 03_research-notes.md
│   ├── 05_cardboard-changelog-digest.md
│   └── 06_cardboard-recipe-catalog.md
├── diagrams/
│   └── 04_architecture-diagrams.md
├── schemas/
│   ├── project.schema.json
│   ├── recipe.schema.json
│   ├── edit-ops.schema.json
│   └── agent-tools.json
├── examples/
│   ├── project.example.json
│   ├── edit-ops.example.json
│   └── recipes/ (5 × *.recipe.json)
└── CardboardRebuild_ReelsEditor_Plan_2026-10-15.zip   (this whole package)
```

## Checks performed while preparing this package
- Cardboard changelog: all 45 entries reviewed, including the collapsed "Improvements" and "Fixes" sections (426 bullets). There is no pagination.
- JSON: every file parses. The example project, the 5 recipes and the edit batch validate against their schemas (Ajv 8, JSON Schema 2020-12, strict mode). 8 deliberately invalid inputs were correctly rejected.
- Diagrams: all 11 Mermaid blocks pass the mermaid 11 parser. This is a syntax check only.
- Time base: exact flick values for all listed frame and sample rates were computed.
- Local Mac facts were read with read-only commands: CLI versions, login status, hardware.
- **Not done:** no app code was written or run, and no media benchmarks were performed. Items marked [UNVERIFIED] in the spec must be confirmed in Phase P0 spikes.

## Important caveats
- The rules for using Claude and ChatGPT subscriptions through CLIs changed several times in 2026. Re-check spec §4.3 before building and before sharing the app with anyone.
- Effort figures are planning ranges, not promises.
