// Ideas panel: recipe digest, offline matching, the check on Claude's answer, and the request reader.
import assert from 'node:assert/strict';
import { ideaPrompt, parseIdeaAnswer, rankIdeasOffline, recipeDigest } from '../../shared/reelsmith/ideaMatch.ts';
import { claudeOnceArgs } from './claudeOnce.ts';
import { draftRecipePrompt, readIdeaRequest } from './ideas.ts';
import { loadRecipesFromDir } from './recipes.ts';

const { recipes } = await loadRecipesFromDir('recipes');
assert.ok(recipes.length > 20, 'bundled recipes load');
const tiny = recipes.find((r) => r.id === 'tiny-world')!;

// digest names the effects and text inputs the model needs, without the builtin: prefix
const digest = recipeDigest(tiny);
assert.match(digest, /effects: tilt-shift, fuji-velvia/);
assert.match(digest, /text inputs: place "Place name" ≤30 chars optional/);
assert.match(digest, /needs a song/);

// offline: moods and synonyms beat alphabetical order
const retro = rankIdeasOffline({ description: 'old school trip with the squad', vibes: ['retro'] }, recipes);
assert.equal(retro.source, 'offline');
assert.ok(retro.picks.some((p) => p.recipeId === 'camcorder-throwback'), 'retro mood finds the camcorder recipe');
assert.match(retro.picks[0]!.why, /^Matches /);
const trippy = rankIdeasOffline({ description: '', vibes: ['trippy'] }, recipes);
assert.ok(trippy.picks.slice(0, 4).some((p) => ['kaleido-trip', 'mirror-world'].includes(p.recipeId)));
assert.equal(rankIdeasOffline({ description: 'zzzz qqqq', vibes: [] }, recipes).noneFit, true);

// the prompt carries the description, moods and every recipe id
const prompt = ideaPrompt({ description: 'Goa with friends', vibes: ['retro', 'nope'], clips: 12 }, recipes);
assert.match(prompt, /"Goa with friends"/);
assert.match(prompt, /Moods they ticked: Retro\n/);
for (const r of recipes) assert.ok(prompt.includes(`${r.id}: `), `prompt lists ${r.id}`);

// answer check: unknown ids, duplicates, stray or long texts are dropped; at most 5 picks
const answer = parseIdeaAnswer({
  noneFit: false,
  picks: [
    { recipeId: 'made-up', why: 'x', texts: [] },
    { recipeId: 'tiny-world', why: '  Your   wide beach shots become a toy town.  ', texts: [{ inputId: 'place', text: 'tiny goa but this is far too long for thirty chars' }, { inputId: 'clips', text: 'nope' }, { inputId: 'ghost', text: 'x' }] },
    { recipeId: 'tiny-world', why: 'dupe', texts: [] },
    ...['beat-cut', 'film-burn', 'gang-reel', 'zoom-tunnel', 'photo-dump'].map((recipeId) => ({ recipeId, why: 'y', texts: [] })),
  ],
}, recipes)!;
assert.equal(answer.source, 'ai');
assert.deepEqual(answer.picks.map((p) => p.recipeId), ['tiny-world', 'beat-cut', 'film-burn', 'gang-reel', 'zoom-tunnel']);
assert.equal(answer.picks[0]!.why, 'Your wide beach shots become a toy town.');
assert.deepEqual(answer.picks[0]!.texts, { place: 'tiny goa but this is far too' });
assert.equal(parseIdeaAnswer({ picks: [{ recipeId: 'made-up' }] }, recipes), null);
assert.equal(parseIdeaAnswer('nope', recipes), null);

// request reader: recipes are re-validated, empty asks rejected, numbers clamped
const read = readIdeaRequest({ description: 'x'.repeat(900), vibes: ['retro', 4], clips: 999, recipes: [tiny, { id: 'bad' }] });
assert.equal(read.request.description.length, 600);
assert.deepEqual(read.request.vibes, ['retro']);
assert.equal(read.request.clips, 200);
assert.deepEqual(read.recipes.map((r) => r.id), ['tiny-world']);
assert.throws(() => readIdeaRequest({ description: ' ', vibes: [], recipes: [tiny] }), /describe the reel/);
assert.throws(() => readIdeaRequest({ description: 'goa', recipes: [] }), /no recipes/);

// draft prompt: examples without agent hints, the allowed vocabulary, and earlier errors fed back
const draft = draftRecipePrompt({ description: 'rainy Tokyo nights', vibes: [] }, recipes, [tiny], ['/structure/0: bad transition']);
assert.match(draft, /"rainy Tokyo nights"/);
assert.ok(!draft.includes('Miniature only works'), 'agentHints are not sent as examples');
assert.match(draft, /effect assetIds: .*builtin:fx-tilt-shift/);
assert.match(draft, /bad transition/);

// the one-shot CLI call has no tools and no MCP servers
const args = claudeOnceArgs({}, { model: 'sonnet', effort: 'low' });
assert.equal(args[args.indexOf('--tools') + 1], '');
for (const flag of ['--strict-mcp-config', '--restricted', '--no-session-persistence']) assert.ok(args.includes(flag), flag);
assert.equal(args[args.indexOf('--permission-prompts') + 1], 'none');
for (const tool of ['Bash', 'Read', 'Write', 'WebFetch', 'WebSearch', 'Task']) assert.ok(args[args.indexOf('--disallowedTools') + 1]!.split(' ').includes(tool), tool);
assert.ok(!args.some((a) => /dangerously|bypass/.test(a)));
console.log('ideas.verify ok');
