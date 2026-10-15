# Architecture diagrams (Reelsmith)

The diagrams use Mermaid. They render on GitHub, in VS Code with a Mermaid extension, and at https://mermaid.live. Plain-text (ASCII) versions of the process diagram and data flows are in `../cardboardrebuild.txt` §7 and §21, so the spec stands alone.
Every diagram shows **our independent design** [RECOMMENDATION], not Cardboard's architecture.

> Check performed (2026-10-15): all 11 blocks passed `mermaid.parse()` (mermaid 11, under jsdom). That is a **syntax check only**: the diagrams were not visually rendered or reviewed as images. If one renders badly, the ASCII equivalent in the spec is authoritative.

---

## 1. System context: what stays local and what leaves the Mac

```mermaid
flowchart LR
  subgraph Mac["Your Mac (everything below runs locally)"]
    U([You]) --> APP[Reelsmith app]
    APP <--> FILES[(Footage, music, photos<br/>on disk)]
    APP <--> BUNDLE[(Project bundles<br/>*.reelproj)]
    APP <--> CACHE[(Caches: proxies, PCM,<br/>thumbnails)]
    APP -- spawns --> CC[claude CLI<br/>your login]
    APP -- spawns --> CX[codex CLI<br/>your login]
    CC -- MCP stdio --> SHIM[reel-mcp shim]
    CX -- MCP stdio --> SHIM
    SHIM -- Unix socket + token --> APP
  end
  CC -- "prompts, tool results,<br/>small JPEG frames" --> ANT[(Anthropic<br/>your plan)]
  CX -- "prompts, tool results,<br/>small JPEG frames" --> OAI[(OpenAI<br/>your plan)]
  APP -. "optional one-time<br/>model download (SHA-256 pinned)" .-> HF[(Model host)]
```

## 2. Processes and IPC

```mermaid
flowchart TB
  MAIN["Electron MAIN (thin)<br/>windows, menus, IPC router,<br/>ProjectService = single writer,<br/>reelmedia:// protocol"]
  REN["Renderer: Editor UI (React)<br/>+ Compositor Worker (WebGL2, OffscreenCanvas)<br/>+ AudioWorklet mixer"]
  EXP["Hidden Renderer: ExportWindow<br/>same compositor, no frame drops,<br/>WebCodecs VideoEncoder"]
  MED["utilityProcess: MediaService<br/>job queue -> ffmpeg / ffprobe /<br/>whisper-cli / reelhelper (Swift)"]
  AGT["utilityProcess: AgentService<br/>adapters (claude, codex), event normaliser,<br/>UDS bridge server"]
  MCP["reel-mcp shim (stdio MCP server)<br/>spawned by the agent CLI"]
  CLI["claude -p / codex exec<br/>(your unmodified CLI)"]

  REN <-- "typed IPC (contextBridge, Zod-validated)" --> MAIN
  EXP <-- "typed IPC" --> MAIN
  MAIN <-- "MessagePort" --> MED
  MAIN <-- "MessagePort" --> AGT
  AGT -- "spawn (argv, minimal env)" --> CLI
  CLI -- "stdio MCP" --> MCP
  MCP -- "Unix socket 0600 + per-turn token" --> AGT
```

## 3. Package dependencies (dependencies point downward only)

```mermaid
flowchart TB
  ui[ui renderer] --> rg[render-graph]
  ui --> ops[core-ops]
  exp[export] --> rg
  exp --> cw[compositor-webgl]
  exp --> ae[audio-engine]
  exp --> ev[export-validate]
  cw --> rg
  ps[project-service] --> ops
  ps --> st[storage]
  rc[recipes] --> ops
  rc --> an[analysis]
  ab[agent-bridge] --> ops
  ab --> mcp[mcp-server]
  tr[transcription] --> mp[media-pipeline]
  an --> mp
  rg --> cm[core-model]
  ops --> cm
  cm --> ct[core-time]
  ae --> ct
  st --> cm
```

## 4. Data model (simplified)

```mermaid
classDiagram
  class Project {
    schemaVersion
    id
    name
    revision
    settings
  }
  class MediaRef {
    id
    kind
    source_path_fingerprint
    probe
  }
  class Track {
    id
    kind
    magnetic
    items
  }
  class Item {
    id
    type
    timelineStartFl
    durationFl
    itemRev
    origin
  }
  class Transition {
    fromItemId
    toItemId
    type
    durationFl
  }
  class Captions {
    enabled
    styleId
    segments
  }
  class BeatGrid {
    mediaId
    bpm
    userOffsetFl
    analysisFile
  }
  class RecipeRun {
    recipeId
    version
    assembler
    seed
  }
  Project "1" --> "*" MediaRef
  Project "1" --> "*" Track
  Track "1" --> "*" Item
  Project "1" --> "*" Transition
  Project "1" --> "1" Captions
  Project "1" --> "*" BeatGrid
  Project "1" --> "0..1" RecipeRun
  Item ..> MediaRef : mediaId
```

## 5. Import pipeline (per file)

