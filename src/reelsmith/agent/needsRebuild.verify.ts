import assert from 'node:assert/strict';
import { needsRebuild } from './directorRepairTools';

for (const yes of [
  'u missed some of my videos, include them too',
  'feel free to make reel 35 seconds but include them too',
  'add the rest of my clips',
  'use all my clips',
  'make it longer',
]) assert.equal(needsRebuild(yes), true, yes);
for (const no of [
  'slower ending',
  'make the title bigger',
  'swap the clip in section 3 for the pool jump',
  'the second line should say 3 days',
  'more royal',
]) assert.equal(needsRebuild(no), false, no);
console.log('needsRebuild.verify: ok');
