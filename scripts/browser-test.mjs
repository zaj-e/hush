import { chromium, firefox } from 'playwright';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { fixture, policySource, contentSource } from '../tests/helpers.mjs';
import { checkFeedLayout, checkFeedPagination } from '../tests/feed-layout.mjs';
const css = await readFile(new URL('../src/content.css', import.meta.url), 'utf8');
await mkdir('test-results', { recursive: true });
const results = [];
for (const mode of (process.argv.length > 2 ? process.argv.slice(2) : ['chromium-extension', 'edge-script', 'firefox-script'])) {
  let browser, context;
  if (mode.endsWith('-extension')) {
    const extension = resolve('dist/chromium');
    context = await chromium.launchPersistentContext(resolve(`test-results/profile-${Date.now()}`), {
      channel: mode === 'edge-extension' ? 'msedge' : 'chromium', headless: true,
      args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
    });
  } else {
    browser = await (mode === 'firefox-script' ? firefox : chromium).launch({ headless: true, ...(mode === 'edge-script' ? { channel: 'msedge' } : {}) });
    context = await browser.newContext();
    // Engine-level test only; not a Firefox/Edge extension-install test.
    await context.addInitScript({ content: policySource + '\n' + contentSource });
  }
  const errors = [];
  // Fulfill every request locally; no account access and no live Instagram traffic.
  await context.route('**/*', route => route.request().resourceType() === 'document'
    ? route.fulfill({ contentType: 'text/html', body: fixture.replace('<html>', '<html><head><meta name="viewport" content="width=device-width,initial-scale=1">' + (mode.endsWith('-extension') ? '' : `<style>${css}</style>`) + '</head>') })
    : route.abort());
  const page = await context.newPage();
  page.on('pageerror', e => errors.push(e.message));
  const isBlocked = () => page.locator('html').getAttribute('data-hush-blocked');
  const settle = () => page.waitForTimeout(360);
  try {
    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await page.goto('https://www.instagram.com/');
      await page.waitForSelector('#hush-controls', { state: 'attached' });
      await settle();
      assert.equal(await page.locator('#suggested').isVisible(), false);
      for (const id of ['followed', 'creator', 'repost', 'caption', 'unknown', 'name', 'followonly', 'stories', 'search']) assert.equal(await page.locator('#'+id).isVisible(), true, `${mode}: ${id}`);
      assert.equal(await page.locator('#explore').isVisible(), false);
      assert.equal(await page.locator('#reels').isVisible(), false);
      await page.evaluate(() => history.pushState({}, '', '/explore/'));
      await settle(); assert.notEqual(await isBlocked(), null);
      assert.equal(await page.locator('main').isVisible(), false);
      await page.goBack(); await settle(); assert.equal(await isBlocked(), null);
      await page.goForward(); await settle(); assert.notEqual(await isBlocked(), null);
      await page.evaluate(() => history.replaceState({}, '', '/direct/t/1/'));
      await settle(); assert.equal(await isBlocked(), null);
      assert.equal(await page.locator('#suggested').isVisible(), true);
      await page.locator('#shared').click(); await settle();
      assert.equal(new URL(page.url()).pathname, '/direct/t/1/');
      assert.equal(await page.locator('#inline').isVisible(), true);
      await page.goto('https://www.instagram.com/alice/'); await settle();
      assert.equal(await isBlocked(), null);
      for (const path of ['/explore/tags/cats/', '/reels/', '/reel/ABC123/', '/alice/reel/ABC123/', '/share/reel/ABC123/']) {
        await page.goto('https://www.instagram.com' + path); await settle();
        assert.notEqual(await isBlocked(), null, path);
        assert.equal(await page.locator('main').isVisible(), false);
        const count = await page.evaluate(() => history.length);
        await page.waitForTimeout(600);
        assert.equal(new URL(page.url()).pathname, path);
        assert.equal(await page.evaluate(() => history.length), count);
      }
      await page.screenshot({ path: `test-results/${mode}-${viewport.width}-blocked.png` });
      await page.goto('https://www.instagram.com/'); await settle();
      await page.evaluate(() => {
        const a = document.querySelector('#suggested').cloneNode(true);
        a.id = 'inserted'; a.removeAttribute('data-hush-hidden'); document.querySelector('main').append(a);
      });
      await settle(); assert.equal(await page.locator('#inserted').isVisible(), false);
      await page.evaluate(() => document.querySelector('#inserted button').textContent = 'Following');
      await settle(); assert.equal(await page.locator('#inserted').isVisible(), true);
      await page.screenshot({ path: `test-results/${mode}-${viewport.width}-home.png` });
      await checkFeedLayout(page);
      await page.screenshot({ path: `test-results/${mode}-${viewport.width}-continuous-feed.png` });
      await checkFeedPagination(page);
    }
    assert.deepEqual(errors, []);
    results.push({ mode, version: context.browser()?.version() ?? browser?.version(), viewports: ['1280x900','390x844'], result: 'PASS', liveInstagram: false });
    console.log(`PASS ${mode}: desktop/mobile fixtures, routes, history, DMs, lookup, dynamic filtering`);
  } finally { await context.close(); if (browser) await browser.close(); }
}
await writeFile('test-results/browser-results.json', JSON.stringify(results, null, 2) + '\n');



