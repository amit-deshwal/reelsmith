// RS-1271 (1) / RS-1272 (7): every brief got the same reel. All five full Goa runs of 2026-11-17 built one skeleton: a
// zoom-punch hook, cuts and holds, a velocity slam, a strips break-in, a zoom-punch burst, a closing hold (scorecard:
// cut 7, zoom-punch 4, hold 4, break-in 3, velocity 3, nothing else). The project now remembers the moves of its earlier
// reels; the treatment hears which moves those were and which fitting ones are unused, and a plan whose own moves are
// the last reel's again is refused once.
/** validatePlan's plain moves (not imported: validatePlan imports this module). */
const PLAIN_MOVES = new Set(['cut', 'hold', 'black']);

/** The arc the director falls back on whatever the brief: met with three or more of these and nothing else, it is the stock reel. */
export const STOCK_MOVES = new Set(['zoom-punch', 'velocity', 'break-in', 'flash-cuts', 'strips-reveal']);
/** Moves to offer instead, by what the footage holds (people for the person moves, photos for the photo moves). */
const FRESH_FOR_PEOPLE = ['freeze-intro', 'match-cut', 'rewind', 'world-swap', 'talk-zoom'];
const FRESH_FOR_ANY = ['speed-ramp', 'split', 'pip', 'cards-finale', 'film-strip', 'compare'];
const FRESH_FOR_PHOTOS = ['photo-3d', 'photo-parallax', 'photo-stack'];
/** Earlier reels the project keeps the moves of. */
export const HISTORY_MAX = 6;

/** The moves that make a reel's look: everything but cut, hold and black. */
export const ownMoves = (moves: readonly string[]) => [...new Set(moves.filter((m) => !PLAIN_MOVES.has(m)))].sort();

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** How often each move was used across the earlier reels, most first: "zoom-punch ×4, velocity ×3". */
export function moveCounts(history: ReadonlyArray<readonly string[]>): Array<[string, number]> {
  const n = new Map<string, number>();
  for (const run of history) for (const m of ownMoves(run)) n.set(m, (n.get(m) ?? 0) + 1);
  return [...n].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

/** Moves that suit the footage and no earlier reel used, in the order worth trying. */
export function freshMoves(history: ReadonlyArray<readonly string[]>, footage: { people: boolean; photos: boolean }, now: readonly string[] = []): string[] {
  const used = new Set([...history.flatMap((r) => r), ...now]);
  const pool = [...(footage.people ? FRESH_FOR_PEOPLE : []), ...(footage.photos ? FRESH_FOR_PHOTOS : []), ...FRESH_FOR_ANY];
  return pool.filter((m) => !used.has(m)).slice(0, 6);
}

export interface VarietyFinding { issue: string; fix: string }

/**
 * The treatment's moves against the project's earlier reels and the stock arc. `moves` are the parts' moves in order;
 * `history` the earlier reels' moves, the last reel last.
 */
export function varietyFinding(moves: readonly string[], history: ReadonlyArray<readonly string[]>, footage: { people: boolean; photos: boolean }): VarietyFinding | undefined {
  const own = ownMoves(moves);
  if (!own.length) return undefined;
  const last = history.length ? ownMoves(history[history.length - 1]!) : undefined;
  const fresh = freshMoves(history, footage, own);
  const offer = fresh.length ? `; moves no reel here used yet that fit this footage: ${fresh.join(', ')}` : '';
  if (last && sameSet(own, last)) {
    const counts = moveCounts(history).slice(0, 5).map(([m, k]) => `${m} ×${k}`).join(', ');
    return { issue: `the same moves as the last reel in this project (${own.join(', ')}); the earlier reels used ${counts}`, fix: `build this one differently: swap at least two of them for moves the footage suits${offer}. The build refuses the last reel's moves once` };
  }
  const stock = own.filter((m) => STOCK_MOVES.has(m));
  if (stock.length >= 3 && stock.length === own.length) {
    return { issue: `the stock arc (${own.join(', ')}): every reel gets these whatever the brief`, fix: `keep one of them for the drop and give the hook and the ending moves this story asks for${offer}` };
  }
  return undefined;
}

/** The plan's own moves are the last reel's again: the `repeat` rule's text, or undefined. */
export function repeatsLast(planMoves: readonly string[], history: ReadonlyArray<readonly string[]>): string | undefined {
  if (!history.length) return undefined;
  const own = ownMoves(planMoves);
  const last = ownMoves(history[history.length - 1]!);
  return own.length >= 2 && sameSet(own, last) ? own.join(', ') : undefined;
}
