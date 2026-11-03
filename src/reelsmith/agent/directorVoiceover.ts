// RS-1251: the user's own narration in director mode: told apart from the songs in stage 1 (with its lines, so the
// agent can cut to them), and resolved to its file and transcript for the build.
import type { ReelPlan } from '../../../shared/reelsmith/directorPlan';
import type { AgentContext } from '../../agent/context';
import type { MediaAsset } from '../../editor/types';
import type { AssemblyVoiceover } from '../assembler/types';
import { voiceLines } from '../director/voiceover';
import type { ReelsDeps } from './reelsTools';

/**
 * An audio file with at least this share of speech may be the user's narration. Sound alone cannot tell a narration
 * from a song with dense vocals (bundled track-3 reads 0.7, the user's takes 0.76 and 0.87), so these are transcribed
 * and the agent decides from the words: someone telling the story, or sung lyrics.
 */
export const VOICE_SHARE = 0.6;

export const VOICEOVER_HINT = 'These files are mostly voice. Read their lines against the story: the user (or someone) speaking about it is a voiceover, never music; sung lyrics make it a song after all (pass it as music; ifSongBpm is its tempo). Pass the take the user means (else the cleanest, complete one) as plan.voiceover. It plays whole from the reel start at full level and its words become captions automatically; a song (music) may play under it, dipped wherever it speaks. Cut to its lines (each "from-to" is seconds of the file): give sections seconds so a cut lands at the start of each line and each line plays over shots of what it says; the sections must add up to at least its seconds plus 0.5 s. No naturalSound over its speech; on-screen text short and above the caption zone, never repeating what it says.';

const secs = (frames: number, fps: number) => Math.round((frames / fps) * 10) / 10;

/** Words transcribed in stage 1, by asset and source, until the build saves them on the asset. */
const heardBefore = new Map<string, NonNullable<AssemblyVoiceover['transcript']>>();
const heardKey = (asset: MediaAsset) => `${asset.id}|${asset.src}`;

/**
 * The narration's transcript, transcribing it now when it has none. With `save` (the build) the words are saved on the
 * asset; stage 1 passes false and keeps them here (RS-1258: a stage 1 that changed the draft went stale whenever the
 * live project changed while it watched the clips).
 */
export async function narrationWords(asset: MediaAsset, ctx: AgentContext, deps: ReelsDeps, save = true): Promise<{ words?: AssemblyVoiceover['transcript']; error?: string }> {
  if (asset.transcript?.length) return { words: asset.transcript.map((w) => ({ text: w.text, start: w.start, end: w.end })) };
  const keep = (words: NonNullable<AssemblyVoiceover['transcript']>) => {
    if (save) {
      ctx.commands.setAssetTranscription?.(asset.id, { transcript: words, transcribeStatus: 'done', transcribeError: undefined });
      heardBefore.delete(heardKey(asset));
    } else heardBefore.set(heardKey(asset), words);
    return { words };
  };
  const cached = heardBefore.get(heardKey(asset));
  if (cached) return keep(cached);
  if (!deps.api.transcribe) return { error: 'transcription is not available here' };
  ctx.onToolProgress?.(`Transcribing ${asset.name}`);
  try {
    const words = await deps.api.transcribe(asset, ctx.onToolProgress);
    if (!words?.length) return { error: 'no words were heard' };
    return keep(words);
  } catch (e) { return { error: e instanceof Error ? e.message : String(e) }; }
}

/** Stage 1: split the imported audio into songs and likely narrations (each described with its lines on demand). */
export async function narrationOptions(imported: MediaAsset[], deps: ReelsDeps) {
  const shares = new Map(await Promise.all(imported.map(async (a) => [a.id, await deps.api.speechShare?.(a).catch(() => null) ?? null] as const)));
  const voiced = imported.filter((a) => (shares.get(a.id) ?? 0) >= VOICE_SHARE);
  return {
    importedSongs: imported.filter((a) => !voiced.includes(a)).slice(0, 3),
    narrations: voiced.map((asset) => ({
      asset,
      describe: async (ctx: AgentContext, d: ReelsDeps, fps: number, bpm?: number) => {
        const heard = await narrationWords(asset, ctx, d, false);
        return {
          assetId: asset.id, name: asset.name, seconds: secs(asset.durationInFrames, fps), speech: shares.get(asset.id),
          ...(heard.words ? { lines: voiceLines(heard.words) } : { transcriptError: heard.error }),
          ...(bpm ? { ifSongBpm: bpm } : {}),
        };
      },
    })),
  };
}

/** The build: the plan's voiceover as the file the assembler places, with its words (a note when it has none). */
export async function resolveVoiceover(plan: ReelPlan, assets: readonly MediaAsset[], ctx: AgentContext, deps: ReelsDeps): Promise<{ voiceover?: AssemblyVoiceover; note?: string } | { error: string }> {
  if (!plan.voiceover) return {};
  const want = plan.voiceover.toLowerCase();
  const hit = assets.find((a) => (a.kind === 'audio' || a.kind === 'video') && (a.id.toLowerCase() === want || a.name.toLowerCase() === want));
  if (!hit) return { error: `unknown voiceover ${JSON.stringify(plan.voiceover)}; use the assetId from reels_director_options voiceovers` };
  if (plan.music === hit.id) return { error: 'the voiceover cannot also be the song: leave music out, or give a song to play under the voice' };
  plan.voiceover = hit.id;
  const heard = plan.captions === false && !hit.transcript?.length ? {} : await narrationWords(hit, ctx, deps);
  return {
    voiceover: {
      assetId: hit.id, name: hit.name, src: hit.src, kind: hit.kind === 'video' ? 'video' : 'audio',
      durationSec: hit.durationInFrames / ctx.getState().fps, ...(heard.words ? { transcript: heard.words } : {}),
    },
    ...(heard.error ? { note: `The voiceover has no captions: ${heard.error}. Tell the user (they can transcribe it from My Media and rebuild).` } : {}),
  };
}
