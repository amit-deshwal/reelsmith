// RS-1272 (1): heavy work in the page takes turns by kind. During a director run the visual model's reading of the
// clips stalled on every clip for its full 45 s limit (18 clips skipped in one session) while face finding ran on the
// GPU beside it; the same page read a clip in 41 ms when idle. Work of one kind runs side by side as before (three
// clips' faces at once); another kind waits until it is done, and a waiting kind goes next, so neither starves.

export type PageWorkKind = 'faces' | 'vectors';

let active: PageWorkKind | null = null;
let running = 0;
const queue: Array<{ kind: PageWorkKind; start: () => void }> = [];

function pump(): void {
  while (queue.length) {
    const head = queue[0]!;
    if (active !== null && active !== head.kind) return;
    // same kind as the running work: it may join, unless another kind is waiting ahead of it
    queue.shift();
    active = head.kind;
    running += 1;
    head.start();
  }
}

/** Run `work` when no work of another kind is running in the page. */
export function pageWork<T>(kind: PageWorkKind, work: () => Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    queue.push({
      kind,
      start: () => {
        work().then(resolve, reject).finally(() => {
          running -= 1;
          if (running === 0) active = null;
          pump();
        });
      },
    });
    pump();
  });
}

/** For tests: what is running now. */
export const pageWorkState = () => ({ active, running, waiting: queue.length });
