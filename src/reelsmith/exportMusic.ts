// RS-1241: posting a reel whose song is someone else's. A copyrighted song baked into the file can get the reel muted or
// shown to fewer people; the same song picked from Instagram's music library is licensed. So after an Instagram-ready
// export with a song on the timeline, Reelsmith also saves <name>.no-sound.mp4 and says where to start the song in
// Instagram's picker so the cuts still land on its beat (Kino's 2026-11-01 run told the user "start it at 0:51").
import type { TimelineState } from '../editor/types';

export interface TimelineSong { name: string; /** the file it plays (bundled songs are /audio/...) */ src?: string; /** seconds into the song where the reel's music starts */ fromSec: number; /** reel second the song comes in */ atReelSec: number }

/** The reel's song: the music item a recipe or the director laid (id "...music"), else the longest audio from the start. */
export function songOnTimeline(state: Pick<TimelineState, 'items' | 'fps'>): TimelineSong | undefined {
  // RS-1251: the user's own voiceover is not a song (no music-picker or muting advice about it)
  const audio = state.items.filter((i) => i.kind === 'audio' && !(i as { props?: { rsVoiceover?: boolean } }).props?.rsVoiceover);
  if (!audio.length) return undefined;
  const reelEnd = Math.max(1, ...state.items.map((i) => i.startFrame + i.durationInFrames));
  const laid = audio.find((i) => /(^|-)music$/.test(i.id));
  const song = laid ?? audio.filter((i) => i.durationInFrames >= reelEnd * 0.6).sort((a, b) => b.durationInFrames - a.durationInFrames)[0];
  if (!song) return undefined;
  const src = (song as { srcInFrame?: number }).srcInFrame ?? 0;
  return { name: song.name.replace(/\.(mp3|m4a|wav|aac)$/i, ''), ...((song as { src?: string }).src ? { src: (song as { src?: string }).src } : {}), fromSec: Math.max(0, src / state.fps), atReelSec: song.startFrame / state.fps };
}

export const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

/** "In Instagram, add “Believer” and start it at 0:51; the cuts follow its beat." */
export function musicNote(song: TimelineSong): string {
  const later = song.atReelSec >= 0.5 ? ` and bring it in ${song.atReelSec.toFixed(1)} s into the reel` : '';
  return `To post with Instagram's licensed copy of the song, upload the no-sound file, add “${song.name}” from Instagram's music, start it at ${clock(song.fromSec)}${later}; the cuts follow its beat.`;
}

/**
 * The line a director report adds for someone else's song (RS-1241): the agent skipped it when only the skill asked, so
 * the build and fix results carry it. Bundled library songs need none.
 */
export function songReportLine(state: Pick<TimelineState, 'items' | 'fps'>): string {
  const song = songOnTimeline(state);
  if (!song || song.src?.startsWith('/audio/')) return '';
  return ` Add a fourth line about the song: if "${song.name}" is a commercial track, Instagram may mute or limit the reel with it baked in; the Instagram-ready export also saves a no-sound copy, and in Instagram's music picker they start the song at ${clock(song.fromSec)} so the cuts land on its beat.`;
}

export const noSoundSidecarName = (videoName: string) => `${videoName.replace(/\.[^./\\]+$/, '')}.no-sound.mp4`;

/** Never throws: the video is already delivered. */
export async function deliverNoSoundCopy(opts: {
  state: Pick<TimelineState, 'items' | 'fps'>;
  src: string;
  /** the delivered video's name ("Hazy Echo.mp4"); the copy is named after it, not after the server's render file */
  videoName: string;
  write: (filename: string, blob: Blob) => Promise<void>;
  fetcher?: typeof fetch;
}): Promise<{ status: 'written'; name: string; note: string } | { status: 'none' } | { status: 'failed'; message: string }> {
  const song = songOnTimeline(opts.state);
  if (!song) return { status: 'none' };
  const fetcher = opts.fetcher ?? fetch;
  try {
    const res = await fetcher('/api/reelsmith/no-sound-copy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ src: opts.src }) });
    const body = await res.json().catch(() => null) as { src?: string; name?: string; error?: string } | null;
    if (!res.ok || !body?.src || !body.name) throw new Error(body?.error ?? `no-sound copy failed (${res.status})`);
    const file = await fetcher(body.src);
    if (!file.ok) throw new Error(`could not read the no-sound copy (${file.status})`);
    const name = noSoundSidecarName(opts.videoName);
    await opts.write(name, await file.blob());
    return { status: 'written', name, note: musicNote(song) };
  } catch (error) {
    return { status: 'failed', message: error instanceof Error ? error.message : String(error) };
  }
}
