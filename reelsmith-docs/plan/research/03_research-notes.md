# Research notes and source log

Research date: **2026-10-15** (all pages fetched that day). Researcher: Claude (Claude Code session), for the project owner.
This file records **what was checked, how it was checked, and what remains unverified**. The design conclusions were in the original specification (kept private).

---

## 1. Method

| Step | How | Result |
|---|---|---|
| Cardboard pages | `curl` of raw HTML for `/`, `/changelog`, `/recipes`, `/pricing`, `/desktop`, `/recipes/guides`, `/hard-problems`, `robots.txt`, `sitemap.xml`, `llms.txt`; a Python text extractor; the Next.js RSC payload (`self.__next_f.push`) decoded to recover hidden content; Markdown variants fetched with `Accept: text/markdown`, which the site documents in llms.txt | Done |
| Changelog completeness | Counted the page's own index (45 date labels), the `release` numbers in the payload (1–45, 45 unique), and the slugs (45 unique, 2025-11-09 → 2026-10-05). Looked for pagination links or "load more" | 45/45. **No pagination exists** |
| Collapsed sections | "Improvements" and "Fixes & housekeeping" bullets are absent from the visible HTML; they were extracted from `<ToggleContent>` blocks in the payload | 426 bullets across 45 entries |
| Recipes | Recipe objects (`id, slug, name, description, category, inputs, aspectRatio, length, onWeb, onMac, poster/preview URLs`) parsed from the payload | 80 recipes |
| Cross-check | WebFetch summariser on `/changelog`, compared with our extraction (same 45 entries, same dates and titles) | Consistent |
| Official AI-integration rules | WebFetch of Anthropic docs (legal-and-compliance, headless, cli-reference, agent-sdk overview), Anthropic Help Center, OpenAI Codex docs (auth, non-interactive, app-server, codex-sdk, sign-in-with-chatgpt) | Quotes in spec §4.3 |
| Local CLI facts | `claude --version` → 2.1.300; `claude auth status` → loggedIn true, authMethod `claude.ai`, subscriptionType `pro`; `codex --version` → 0.154.0; `codex login status` → "Logged in using ChatGPT"; `codex exec --help`, `codex features list`, `codex app-server --help`. No model calls were made | Read-only checks |
| Hardware | `sw_vers` (macOS 26.1), `sysctl` (Apple M5, 24 GB), `df` (~725 GB free); `ffmpeg` not installed; Node 25.6.1 and Homebrew present | Recorded as assumption A1/A2 |
| Licenses | GitHub REST API `license.spdx_id` for 30 repos; raw LICENSE/README files where SPDX was `NOASSERTION` (madmom, CoTracker, Remotion, MCP SDK, beat_this); Hugging Face model API `license:` tags for weights | Table in spec §19 and below |
| Schema checks | Ajv 8 (draft 2020-12, strict mode) installed in a scratch directory; 7 positive and 8 negative tests | All passed |
| Time-math check | Python `fractions` exact computation of flicks per frame and per sample | All integer |

## 2. Inaccessible or not reviewed (disclosed)

- **FAQ answers** on `/desktop` and `/pricing`. The questions are visible ("Does Cardboard work on Intel Macs?", "Where does my footage go?" and others), but the answers are client-rendered and were not in the fetched HTML or payload. **Not reviewed.**
- Hero videos and images in changelog entries, recipe poster and preview videos. **Not analysed** (they are Cardboard assets).
- Anything behind login, including the Cardboard app itself, its network traffic and binaries. **Not examined.**
- Blog posts (listed in the sitemap). **Not reviewed.** They are marketing and tutorial content, not product release notes.
- A Cardboard agent skill (`~/.claude/skills/cardboard`) is installed on this Mac. Only its header was opened to identify it. It documents Cardboard's own CLI and project format, which this plan **deliberately does not reuse**.
- Individual recipe pages: only `/recipes/travel-vlog`, `/recipes/mini-vlog-guide`, `/recipes/travel-collage-guide` and the travel-vlog guide were read in full. The other 77 recipes are covered by their structured metadata only.

