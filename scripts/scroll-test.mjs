import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';

const policy = await readFile(new URL('../src/policy.js', import.meta.url), 'utf8');
const content = await readFile(new URL('../src/content.js', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/content.css', import.meta.url), 'utf8');
// Independent stateless baseline; do not rewrite production source to test it.
const statelessRuntime = `
  function filterPosts() {
    for (const article of document.querySelectorAll('article')) {
      if (HushPolicy.suggested(article)) article.setAttribute('data-hush-hidden', 'post');
      else article.removeAttribute('data-hush-hidden');
    }
  }
  new MutationObserver(filterPosts).observe(document, {
    subtree: true, childList: true, characterData: true
  });
  filterPosts();
`;
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  // Model a virtualized feed dropping an off-layout label, then restoring it
  // when the post has layout again. This reproduces the old hide/show cycle.
  for (const unstable of [true, false]) {
    const page = await browser.newPage({ viewport: { width: 1000, height: 700 } });
    await page.route('**/*', route => route.request().resourceType() === 'document'
      ? route.fulfill({ contentType: 'text/html', body: `<!doctype html><style>
          body { margin: 0 } .space { height: 900px } article { height: 600px }
          #below { height: 1500px }
        </style><main><div class="space"></div><article id="post">
          <header><span id="label">Suggested for you</span><button>Follow</button></header>
          <a href="/p/original/">Post</a>
          <div style="visibility:visible">Suggested content</div>
        </article><div id="below">Followed post</div></main>` })
      : route.abort());
    await page.goto('https://www.instagram.com/');
    await page.addStyleTag({ content: css });
    await page.evaluate(() => scrollTo(0, 1550));
    const before = await page.evaluate(() => ({ y: scrollY, height: document.documentElement.scrollHeight }));
    // Same collapsing CSS in both cases: isolate the decision-state fix.
    const runtime = unstable ? statelessRuntime : content;
    await page.addScriptTag({ content: policy + '\n' + runtime });
    const samples = [];
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(80);
      samples.push(await page.evaluate(() => {
        const post = document.querySelector('#post');
        const label = document.querySelector('#label');
        const height = post.getBoundingClientRect().height;
        const result = { height, y: scrollY, pageHeight: document.documentElement.scrollHeight,
          hidden: post.hasAttribute('data-hush-hidden'), belowTop: document.querySelector('#below').offsetTop };
        const next = height === 0 ? '' : 'Suggested for you';
        if (label.textContent !== next) label.textContent = next;
        return result;
      }));
    }
    if (unstable) {
      assert.ok(samples.some(s => s.height === 0) && samples.some(s => s.height === 600), 'stateless decisions reproduce the collapse/restore loop');
    } else {
      for (const s of samples) {
        assert.equal(s.height, 0);
        assert.equal(s.pageHeight, before.height - 600);
        assert.equal(s.belowTop, 900, 'allowed post immediately follows preceding content with no blank slot');
        assert.equal(s.y, samples[0].y, 'scroll position stays stable after the initial collapse');
        assert.equal(s.hidden, true);
      }
      await page.evaluate(() => document.querySelector('#post a').setAttribute('href', '/p/recycled/'));
      await page.waitForTimeout(100);
      assert.equal(await page.locator('#post').isVisible(), true, 'recycled ordinary post is restored');
    }
    console.log(unstable ? 'Stateless classification: reproduced collapse/restore loop' : 'Stable classification: no gap, no repeated scrolling across 10 updates; recycled post restored');
    await page.close();
  }
} finally { await browser.close(); }
