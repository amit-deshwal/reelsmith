// RS-1270: the director's clip list chosen from more than 60 clips. Run: node --import tsx src/reelsmith/director/pool.verify.ts
import assert from 'node:assert/strict';
import type { ClipFeatures } from '../assembler/scoring';
import { clipScore, leftOutText, pickPool, POOL_MAX, type PoolClip } from './pool';

const feats = (id: string, sharp: number, hash: string, captureTimeMs?: number): ClipFeatures => ({
  assetId: id, dHash: hash, ...(captureTimeMs !== undefined ? { captureTimeMs } : {}),
  windows: [{ startFrame: 0, endFrame: 60, sharpness: sharp, exposure: 0.8, motion: 0.3, subject: 0.1, speech: false }],
});
// distinct hashes: 16 hex chars that differ in many bits from one clip to the next
const hash = (i: number) => (BigInt(i + 1) * 0x9e3779b97f4a7c15n & 0xffffffffffffffffn).toString(16).padStart(16, '0');
const clip = (i: number, sharp = 0.5, seconds = 8): PoolClip => ({ id: `c${i}`, kind: 'video', seconds, features: feats(`c${i}`, sharp, hash(i)) });

// 60 clips or fewer: all of them, in order, even a short one
{
  const few = Array.from({ length: 12 }, (_, i) => clip(i, 0.5, i === 3 ? 0.4 : 8));
  const pool = pickPool(few);
  assert.deepEqual(pool.keep, few.map((c) => c.id));
  assert.equal(pool.left.length, 0);
  assert.equal(leftOutText(pool.left, 12, (id) => id), undefined);
}

// 104 clips: the list holds 60, in the import order; short clips and repeated takes leave first
{
  const many = Array.from({ length: 104 }, (_, i) => clip(i, 0.2 + ((i * 7) % 10) / 20));
  many[5] = clip(5, 0.9, 0.5);                                              // under a second
  many[11] = { ...clip(11, 0.3), features: feats('c11', 0.3, hash(10), 1_000) }; // a second take of c10, weaker
  many[10] = { ...clip(10, 0.8), features: feats('c10', 0.8, hash(10), 2_000) };
  // the last stretch of the shoot is all weak: it still keeps its seats
  for (let i = 94; i < 104; i += 1) many[i] = clip(i, 0.05);
  const pool = pickPool(many);
  assert.equal(pool.keep.length, POOL_MAX);
  assert.deepEqual(pool.keep, [...pool.keep].sort((a, b) => Number(a.slice(1)) - Number(b.slice(1))), 'import order is kept');
  assert.equal(pool.left.find((l) => l.id === 'c5')?.why, 'short');
  assert.equal(pool.left.find((l) => l.id === 'c11')?.why, 'duplicate');
  assert.ok(pool.keep.includes('c10'), 'the better take stays');
  assert.ok(pool.keep.filter((id) => Number(id.slice(1)) >= 94).length >= 5, 'every stretch of the shoot keeps clips');
  assert.equal(pool.keep.length + pool.left.length, 104);
  // the weakest clip of a strong stretch leaves before a strong one
  const kept = new Set(pool.keep);
  const early = many.slice(0, 90).filter((c) => c.id !== 'c5' && c.id !== 'c11');
  const worstKept = Math.min(...early.filter((c) => kept.has(c.id)).map(clipScore));
  const bestLeft = Math.max(...early.filter((c) => !kept.has(c.id)).map(clipScore));
  assert.ok(bestLeft <= worstKept + 0.2, 'what leaves is not much better than what stays');
  const text = leftOutText(pool.left, 104, (id) => `${id}.mov`)!;
  assert.match(text, /^44 of 104 clips are not in the list/);
  assert.match(text, /1 under a second, 1 near-duplicate takes, 42 weaker/);
  assert.ok(text.length < 700, 'the note stays short');
}

// an unread video ranks below a read one; photos take part
{
  assert.ok(clipScore({ id: 'x', kind: 'video', seconds: 5, features: null }) < clipScore(clip(1, 0.3)));
  const mixed: PoolClip[] = [...Array.from({ length: 70 }, (_, i) => clip(i)), { id: 'p', kind: 'image', seconds: 5 }];
  assert.equal(pickPool(mixed).keep.length, POOL_MAX);
}
console.log('pool.verify ok');
