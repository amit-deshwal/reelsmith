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

## Not found
No analytics/telemetry SDKs, no Google Fonts or CDN `<link>`/`<script>` in `index.html`, no remote fonts in `src/index.css`.
`report_user_friction` only writes to local `localStorage`.
Native workers set `env.allowRemoteModels = false`.

## Left to verify at runtime
The static scan can't prove absence for the browser. Before ticking RS-003, run a session in Chrome with DevTools → Network
(filter "not localhost") through import → edit → export and confirm the list is empty. Log the result below.

- [ ] Runtime check done on: (date) ______
