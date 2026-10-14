// Smoke test: load the built extension on a home page full of recommendations,
// scroll all the way down like a user would, and check nothing breaks.
// Fully local (all requests fulfilled from fixtures); no Instagram account or traffic.
import { chromium } from 'playwright';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const capturedPost = await readFile(new URL('../tests/instagram-div-post.html', import.meta.url), 'utf8');
const GAP = 24, BATCHES = 6, PER_BATCH = 10;
const page_html = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>
  body { margin: 0 } nav, #stories { height: 60px }
  #feed { display: flex; flex-direction: column; gap: ${GAP}px; width: min(470px, 100%); margin: auto }
  #feed > article { height: 500px; flex-shrink: 0; margin: 0; overflow: hidden }
</style></head><body>
<nav><a href="/">Home</a><a href="/direct/inbox/">Messages</a></nav>
<main><div id="stories"><a href="/stories/alice/1/">Alice</a></div><div id="feed"></div></main>
<script>
  const html = decodeURIComponent("${encodeURIComponent(capturedPost)}");
  let batch = 0;
  function appendBatch() {
    for (let i = 0; i < ${PER_BATCH}; i++) {
      const post = document.createElement('article');
      post.id = 'b' + batch + 'p' + i;
      post.dataset.allowed = String((i % 5 === 0 || i === ${PER_BATCH - 1}));
      post.innerHTML = html;
      for (const link of post.querySelectorAll('a[href]')) link.href = '/author_' + batch + '_' + i + '/';
      if (post.dataset.allowed === 'true') {
        for (const s of post.querySelectorAll('span')) if (!s.children.length && s.textContent === 'Suggested for you') s.textContent = 'Ordinary post';
        for (const c of post.querySelectorAll('[role="button"]')) if (c.textContent === 'Follow') c.remove();
      }
      const permalink = document.createElement('a'); permalink.href = '/p/' + post.id + '/'; post.append(permalink);
      document.querySelector('#feed').append(post);
    }
    batch++;
    // Infinite scroll: load more when the last post (hidden or not) nears the viewport.
    if (batch < ${BATCHES}) {
      const last = document.querySelector('#feed').lastElementChild;
      const io = new IntersectionObserver(e => { if (e.some(x => x.isIntersecting)) { io.disconnect(); setTimeout(appendBatch, 150); } }, { rootMargin: '800px' });
      io.observe(last);
    }
  }
  appendBatch();
</script></body></html>`;

async function checkFeed(page, label) {
  const posts = await page.locator('#feed > article').evaluateAll(list => list.map(p => {
    const r = p.getBoundingClientRect();
    return { id: p.id, allowed: p.dataset.allowed === 'true', height: r.height, top: r.top + scrollY, bottom: r.bottom + scrollY,
      visible: getComputedStyle(p).visibility !== 'hidden' };
  }));
  let prev;
  for (const p of posts) {
    if (!p.allowed) { assert.equal(p.height, 0, `${label}: ${p.id} suggestion must leave no layout slot`); continue; }
    assert.ok(p.height > 0 && p.visible, `${label}: ${p.id} allowed post must stay visible`);
    if (prev) assert.ok(Math.abs(p.top - prev.bottom - GAP) < 1, `${label}: gap of ${p.top - prev.bottom}px between ${prev.id} and ${p.id}`);
    prev = p;
  }
  return posts;
}

const extension = resolve('dist/chromium');
await mkdir('test-results', { recursive: true });
const context = await chromium.launchPersistentContext(resolve(`test-results/smoke-profile-${Date.now()}`), {
  channel: process.env.SMOKE_CHANNEL ?? 'msedge', headless: true,
  args: [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`]
});
try {
  await context.route('**/*', route => route.request().resourceType() === 'document'
    ? route.fulfill({ contentType: 'text/html', body: page_html }) : route.abort());
  for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
    const label = `${viewport.width}x${viewport.height}`;
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.setViewportSize(viewport);
    await page.goto('https://www.instagram.com/');
    await page.waitForSelector('#hush-controls', { state: 'attached' });
    await page.waitForFunction(() => document.querySelectorAll('#feed [data-hush-hidden="post"]').length > 0);
    await checkFeed(page, `${label} initial`);

    // Scroll like a user: wheel in steps until the last batch has loaded and we hit the bottom.
    const total = BATCHES * PER_BATCH;
    let lastY = 0, idle = 0;
    for (let step = 0; step < 200 && idle < 8; step++) {
      await page.mouse.move(viewport.width / 2, viewport.height / 2);
      await page.mouse.wheel(0, 400);
      await page.waitForTimeout(80);
      const { y, count } = await page.evaluate(() => ({ y: scrollY, count: document.querySelectorAll('#feed > article').length }));
      assert.ok(y >= lastY - 1, `${label}: scroll jumped back from ${lastY} to ${y}`);
      idle = y === lastY && count === total ? idle + 1 : 0;
      lastY = y;
    }
await page.waitForFunction(t => document.querySelectorAll('#feed > article').length === t, total, { timeout: 5000 });
    await page.waitForTimeout(400); // let the filter settle on the last batch
    const posts = await checkFeed(page, `${label} end`);
    const suggested = posts.filter(p => !p.allowed).length;
    assert.equal(await page.locator('#feed [data-hush-hidden="post"]').count(), suggested, `${label}: every suggestion hidden, no allowed post hidden`);
    const bottom = await page.evaluate(() => scrollY + innerHeight >= document.documentElement.scrollHeight - 2);
    assert.ok(bottom, `${label}: reached the bottom of the feed`);
    const last = posts.filter(p => p.allowed).at(-1);
    assert.ok(await page.locator('#' + last.id).isVisible(), `${label}: last allowed post visible at the bottom`);
    await page.screenshot({ path: `test-results/smoke-${label}.png` });
    assert.deepEqual(errors, [], `${label}: page errors`);
    console.log(`PASS smoke ${label}: scrolled ${lastY}px through ${total} posts (${suggested} suggestions collapsed), no gaps, no errors`);
    await page.close();
  }
} finally { await context.close(); }
