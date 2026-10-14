import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const capturedPost = await readFile(new URL('./instagram-div-post.html', import.meta.url), 'utf8');
const GAP = 24;

export async function checkFeedPagination(page) {
  await page.evaluate(() => {
    document.querySelector('main').innerHTML = `<div id="pagination-feed">
      <article style="height:180px"><header><a href="/friend/">Friend</a></header>Allowed post</article>
      <article id="pagination-tail" style="height:500px"><header><span>Suggested for you</span></header></article>
    </div>`;
    scrollTo(0, 0);
  });
  await page.waitForFunction(() => document.querySelector('#pagination-tail').hasAttribute('data-hush-hidden'));
  await page.evaluate(() => {
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      observer.disconnect();
      document.querySelector('#pagination-feed').insertAdjacentHTML('beforeend',
        '<article id="pagination-loaded" style="height:180px"><header><a href="/next_friend/">Next friend</a></header>Next allowed post</article>');
    });
    observer.observe(document.querySelector('#pagination-tail'));
  });
  await page.locator('#pagination-loaded').waitFor({ state: 'visible', timeout: 2500 });
  const gap = await page.evaluate(() => {
    const posts = document.querySelectorAll('#pagination-feed > article');
    return posts[2].getBoundingClientRect().top - posts[0].getBoundingClientRect().bottom;
  });
  assert.ok(Math.abs(gap) < 1, `pagination leaves no blank slot: ${gap}px`);
  console.log('PASS pagination: collapsed tail remains observable and next allowed post loads without scrolling up');
}

async function assertContinuousFeed(page) {
  const layout = await page.locator('#regression-feed > article').evaluateAll(posts => posts.map(post => {
    const rect = post.getBoundingClientRect();
    return { id: post.id, allowed: post.dataset.allowed === 'true', height: rect.height,
      top: rect.top, bottom: rect.bottom, visible: getComputedStyle(post).visibility !== 'hidden' };
  }));
  let previous;
  for (const post of layout) {
    if (!post.allowed) {
      assert.equal(post.height, 0, `${post.id}: filtered post must leave no layout slot`);
      continue;
    }
    assert.ok(post.height > 0 && post.visible, `${post.id}: allowed post must remain visible`);
    if (previous) {
      assert.ok(Math.abs(post.top - previous.bottom - GAP) < 1,
        `${previous.id} -> ${post.id}: unexpected gap of ${post.top - previous.bottom}px`);
    }
    previous = post;
  }
  assert.ok(previous, 'the feed must retain allowed posts');
}

export async function checkFeedLayout(page) {
  // Real captured structure, anonymous content, deterministic geometry. This
  // exercises the installed extension's mutation observer and packaged CSS.
  await page.addStyleTag({ content: `
    body { margin: 0 }
    #regression-feed { display: flex; flex-direction: column; gap: ${GAP}px; width: min(470px, 100%); margin: auto }
    #regression-feed > article { height: 500px; flex-shrink: 0; margin: 0; overflow: hidden }
  ` });
  await page.evaluate(html => {
    document.querySelector('main').innerHTML = '<div id="regression-feed"></div>';
    // Each batch has several consecutive recommendations between allowed posts.
    window.appendRegressionBatch = batch => {
      for (let index = 0; index < 10; index++) {
        const post = document.createElement('article');
        post.id = `batch-${batch}-post-${index}`;
        post.dataset.allowed = String(index === 0 || index === 9);
        post.innerHTML = html;
        for (const link of post.querySelectorAll('a[href]')) link.href = `/author_${batch}_${index}/`;
        if (post.dataset.allowed === 'true') {
          for (const label of post.querySelectorAll('span')) {
            if (!label.children.length && label.textContent === 'Suggested for you') label.textContent = 'Ordinary post';
          }
          for (const control of post.querySelectorAll('[role="button"]')) {
            if (control.textContent === 'Follow') control.remove();
          }
        }
        const permalink = document.createElement('a');
        permalink.href = `/p/${post.id}/`;
        post.append(permalink);
        document.querySelector('#regression-feed').append(post);
      }
    };
    window.appendRegressionBatch(0);
  }, capturedPost);
  await page.waitForFunction(() => document.querySelectorAll('#regression-feed [data-hush-hidden="post"]').length === 8);
  await assertContinuousFeed(page);

  // Append new content after scrolling, as a paginated feed would. This models
  // DOM delivery, not Instagram's private network or pagination implementation.
  for (const batch of [1, 2]) {
    await page.locator(`#batch-${batch - 1}-post-9`).scrollIntoViewIfNeeded();
    await page.evaluate(batch => window.appendRegressionBatch(batch), batch);
    await page.waitForFunction(expected => document.querySelectorAll('#regression-feed [data-hush-hidden="post"]').length === expected, (batch + 1) * 8);
    await assertContinuousFeed(page);
  }
  await page.locator('#batch-2-post-9').scrollIntoViewIfNeeded();
  const visibleInViewport = await page.locator('#batch-2-post-9').evaluate(post => {
    const rect = post.getBoundingClientRect();
    return rect.bottom > 0 && rect.top < innerHeight;
  });
  assert.ok(visibleInViewport, 'later allowed content must be reachable by scrolling');

  // Prove that the assertions catch the reported class of failure. A visibility
  // check alone would pass for hidden suggestions that still occupy 500px.
  const brokenCss = await page.addStyleTag({ content: '#regression-feed > article[data-hush-hidden] { display: block !important; height:500px!important; max-height:none!important; flex:0 0 500px!important; visibility: hidden !important }' });
  await assert.rejects(() => assertContinuousFeed(page), /must leave no layout slot/);
  await brokenCss.evaluate(style => style.remove());

  // Also catch blank space outside the article, e.g. a virtualizer spacer.
  await page.locator('#batch-1-post-0').evaluate(post => { post.style.marginTop = '600px'; });
  await assert.rejects(() => assertContinuousFeed(page), /unexpected gap/);
  await page.locator('#batch-1-post-0').evaluate(post => { post.style.marginTop = ''; });
  await assertContinuousFeed(page);
  console.log('PASS feed layout: 30 posts, later batches reachable, no gaps; both deliberate gap regressions rejected');
}
