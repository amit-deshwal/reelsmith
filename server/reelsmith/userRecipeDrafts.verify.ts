// RS-1004: three agent-style drafts are accepted, assemble from sample media, and show up with previews;
// an invalid draft is refused with the schema error and nothing is written.
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = mkdtempSync(join(tmpdir(), 'rs-ai-drafts-'));
process.env.OPENCHATCUT_DATA_DIR = root;
const { deleteUserRecipe, listUserRecipes, readUserPreview, saveUserRecipe } = await import('./user-recipes.ts');
const { runRecipe } = await import('../../src/reelsmith/runRecipe.ts');
const { defaultValues } = await import('../../src/reelsmith/setupForm.ts');
const { previewUrl } = await import('../../src/reelsmith/galleryModel.ts');

try {
  const dir = 'server/reelsmith/fixtures/ai-drafts';
  const ids = readdirSync(dir).filter((f) => f.endsWith('.recipe.json')).map((f) => f.replace('.recipe.json', ''));
  assert.equal(ids.length, 3);

  const asset = (id: string, kind: 'video' | 'audio' | 'image', frames = 300) => ({ id, name: id, kind, src: `/media/uploads/${id}`, durationInFrames: frames }) as never;
  const assets = [...Array.from({ length: 24 }, (_, i) => asset(`c${i}`, 'video')), asset('song', 'audio', 3600)];
  const api = {
    clipFeatures: async (a: { id: string }) => ({ assetId: a.id, dHash: ((parseInt(a.id.slice(1), 10) * 2654435761) >>> 0).toString(16).padStart(8, '0').repeat(2), windows: [{ startFrame: 30, endFrame: 200, sharpness: 0.6, exposure: 0.7, motion: 0.4, subject: 0.5, score: 0.6 }] }),
    musicGrid: async () => ({ durationSec: 60, beatTimesSec: Array.from({ length: 120 }, (_, i) => i * 0.5), beatsPerBar: 4, downbeatIndex: 0 }),
  } as never;

  for (const id of ids) {
    const saved = await saveUserRecipe(JSON.parse(readFileSync(join(dir, `${id}.recipe.json`), 'utf8')));
    const values = defaultValues(saved);
    for (const input of saved.inputs) {
      if (input.kind === 'text') values.texts[input.id] = 'Goa';
      else if (input.accept.includes('audio')) values.media[input.id] = [{ assetId: 'song', kind: 'audio' }];
      else values.media[input.id] = assets.filter((a: { kind: string }) => a.kind === 'video').slice(0, Math.min(input.max, 24)).map((a: { id: string }) => ({ assetId: a.id, kind: 'video' as const }));
    }
    const out = await runRecipe(api, { recipe: saved, values, assets, fps: 30, replaceTimeline: true, seed: 5 });
    assert.ok(out.action, `${id}: ${out.messages.join('; ')}`);
  }
  assert.deepEqual((await listUserRecipes()).recipes.map((r) => r.id).sort(), [...ids].sort());

  // an invalid draft (unknown transition) is rejected with the schema error and not saved
  const bad = JSON.parse(readFileSync(join(dir, `${ids[0]}.recipe.json`), 'utf8'));
  bad.id = 'ai-broken-draft'; bad.structure[1].transition = 'spaceWarp';
  await assert.rejects(saveUserRecipe(bad), /transition|spaceWarp|enum|allowed/i);
  assert.ok(!(await listUserRecipes()).recipes.some((r) => r.id === 'ai-broken-draft'));

  // previews: served only from the user folder, with strict file names; deleting the recipe removes them
  const previews = join(root, 'user-recipes', 'previews');
  mkdirSync(previews, { recursive: true });
  writeFileSync(join(previews, `${ids[0]}.jpg`), 'jpg');
  assert.equal((await readUserPreview(`${ids[0]}.jpg`))?.type, 'image/jpeg');
  assert.equal(await readUserPreview('../recipe.json'), null);
  assert.equal(await readUserPreview('ai-x.png'), null);
  assert.equal(previewUrl(`previews/${ids[0]}.jpg`), `/api/reelsmith/user-recipe-previews/${ids[0]}.jpg`);
  assert.equal(previewUrl('previews/beat-cut.jpg'), '/recipe-previews/beat-cut.jpg');
  await deleteUserRecipe(ids[0]!);
  assert.equal(await readUserPreview(`${ids[0]}.jpg`), null);
  console.log('userRecipeDrafts verify ok');
} finally { rmSync(root, { recursive: true, force: true }); }
