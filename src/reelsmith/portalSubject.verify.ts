// RS-1262: the silhouette portal plays only with one clear person; otherwise the circle wipe. The shader reads the person
// matte and the subject uniforms; the registry's defaults are the "nobody" case, and GlTransition asks for a mask.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { matteFromConfidence, NO_SUBJECT, syntheticPersonConfidence } from '../gl/personMaskMath';
import { GLSL_TRANSITIONS } from '../gl/transitions';
import { portalUniforms, PORTAL_MIN_AREA } from './portalSubject';
import { RECIPE_TRANSITIONS } from './assembler/transitions';
import { DIRECTOR_TRANSITIONS } from './director/catalog';
import { TRANSITION_CUES } from './director/sfx';

// nobody, or a speck, plays the circle wipe
assert.equal(portalUniforms(null).u_hasPerson, 0);
assert.equal(portalUniforms(NO_SUBJECT).u_hasPerson, 0, 'NO_SUBJECT has area 0');
assert.equal(portalUniforms({ cx: 0.3, cy: 0.7, w: 0.05, h: 0.1, area: PORTAL_MIN_AREA / 2 }).u_hasPerson, 0, 'a distant figure is not enough');

// a head-and-shoulders person: the portal grows from where they are
const w = 64, h = 112;
const { subject } = matteFromConfidence(syntheticPersonConfidence(w, h), w, h);
const u = portalUniforms(subject);
assert.equal(u.u_hasPerson, 1);
assert.deepEqual(u.u_subjectCenter, [subject.cx, subject.cy]);
assert.deepEqual(u.u_subjectSize, [subject.w, subject.h]);
assert.ok(subject.cy < 0.5, 'subject centre is in shader coordinates (y up): the body sits low in the frame');

// registry: it asks for a mask, its defaults are the circle wipe, and every non-sampler uniform has a value
const def = GLSL_TRANSITIONS['silhouette-portal'];
assert.ok(def.needsMask);
const defaults = def.uniforms({ time: 0, aspect: 9 / 16, direction: 'left' });
assert.equal(defaults.u_hasPerson, 0);
const src = readFileSync(new URL('../gl/shaders/silhouette-portal.frag', import.meta.url), 'utf8');
assert.match(src, /uniform sampler2D u_mask;/);
for (const name of Object.keys(portalUniforms(subject))) assert.ok(src.includes(`uniform `) && new RegExp(`uniform \\w+ ${name};`).test(src), `${name} declared`);
// the ends are the plain clips: before 0 the portal is empty (person * smoothstep(0, ..)), at 1 it is closed up
assert.match(src, /person \* smoothstep\(0\.0, [\d.]+, p\)/);
assert.match(src, /smoothstep\(0\.8, 1\.0, p\)/);
// no other transition asks for a mask
for (const [id, d] of Object.entries(GLSL_TRANSITIONS)) if (id !== 'silhouette-portal') assert.ok(!(d as { needsMask?: boolean }).needsMask, id);

// the director can name it, hears a sound on it, and the menu describes it
assert.equal(RECIPE_TRANSITIONS['silhouette-portal']?.type, 'silhouette-portal');
assert.ok(DIRECTOR_TRANSITIONS.some((t) => t.id === 'silhouette-portal'));
assert.equal(TRANSITION_CUES['silhouette-portal'], 'whoosh-soft');
console.log('portalSubject.verify: ok');
