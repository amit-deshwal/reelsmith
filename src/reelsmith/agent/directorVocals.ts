// M12 ("More from the same research"): the song's sung phrases for the director, so lines come in with the singer.
// The phrases come from the transcript the song already has (imported songs are transcribed on import, a lyric reel
// transcribes its song); nothing is transcribed here, so a song without one simply keeps its lines on the cut.
import type { MediaAsset } from '../../editor/types';
import type { LyricWord } from '../director/lyrics';
import { vocalPhraseStarts } from '../director/vocalEntry';

/** Song seconds where each sung phrase starts: from the song's transcript, else the words a lyric reel heard. */
export function songVocalStarts(song: Pick<MediaAsset, 'transcript'> | undefined, heard?: readonly LyricWord[]): number[] {
  const words = song?.transcript?.length ? song.transcript.map((w) => ({ text: w.text, start: w.start, end: w.end })) : heard;
  return vocalPhraseStarts(words);
}
