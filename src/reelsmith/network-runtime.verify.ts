// Run against a live local editor: REELSMITH_AUDIT_URL=http://localhost:5199/#/editor/…
// Logs browser requests at the CDP layer, including requests blocked by CORS.
import assert from 'node:assert/strict';
import { openBrowser, type HeadlessBrowser } from '@remotion/renderer';

const url = process.env.REELSMITH_AUDIT_URL;
if (!url) {
  console.log('network-runtime.verify: skipped (set REELSMITH_AUDIT_URL to a live local editor URL to run it)');
  process.exit(0);
}
const origin = new URL(url).origin;
assert.ok(/^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/.test(origin), 'audit target must be localhost');

let browser: HeadlessBrowser | undefined;
try {
  browser = await openBrowser('chrome', { logLevel: 'error' });
  const page = await browser.newPage({
    context: () => null,
    logLevel: 'error',
    indent: false,
    pageIndex: 0,
    onBrowserLog: null,
    onLog: () => undefined,
  });
  const requests: string[] = [];
  const client = page._client();
  const domClient = client as unknown as { send(method: string, params?: Record<string, unknown>): Promise<{ value: { root?: { nodeId: number }; nodeId?: number } }> };
  await client.send('Network.enable');
  client.on('Network.requestWillBeSent', ({ request }: { request: { url: string } }) => {
    if (!request.url.startsWith(origin) && !request.url.startsWith('data:') && !request.url.startsWith('blob:')) {
      requests.push(request.url);
    }
  });
  const response = await page.goto({ url, timeout: 30_000 });
  assert.equal(response?.status(), 200, `editor returned HTTP ${response?.status()}`);
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 5000)));
  const title = await page.evaluate(() => document.title);
  assert.equal(title, 'Reelsmith');
  const fixture = process.env.REELSMITH_AUDIT_IMPORT;
  if (fixture) {
    const { value: documentNode } = await domClient.send('DOM.getDocument');
    assert.ok(documentNode.root?.nodeId, 'document root missing');
    const { value: input } = await domClient.send('DOM.querySelector', {
      nodeId: documentNode.root.nodeId,
      selector: '.cc-media-pool input[type="file"]',
    });
    assert.ok(input.nodeId, 'media pool file input missing');
    await domClient.send('DOM.setFileInputFiles', { nodeId: input.nodeId, files: [fixture] });
    const filename = fixture.split('/').at(-1)!;
    let imported = false;
    for (let i = 0; i < 20; i += 1) {
      await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 1000)));
      imported = await page.evaluate((name) => [...document.querySelectorAll('.cc-media-pool button')].some((button) => button.getAttribute('aria-label')?.includes(name)), filename);
      if (imported) break;
    }
    assert.ok(imported, `fixture import did not finish: ${filename}`);
    await page.evaluate((name) => {
      const button = [...document.querySelectorAll('.cc-media-pool button')].find((item) => item.getAttribute('aria-label')?.includes(name));
      if (!button) throw new Error('imported media button missing');
      button.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    }, filename);
    await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 1500)));
    const placed = await page.evaluate((name) => document.querySelector('.cc-timeline')?.textContent?.includes(name) ?? false, filename);
    assert.ok(placed, 'imported clip was not placed on timeline');
    console.log('network-runtime.verify: imported and placed', filename);
  }
  await page.evaluate(() => {
    const button = [...document.querySelectorAll('button')].find((item) => item.getAttribute('aria-label') === 'Export MP4');
    if (!button) throw new Error('Export MP4 button missing');
    button.click();
  });
  await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 1000)));
  const exportDialog = await page.evaluate(() => [...document.querySelectorAll('[role="dialog"]')].some((dialog) => dialog.textContent?.includes('Export video')));
  assert.ok(exportDialog, 'export dialog did not open');
  if (process.env.REELSMITH_AUDIT_EXPORT === '1') {
    await page.evaluate(() => {
      const button = [...document.querySelectorAll('button')].find((item) => item.textContent?.trim() === 'Export video');
      if (!button) throw new Error('Export video button missing');
      button.click();
    });
    for (let i = 0; i < 24; i += 1) {
      await page.evaluate(() => new Promise((resolve) => setTimeout(resolve, 5000)));
      const state = await page.evaluate(() => [...document.querySelectorAll('[role="dialog"]')].map((dialog) => dialog.textContent?.slice(-500)).join(' | '));
      if (/Export complete|Export succeeded|completed/i.test(state) || !state) {
        console.log('export state:', state);
        break;
      }
      if (i === 23) throw new Error(`export did not finish: ${state}`);
    }
  }
  assert.deepEqual(requests, [], `outbound browser requests: ${requests.join(', ')}`);
  console.log('network-runtime.verify: editor loaded with no outbound browser requests');
} finally {
  if (browser) await browser.close({ silent: true });
}
