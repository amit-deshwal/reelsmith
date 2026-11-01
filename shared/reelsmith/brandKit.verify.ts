// RS-1239: the brand kit read from a page like the one in Kino's 2026-11-01 run (punetrekkers.org).
import assert from 'node:assert/strict';
import { brandAction, brandKitText, brandWords, decodeEntities, parseBrandHtml } from './brandKit';

const html = `<!doctype html><html><head>
<title>Pune Trekkers &#8211; Find your people</title>
<meta property="og:site_name" content="Pune Trekkers">
<meta name="description" content="A free, volunteer-run trekking community in Pune. Zero markup. Zero profit.">
<meta name="theme-color" content="#FFB020">
<meta property="og:image" content="/img/share.jpg">
<link href="https://fonts.googleapis.com/css2?family=Anton&display=swap" rel="stylesheet">
<style>:root{--bg:#0f2a1d;--ink:#ffffff;--grey:#888888} .btn{background:#ffb020;color:#0f2a1d} h1{font-family:"Anton",sans-serif}</style>
<script>var x = "<h1>not a heading</h1> 999 fake things";</script>
</head><body>
<h1>FIND YOUR PEOPLE. FIND YOUR TRAIL.</h1>
<h2>Solo or first-timer? You&rsquo;re welcome</h2>
<p>2,300+ trekkers have joined. 100% volunteer-run.</p>
<li>Safety first. Always.</li>
<a class="btn" href="https://chat.whatsapp.com/AbC">Join free on WhatsApp</a>
<a href="https://www.instagram.com/punetrekkers/">Instagram</a>
<a href="https://www.instagram.com/p/xyz/">a post</a>
<a href="mailto:hello@punetrekkers.org">Email</a>
<footer>&copy; 2026 Pune Trekkers. All rights reserved.</footer>
</body></html>`;

const kit = parseBrandHtml(html, 'https://punetrekkers.org/');
assert.equal(kit.name, 'Pune Trekkers');
assert.match(kit.tagline!, /volunteer-run trekking community/);
assert.ok(kit.lines.includes('FIND YOUR PEOPLE. FIND YOUR TRAIL.'), kit.lines.join(' | '));
assert.ok(kit.lines.includes('Solo or first-timer? You’re welcome'), kit.lines.join(' | '));
assert.ok(!kit.lines.some((l) => /not a heading/.test(l)), 'scripts are not read');
assert.ok(kit.facts.some((f) => /2,300\+ trekkers/.test(f)), kit.facts.join(' | '));
assert.ok(kit.facts.some((f) => /100% volunteer-run/.test(f)), kit.facts.join(' | '));
assert.ok(!kit.facts.some((f) => /fake|rights/.test(f)), kit.facts.join(' | '));
assert.deepEqual(kit.actions, ['Join free on WhatsApp']);
assert.deepEqual(kit.links.map((l) => `${l.kind}:${l.label}`), ['whatsapp:WhatsApp', 'instagram:@punetrekkers', 'email:hello@punetrekkers.org', 'site:punetrekkers.org']);
assert.equal(kit.colors[0], '#ffb020', 'the theme colour first');
assert.ok(kit.colors.includes('#0f2a1d') && !kit.colors.includes('#888888') && !kit.colors.includes('#ffffff'), kit.colors.join(' '));
assert.deepEqual(kit.fonts, ['Anton']);
assert.equal(kit.image, 'https://punetrekkers.org/img/share.jpg');
assert.equal(brandAction(kit), 'Join free on WhatsApp');
assert.match(brandWords(kit), /link in bio/);
const text = brandKitText(kit);
assert.ok(JSON.stringify(text).length < 3000, 'small enough for the 16k result cap');
assert.match(String(text.use), /cta-card/);

// no actions: the end card asks for the link that is there
assert.equal(brandAction({ ...kit, actions: [], links: [{ kind: 'instagram', label: '@x' }] }), 'Follow @x');
assert.equal(brandAction({ ...kit, actions: [], links: [{ kind: 'site', label: 'x.org' }] }), undefined);
// a page with only a title still has a name
assert.equal(parseBrandHtml('<title>Chai Point | Bandra</title>', 'https://chai.example/').name, 'Chai Point');
assert.equal(decodeEntities('Tom &amp; Jerry &#x2014; &hellip;'), 'Tom & Jerry — …');
console.log('brandKit.verify: ok');

// the live punetrekkers.org page had one colour, a dark green: it becomes the background, the button stays light
{
  const { brandPalette, luminance } = await import('./brandKit');
  assert.deepEqual(brandPalette(['#244936']), { accent: '#ffffff', background: '#244936' });
  assert.deepEqual(brandPalette(['#ffb020', '#0f2a1d']), { accent: '#ffb020', background: '#0f2a1d' });
  assert.deepEqual(brandPalette([]), { accent: '#ffb020' });
  assert.ok(luminance('#ffffff') > 0.99 && luminance('#000000') < 0.01);
  console.log('brandKit palette: ok');
}
