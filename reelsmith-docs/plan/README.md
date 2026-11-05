# Reelsmith planning package (2026-10-15)

The documents written before any code: a feature inventory, research notes, architecture diagrams, JSON schemas and example recipes. They describe the original recipe-based design; the product has since moved to **director mode** (see the main [README](../../README.md)). Where these documents and the code disagree, the code and the README win.

Reelsmith is independent of, and not affiliated with, any other Reels editor. The original long-form specification is kept private.

## Contents
1. `01_feature-inventory-and-roadmap.md`: the capability inventory, each item assigned to a release (R1/R2/R3/EXP/OPT-PAID/OOS).
2. `02_feature-inventory.csv`: the same inventory in machine-readable form.
3. `research/03_research-notes.md`: method, what was and wasn't accessible, license checks, secondary sources.
4. `diagrams/04_architecture-diagrams.md`: 11 Mermaid diagrams (context, processes/IPC, packages, data model, flows, state machines).
5. `schemas/`: JSON Schemas for the project file, recipes, edit operations, plus the agent (MCP) tool contract.
6. `examples/`: an example project, an example agent edit batch, and example recipes as JSON.

## Checks performed while preparing this package
- JSON: every file parses. The example project, the recipes and the edit batch validate against their schemas (Ajv 8, JSON Schema 2020-12, strict mode). 8 deliberately invalid inputs were correctly rejected.
- Diagrams: all 11 Mermaid blocks pass the mermaid 11 parser.
- Effort figures were planning ranges, not promises.