## 3. Evidence classes used in the deliverables

| Class | Meaning | Example |
|---|---|---|
| VERIFIED | Read in a primary source today | "Mac app launched 2026-09-28 with bring-your-own Claude/Codex" (changelog #44) |
| INFERRED | Our reading, not stated outright | "Cardboard's Mac app likely drives the user's installed Claude Code", based on the "Every Claude model… your Claude Code can run" fix note |
| RECOMMENDATION | Our design choice | Flicks time base; ops-only MCP tools; Electron Option A |
| ASSUMPTION | Planning premise | Instagram safe-zone sizes; typical footage |
| UNVERIFIED | To be confirmed in a spike | Codex `--disable shell_tool` effect; whisper.cpp exact flags; WebCodecs AAC encode on macOS |

**Cardboard internals are unknown.** We infer nothing about their code beyond what their pages state. Two facts are public: the web app uses "a custom WebGL2 compositor and a WebCodecs decoder" (llms.txt), and Cardboard calls browser NLE performance a hard problem (hard-problems).

## 4. Key verified facts by topic

### 4.1 Cardboard public facts (selection)
- 45 releases, roughly weekly, from 2025-11-09 to 2026-10-05 (changelog).
- Mac app (Apple Silicon) with "Bring your own Claude or Codex agent" and "Your footage stays on your Mac" (#44, /desktop). /desktop: "Requires an eligible paid Claude or ChatGPT plan."
- Fix notes in #45: "Easier Claude sign-in. Got a code from Claude? Paste it in"; "Accurate limits. You only see a Claude limit warning when you've really hit it"; "Your files stay put. Agents only make changes inside your project."
- #44 fix notes: "Every Claude model. More models now lists everything your Claude Code can run"; "Codex keeps its cool… Reconnecting…"; "Only tools that work: Cloud-only tools like Auto Reframe stay out of the Mac app until they run there".
- llms.txt: "Cardboard has no public API." The site serves Markdown on request.
- Pricing (as of fetch): Lite $8/mo (free with the Mac app), Starter $29, Creator $59, Pro $175, with generative credits.

### 4.2 Subscription integration rules
See spec §4.3 for the full quotations. Summary:
- **Anthropic:** apps may not offer Claude.ai login or route requests through users' plan credentials, and must not collect or store tokens. An **end user may sign in to the unmodified Claude Code binary with their own subscription**. `claude -p`/Agent SDK usage currently draws from plan limits (the June 2026 change was paused). `--bare` does not use OAuth.
- **OpenAI:** `codex exec` reuses saved CLI auth. app-server auth was "never … permitted for commercial or hosted services", but local or open-source apps "can continue using it". Third-party "Sign in with ChatGPT" is a partner program.

### 4.3 License checks (raw results)

| Repo / model | Source | Result |
|---|---|---|
| ggml-org/whisper.cpp | GitHub API | MIT |
| openai/whisper | GitHub API | MIT |
| openai/whisper-large-v3-turbo | HF tag | license:mit |
| ggerganov/whisper.cpp (HF ggml weights) | HF tag | license:mit |
| argmaxinc/WhisperKit → argmaxinc/argmax-oss-swift | GitHub API (redirect) | MIT |
| FFmpeg/FFmpeg | GitHub API | NOASSERTION (FFmpeg is LGPL-2.1+ with optional GPL parts) |
| CPJKU/beat_this | GitHub API + README | MIT; README: "The code and the published model weights are released under the MIT license" |
| CPJKU/madmom | LICENSE | Source BSD-style; "All model and data files … Creative Commons Attribution-NonCommercial-ShareAlike 4.0" |
| aubio/aubio | GitHub API | GPL-3.0 |
| MTG/essentia | GitHub API | AGPL-3.0 |
| librosa/librosa | GitHub API | ISC |
| snakers4/silero-vad | GitHub API | MIT |
| facebookresearch/sam2 | GitHub API | Apache-2.0 |
| facebook/sam2.1-hiera-small | HF tag | apache-2.0 |
| facebookresearch/co-tracker | LICENSE.md | CC BY-NC 4.0 |
| mlfoundations/open_clip | GitHub API | NOASSERTION (review) |
| apple ml-mobileclip (moved to apple-aiml-research) | LICENSE / HF | Code MIT; MobileCLIP2 weights tag `apple-amlr` |
| google/siglip2-base-patch16-224 | HF tag | apache-2.0 |
| ZhengPeng7/BiRefNet | GitHub API + HF | MIT / mit |
| nvidia/parakeet-tdt-0.6b-v3 | HF tag | cc-by-4.0 |
| senstella/parakeet-mlx | GitHub API | Apache-2.0 |
| ml-explore/mlx | GitHub API | MIT |
| asg017/sqlite-vec | GitHub API | Apache-2.0 (project may also offer MIT; not verified) |
| electron/electron | GitHub API | MIT |
| tauri-apps/tauri | GitHub API | Apache-2.0 (project may also offer MIT; not verified) |
| remotion-dev/remotion | LICENSE.md | Remotion License (free for individuals / ≤3 employees; company license otherwise) |
| mltframework/mlt | GitHub API | LGPL-2.1 |
| Vanilagy/mediabunny | GitHub API | MPL-2.0 |
| modelcontextprotocol/typescript-sdk | LICENSE | Transition MIT → Apache-2.0 |
| openai/codex | GitHub API | Apache-2.0 |
| google-ai-edge/mediapipe | GitHub API | Apache-2.0 |
| Breakthrough/PySceneDetect | GitHub API | BSD-3-Clause |
| kkroening/ffmpeg-python | GitHub API | Apache-2.0 |
| facebookresearch/demucs | GitHub API | MIT |

Not checked yet (flagged in the spec): individual font files, Homebrew FFmpeg build options, local TTS candidates, diarization models.

## 5. Secondary sources (context only; not used to set rules)
- The Register, "Anthropic clarifies ban on third-party tool access to Claude" (2026-02-20): https://www.theregister.com/software/2026/02/20/anthropic-clarifies-ban-on-third-party-tool-access-to-claude/5014546
- WinBuzzer (2026-02-19): https://winbuzzer.com/2026/02/19/anthropic-bans-claude-subscription-oauth-in-third-party-apps-xcxwbn/
- Autonomee, Claude Code ToS explained: https://autonomee.ai/blog/claude-code-terms-of-service-explained/
- XDA on the Agent SDK / `claude -p` credit change: https://www.xda-developers.com/anthropics-claude-subscriptions-no-longer-include-agent-sdk-and-claude-p-usage/
- Digital Applied on the June 15 pause: https://www.digitalapplied.com/blog/anthropic-claude-credit-overhaul-june-15-2026
- Zed blog on Anthropic subscription changes: https://zed.dev/blog/anthropic-subscription-changes
- Instagram Reels spec guides (they disagree on length and safe zones, so values are treated as assumptions): https://argil.ai/blog/instagram-reel-size-e350f, https://contentstudio.io/blog/instagram-reel-size, https://www.screensnap.pro/blog/instagram-reels-size-guide

The Anthropic Help Center page (primary) confirmed the June 2026 pause: "We've paused the previously-announced changes to Claude Agent SDK usage. For now, nothing has changed".

## 6. Things to re-verify before building (and periodically)
1. Anthropic legal-and-compliance + Agent SDK pages: subscription and third-party wording.
2. Help Center article on Agent SDK / `claude -p` billing.
3. OpenAI app-server page: local/personal use statement.
4. CLI flags in Appendix A of the spec, against the installed versions.
5. Instagram's current length limit and safe zones, in the app.
6. License files of every vendored binary, model and font.