```mermaid
flowchart LR
  A[fingerprint] --> B[probe ffprobe]
  B --> C[thumbnail]
  B --> D[proxy H.264 1280px<br/>HDR->SDR tone map once]
  B --> E[PCM 48k float]
  E --> F[waveform peaks]
  D --> G[analysis: shots, scores,<br/>saliency, faces]
  E --> H[transcript whisper.cpp<br/>if speech]
  E --> I[beat grid<br/>if music]
  G --> J[(bundle/analysis/*.json)]
  H --> J
  I --> J
```

## 6. Recipe assembly (optional agent selection)

```mermaid
sequenceDiagram
  participant UI as Setup UI
  participant RS as RecipeService
  participant AN as Analysis
  participant AG as AgentService
  participant CLI as Agent CLI
  participant PS as ProjectService
  UI->>RS: assemble(recipe, inputs, params)
  RS->>RS: validate recipe and inputs (schema + semantics)
  RS->>AN: ensure beats, transcripts, scores
  AN-->>RS: analysis ready
  RS->>RS: compute slots and candidate segments
  alt AI selection on
    RS->>AG: start selection turn (hints, slots, candidates)
    AG->>CLI: spawn with reel MCP
    CLI->>AG: contact_sheet(...)
    CLI->>AG: propose_selection(section, picks)
    AG->>RS: picks
    RS->>RS: validate picks, fill gaps heuristically
  else AI off or failed
    RS->>RS: heuristic selection
  end
  RS->>PS: op batch (source=recipe)
  PS->>PS: validate invariants, commit rev N, journal
  PS-->>UI: patches + summary + lint report
```

## 7. Chat edit turn

```mermaid
sequenceDiagram
  participant User
  participant UI as Chat UI
  participant AG as AgentService
  participant CLI as claude -p / codex exec
  participant MCP as reel-mcp
  participant PS as ProjectService
  User->>UI: "slower intro, title on first downbeat"
  UI->>AG: send(message, context block)
  AG->>AG: create turnId + token, write mcp config
  AG->>CLI: spawn (resume session)
  CLI->>MCP: initialize (stdio)
  MCP->>AG: connect UDS + token
  CLI->>MCP: get_timeline(0-5s), get_beats
  MCP->>AG: forward
  AG->>PS: read
  PS-->>CLI: data (via AG and MCP)
  CLI->>MCP: apply_ops(baseRevision N, ops)
  MCP->>AG: forward
  AG->>PS: validate and commit (rev N+1, agentTurnId)
  PS-->>UI: patches (live preview update)
  CLI->>MCP: lint_timeline, render_frames
  CLI-->>AG: final result event
  AG->>AG: revoke token, end turn
  AG-->>UI: summary + Revert this turn
```

## 8. Export and validation

```mermaid
flowchart LR
  S[Snapshot rev R] --> M[Ensure mezzanines<br/>for HDR or non-WebCodecs sources]
  M --> V[Render frames 0..N-1<br/>RenderGraph + WebGL2, no drops]
  V --> VE[VideoEncoder H.264 HW]
  S --> AU[Offline mixer 48k<br/>exact sample count]
  AU --> LN[Loudness -14 LUFS<br/>limiter -1 dBTP]
  LN --> AE[AAC encode<br/>WebCodecs or FFmpeg aac]
  VE --> MX[Mux MP4 faststart<br/>rational timestamps, edit list]
  AE --> MX
  MX --> VAL{Validate V1-V9}
  VAL -- pass --> OUT[Atomic rename to destination]
  VAL -- fail --> FB[Keep .failed.mp4<br/>offer safe-encoder retry]
```

## 9. Agent turn state machine

```mermaid
stateDiagram-v2
  [*] --> Idle
  Idle --> Starting: send
  Starting --> Running: CLI init ok and reel MCP connected
  Starting --> Failed: CLI missing, auth, or MCP not connected
  Running --> Running: tool call or ops commit
  Running --> Cancelling: Stop or timeout
  Cancelling --> Cancelled: exit after SIGINT, SIGTERM, or SIGKILL
  Running --> Completed: result event
  Running --> Failed: error or rate limit
  Completed --> Idle
  Cancelled --> Idle
  Failed --> Idle
```

## 10. Media job state machine

```mermaid
stateDiagram-v2
  [*] --> Queued
  Queued --> Running
  Running --> Done
  Running --> Failed
  Running --> Cancelled
  Failed --> Queued: auto retry once if transient
  Failed --> [*]
  Done --> [*]
  Cancelled --> [*]
```

## 11. Bundle and storage layout

```mermaid
flowchart TB
  subgraph Bundle["MyReel.reelproj (portable)"]
    PJ[project.json]
    JR[journal/*.jsonl]
    SN[snapshots/*.json.gz]
    ANL[analysis/*.json]
    CH[chat/conversation.jsonl]
    MD[media/ optional collected]
  end
  subgraph Caches["~/Library/Caches/Reelsmith (rebuildable)"]
    PX[proxy.mp4 / mezz.mp4]
    PCM[audio48k]
    TH[thumbs, peaks]
  end
  subgraph Support["~/Library/Application Support/Reelsmith"]
    DB[(library.sqlite index)]
    MO[models/ whisper]
    RUN[run/ sockets]
  end
```
