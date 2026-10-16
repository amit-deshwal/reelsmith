# Network audit (RS-003)

Method: static scan of every `http(s)://` host in `src/ server/ desktop/ shared/ remotion/ index.html`
(excluding `*.verify.ts`), then a trace of what triggers each one. Re-run with `npx tsx src/reelsmith/network-audit.verify.ts`.

## Verdict
With no keys configured, nothing in import → edit → export contacts the network on its own.
Every outbound path is one of: (a) a user-pressed button, (b) gated by a key the user pasted, or (c) a build-time download.

## Classes of outbound calls
| Class | Hosts | Trigger | Default |
|---|---|---|---|
| Update check | api.github.com (`src/ui/upstreamUpdate.ts`), electron-updater feed | automatic in upstream | **Off** (RS-001, `UPDATE_CHECKS_ENABLED=false`, `enabled:false` in `desktop/main.ts`) |
| Local model downloads (ASR, rhythm, CLAP, visual semantics) | modelscope.cn, huggingface.co, hf-cdn.sufy.com, hf-mirror.com via `server/plugins/hf-proxy.ts` | Settings → Local models "install" button, or the semantic-search "download" prompt | Opt-in. Warm-up only loads packs already installed (`useInferenceWarmup.ts`), never downloads. The browser/Electron workers talk only to the local `/api/hf-proxy`. |
| LLM providers | api.openai.com, api.anthropic.com, openrouter.ai, deepseek, mistral, google, x.ai, etc. (`shared/llm-providers.ts`) | needs an API key in Settings | Off without a key |
| Media/voice/music generation | elevenlabs, fish.audio, sonilo, mureka, wavespeed, kling, minimax, groq, assemblyai, deepgram, cartesia, inworld, speechify, fal.ai, bytedance, atlascloud | needs a key | Off without a key |
| Stock media / web | api.pexels.com, api.unsplash.com, pixabay.com, freesound.org, api.firecrawl.dev | key (Pexels/Unsplash/Freesound/Firecrawl) | Off without a key |
| Publishing | api.upload-post.com | key + user action | Off |
| Key probes | provider hosts above (`server/key-probes.ts`) | when the user saves a key | Off |
| Skill install | api.github.com / git clone (`server/plugins/skill-install.ts`) | the `install_skill` agent tool, user-initiated | Opt-in |
| xAI OAuth | auth.x.ai | explicit sign-in | Opt-in |
| Build time only | storage.googleapis.com chrome-for-testing (`desktop/prepare-target.mts`) | `npm run desktop:*` packaging | Not at runtime |
| Links only (no request) | github.com, openchatcut.com (`DashboardHeaderLinks.tsx`, `ExtensionCenter.tsx`) | user click opens browser | n/a |

## Found later: Google Fonts at render time (fixed 2026-10-16)
Text using a catalog font (Anton, Inter, Playfair Display, …) was loaded through `@remotion/google-fonts`, i.e. from
fonts.googleapis.com / fonts.gstatic.com, in the preview and during export. The static scan missed it because the URLs
live inside the npm package. Fix: the Latin families plus Noto Sans Devanagari and Poppins are bundled under
`assets/fonts/rs/` (`server/reelsmith/sync-fonts.mts`) and registered as local fonts, so `ensureFont` never reaches the
Google loader for them. The four CJK families without local assets (LXGW WenKai TC, Noto Serif SC/TC,
ZCOOL QingKe HuangYou) are no longer selectable. Existing projects naming them use the browser's
fallback font unless that family is installed on the machine. The audit guard checks that every
remaining catalog family has a bundled face.

## Not found
No analytics/telemetry SDKs, no Google Fonts or CDN `<link>`/`<script>` in `index.html`, no remote fonts in `src/index.css`.
`report_user_friction` only writes to local `localStorage`.
Native workers set `env.allowRemoteModels = false`.

## Runtime check (2026-10-16)
`src/reelsmith/network-runtime.verify.ts` used Chromium's `Network.requestWillBeSent` events against the
live local editor at `localhost:5199`, so requests blocked by CORS are included. With no provider keys
used, a generated 2 s H.264/AAC fixture was imported into a new project, placed on its timeline, and
exported. The export completed (60/60 frames, automatic quality check: 0 errors, 0 warnings).
The trace contained **zero non-local browser requests** from page load through export completion.
A separate run against an existing 14.5 s project also exported with zero non-local browser requests.

Scope: this is a browser request trace combined with the static server call-site audit above; it does
not packet-capture child processes. The fixture run saw local `/api/waveform` and `/api/filmstrip`
HTTP 500 responses; those affected timeline decoration, not export or the network verdict.
