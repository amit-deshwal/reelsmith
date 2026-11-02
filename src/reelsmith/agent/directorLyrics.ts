// RS-1253: the build side of a lyric reel: the song's sung words, transcribed in the song's language (and saved on the
// song so a rebuild does not transcribe again), or the user's own lyrics laid onto that timing.
import type { ReelPlan } from '../../../shared/reelsmith/directorPlan';
import type { AgentContext } from '../../agent/context';
import type { MediaAsset } from '../../editor/types';
import { alignLyrics, sungWords, type LyricWord } from '../director/lyrics';
import { hasDevanagari } from '../scriptFonts';
import type { ReelsDeps } from './reelsTools';

/** The language to hear the song in: the plan's, Hindi when the given lyrics are Devanagari, else the app's setting. */
export const lyricsLanguage = (plan: ReelPlan): string | undefined => plan.lyrics?.language ?? (hasDevanagari(plan.lyrics?.text) ? 'hi' : undefined);

export async function resolveLyrics(plan: ReelPlan, song: MediaAsset | undefined, ctx: AgentContext, deps: ReelsDeps): Promise<{ words?: LyricWord[]; note?: string }> {
  if (!plan.lyrics || !song) return {};
  let heard: LyricWord[] | undefined = song.transcript?.length ? song.transcript.map((w) => ({ text: w.text, start: w.start, end: w.end })) : undefined;
  if (!heard) {
    if (!deps.api.transcribe) return { note: 'Lyrics left out: transcription is not available here.' };
    ctx.onToolProgress?.(`Listening to the words of ${song.name}`);
    try {
      const language = lyricsLanguage(plan);
      heard = (await deps.api.transcribe(song, ctx.onToolProgress, language ? { language } : undefined)) ?? undefined;
    } catch (e) { return { note: `Lyrics left out: the song could not be transcribed (${e instanceof Error ? e.message : String(e)}).` }; }
    if (heard?.length) ctx.commands.setAssetTranscription?.(song.id, { transcript: heard, transcribeStatus: 'done', transcribeError: undefined });
  }
  const sung = sungWords(heard ?? []);
  if (!sung.length) return { note: 'Lyrics left out: no sung words were heard in the song (an instrumental, or the transcriber missed them). Ask the user for the lyrics and their timing.' };
  if (!plan.lyrics.text) return { words: sung };
  const words = alignLyrics(sung, plan.lyrics.text);
  return words.length ? { words } : { note: 'Lyrics left out: the given lyrics have no words.' };
}
