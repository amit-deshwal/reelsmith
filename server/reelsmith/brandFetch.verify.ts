// RS-1239: one GET of the page the user named, nothing private, size- and time-capped.
import assert from 'node:assert/strict';
import { brandUrl, fetchBrandKit } from './brandFetch.ts';

assert.equal(brandUrl('punetrekkers.org'), 'https://punetrekkers.org/');
assert.equal(brandUrl('http://example.com/about'), 'http://example.com/about');
for (const bad of ['', 'file:///etc/passwd', 'ftp://x.org', 'http://localhost:5199', 'http://127.0.0.1', 'http://192.168.1.4', 'http://router.local']) {
  assert.equal(typeof brandUrl(bad), 'object', bad);
}

let asked = '';
const page = '<title>Chai Point | Bandra</title><h1>Best chai in Bandra</h1><a href="https://wa.me/91">Order on WhatsApp</a>';
const ok = (async (url: string) => { asked = url; return new Response(page, { headers: { 'content-type': 'text/html; charset=utf-8' } }); }) as typeof fetch;
const kit = await fetchBrandKit('chaipoint.example', ok);
assert.equal(asked, 'https://chaipoint.example/');
assert.equal(kit.name, 'Chai Point');
assert.deepEqual(kit.actions, ['Order on WhatsApp']);
await assert.rejects(fetchBrandKit('x.example', (async () => new Response('no', { status: 404 })) as typeof fetch), /answered 404/);
await assert.rejects(fetchBrandKit('x.example', (async () => new Response('{}', { headers: { 'content-type': 'application/json' } })) as typeof fetch), /not a web page/);
await assert.rejects(fetchBrandKit('http://localhost:1'), /only public web pages/);
console.log('brandFetch.verify: ok');
