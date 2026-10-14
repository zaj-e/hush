import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dom, fixture, hidden, wait } from './helpers.mjs';

test('recognized div author rows with Follow are filtered even without a suggestion label', async () => {
  const html = await readFile(new URL('./instagram-div-post.html', import.meta.url), 'utf8');
  const d = dom(undefined, `<main><article id="unlabelled">${html.replaceAll('Suggested for you', '')}</article></main>`);
  try {
    await wait(); assert.equal(hidden(d, 'unlabelled'), true);
    const article = d.window.document.querySelector('article');
    const follow = [...article.querySelectorAll('[role="button"]')].find(n => n.textContent === 'Follow');
    follow.textContent = 'Following';
    await wait(); assert.equal(hidden(d, 'unlabelled'), false);
    follow.textContent = 'Follow';
    article.firstElementChild.firstElementChild.insertAdjacentHTML('afterbegin', '<div><a href="/friend/">friend</a> reposted</div>');
    await wait(); assert.equal(hidden(d, 'unlabelled'), false);
    assert.deepEqual(d.errors, []);
  } finally { d.window.close(); }
});

test('collapsed suggestions survive unloaded markup, but new posts and explicit exemptions are restored', async () => {
  const d = dom(undefined, '<main><article id="post"><header><a href="/author/">Author</a><span>Suggested for you</span><button>Follow</button></header><a href="/p/one/">Post</a></article></main>');
  try {
    const a = d.window.document.querySelector('article');
    const original = a.innerHTML;
    await wait(); assert.equal(hidden(d, 'post'), true);
    a.querySelector('span').textContent = '';
    await wait(); assert.equal(hidden(d, 'post'), true, 'label loss is not an allowed-post signal');
    a.innerHTML = '';
    await wait(); assert.equal(hidden(d, 'post'), true, 'unloaded article stays collapsed');
    a.innerHTML = original.replace('Suggested for you', '');
    await wait(); assert.equal(hidden(d, 'post'), true);
    a.querySelector('a[href="/p/one/"]').href = '/p/two/';
    await wait(); assert.equal(hidden(d, 'post'), false, 'new permalink resets the decision');
    a.querySelector('span').textContent = 'Suggested for you';
    await wait(); assert.equal(hidden(d, 'post'), true);
    a.querySelector('button').textContent = 'Following';
    await wait(); assert.equal(hidden(d, 'post'), false, 'following overrides cached suggestion');
    a.innerHTML = original;
    await wait(); assert.equal(hidden(d, 'post'), true);
    const replacement = a.cloneNode(true);
    replacement.removeAttribute('data-hush-hidden');
    replacement.querySelector('span').textContent = '';
    a.replaceWith(replacement);
    await wait(); assert.equal(hidden(d, 'post'), true, 'same permalink survives element replacement');
    replacement.querySelector('header').insertAdjacentHTML('afterbegin', '<span>Reposted by</span>');
    await wait(); assert.equal(hidden(d, 'post'), false, 'repost overrides remembered decision');
    replacement.innerHTML = '<header><a href="/author/">Author</a><span>Suggested for you</span></header>';
    await wait(); assert.equal(hidden(d, 'post'), true);
    replacement.innerHTML = '<header><a href="/friend/">Friend</a></header>';
    await wait(); assert.equal(hidden(d, 'post'), false, 'changed author restores a post without a permalink');
    assert.deepEqual(d.errors, []);
  } finally { d.window.close(); }
});

test('collaborative suggestion with two linked avatars needs no Follow button', async () => {
  const post = await readFile(new URL('./instagram-div-post.html', import.meta.url), 'utf8');
  const d = dom(undefined, `<main><article id="collab">${post}</article><article id="friend"><header><a href="/friend/">Friend</a></header></article></main>`);
  try {
    const article = d.window.document.querySelector('#collab');
    const avatar = article.querySelector('[role="link"]');
    avatar.after(avatar.cloneNode(true));
    [...article.querySelectorAll('[role="button"]')].find(n => n.textContent === 'Follow').remove();
    await wait();
    assert.equal(hidden(d, 'collab'), true);
    assert.equal(article.getAttribute('data-hush-hidden'), 'post');
    assert.equal(hidden(d, 'friend'), false);
    const row = article.firstElementChild.firstElementChild;
    row.insertAdjacentHTML('afterbegin', '<div><a href="/friend/">friend</a> reposted</div>');
    await wait(); assert.equal(hidden(d, 'collab'), false);
    assert.deepEqual(d.errors, []);
  } finally { d.window.close(); }
});

test('observed div header hides suggestions and preserves captions, reposts and recycled posts', async () => {
  const post = await readFile(new URL('./instagram-div-post.html', import.meta.url), 'utf8');
  const d = dom(undefined, `<main><article id="observed">${post}</article></main>`);
  try {
    const article = d.window.document.querySelector('article');
    assert.equal(article.querySelectorAll('header').length, 0);
    await wait();
    assert.equal(hidden(d, 'observed'), true);
    const label = [...article.querySelectorAll('span')].find(n => n.textContent === 'Suggested for you' && !n.children.length);
    const follow = [...article.querySelectorAll('[role="button"]')].find(n => n.textContent === 'Follow');
    follow.textContent = 'Following';
    await wait(); assert.equal(hidden(d, 'observed'), false);
    follow.textContent = 'Follow';
    const row = article.firstElementChild.firstElementChild;
    row.insertAdjacentHTML('afterbegin', '<div id="attribution"><a href="/friend/">friend</a> reposted</div>');
    await wait(); assert.equal(hidden(d, 'observed'), false);
    row.querySelector('#attribution').remove();
    label.textContent = 'Ordinary label';
    follow.remove();
    article.insertAdjacentHTML('beforeend', '<div><span>Suggested for you</span><button>Follow</button></div>');
    await wait(); assert.equal(hidden(d, 'observed'), false, 'caption cannot supply the label');
    label.textContent = 'Suggested for you';
    await wait(); assert.equal(hidden(d, 'observed'), true);
    const dialog = d.window.document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    article.parentElement.append(dialog); dialog.append(article);
    await wait(); assert.equal(hidden(d, 'observed'), false);
    assert.deepEqual(d.errors, []);
  } finally { d.window.close(); }
});

test('exact routes block discovery and all standalone Reels, with URL boundary checks', () => {
  const d = dom(undefined, undefined, false), p = d.window.HushPolicy;
  try {
    for (const path of ['/explore/tags/cats/', '/explore/locations/1/', '/reels/', '/reels/ABC/', '/reel/ABC/?igsh=x', '/%65xplore/tags/cats/', '/explore%2Ftags/', '/alice/reel/ABC/', '/alice/reels/ABC/', '/share/reel/ABC/']) assert.equal(p.blocked(path), true, path);
    assert.equal(p.reelKey('/reel/ABC/?igsh=x'), '/reel/ABC/'); assert.equal(p.reelKey('/alice/reel/ABC/'), '/alice/reel/ABC/');
    for (const path of ['/reels/', '/reels/ABC/', '/explore/', '/share/reel/ABC/', '/reel/', '/']) assert.equal(p.reelKey(path), null, path);
    for (const path of ['/explore', '/explore/', '/explore/search/?q=alice', '/', '/?variant=following', '/direct/t/123/', '/alice/', '/alice/reels/', '/stories/alice/1/', '/p/ABC/', '/explorer/', '/reels_fan/', 'https://example.com/reels/', 'https://instagram.com.evil.test/explore/']) assert.equal(p.blocked(path), false, path);
    for (const host of ['instagram.com', 'www.instagram.com', 'm.instagram.com']) assert.equal(p.blocked(`https://${host}/reels/`), true);
  } finally { d.window.close(); }
});

test('Search (/explore/) is allowed and marks the page so its post grid is hidden', async () => {
  const d = dom('https://www.instagram.com/explore/');
  try {
    await wait();
    const html = d.window.document.documentElement;
    assert.equal(html.hasAttribute('data-hush-blocked'), false);
    assert.ok(html.hasAttribute('data-hush-search'));
    d.window.history.pushState({}, '', '/alice/'); await wait(320);
    assert.equal(html.hasAttribute('data-hush-search'), false);
  } finally { d.window.close(); }
});

test('username lookup allows exact handles without allowing paths or URLs', () => {
  const d = dom(undefined, undefined, false), p = d.window.HushPolicy;
  try {
    for (const [input, expected] of [['@alice', '/alice/'], ['a.b_12', '/a.b_12/'], ['a', '/a/']]) assert.equal(p.profilePath(input), expected);
    for (const input of ['https://evil.test', '../explore', 'explore', 'REELS', 'a/b', 'a..b', 'a'.repeat(31), '<script>', '']) assert.equal(p.profilePath(input), null);
  } finally { d.window.close(); }
});

test('home classifier preserves followed creators, captions, reposts, dialogs and ambiguous posts', async () => {
  const d = dom();
  try {
    await wait();
    assert.equal(hidden(d, 'suggested'), true);
    for (const id of ['followed','creator','repost','caption','unknown','name','followonly','modal','shared']) assert.equal(hidden(d, id), false, id);
    assert.equal(hidden(d, 'explore'), true);
    assert.equal(hidden(d, 'reels'), true);
    assert.ok(d.window.document.getElementById('search'));
    assert.ok(d.window.document.getElementById('stories'));
    assert.deepEqual(d.errors, []);
  } finally { d.window.close(); }
});

test('dynamic inserts, label edits, Follow changes and recycled nodes are re-evaluated', async () => {
  const d = dom();
  try {
    await wait();
    const article = d.window.document.getElementById('suggested').cloneNode(true);
    article.id = 'dynamic'; article.removeAttribute('data-hush-hidden');
    d.window.document.querySelector('main').append(article);
    await wait(); assert.equal(hidden(d, 'dynamic'), true);
    article.querySelector('button').firstChild.data = 'Following';
    await wait(); assert.equal(hidden(d, 'dynamic'), false);
    article.querySelector('button').textContent = 'Follow';
    article.querySelector('span').textContent = 'Other label';
    await wait(); assert.equal(hidden(d, 'dynamic'), false);
    article.querySelector('span').textContent = 'Sugerencias para ti';
    article.querySelector('button').textContent = 'Seguir';
    await wait(); assert.equal(hidden(d, 'dynamic'), true);
    article.querySelector('header').insertAdjacentHTML('beforeend','<span>Republicado por</span>');
    await wait(); assert.equal(hidden(d, 'dynamic'), false);
  } finally { d.window.close(); }
});

test('SPA history, direct entry and Back/Forward block without changing history or reloading', async () => {
  const d = dom('https://www.instagram.com/explore/tags/cats/');
  try {
    const w = d.window, html = w.document.documentElement;
    await wait(); assert.ok(html.hasAttribute('data-hush-blocked'));
    w.history.replaceState({}, '', '/direct/inbox/');
    await wait(320); assert.equal(html.hasAttribute('data-hush-blocked'), false);
    assert.equal(hidden(d, 'suggested'), false);
    w.history.pushState({}, '', '/reel/ABC/');
    await wait(320); assert.ok(html.hasAttribute('data-hush-blocked'));
    assert.equal(w.history.length, 2);
    w.history.back(); await wait(150); assert.equal(html.hasAttribute('data-hush-blocked'), false);
    w.history.forward(); await wait(150); assert.ok(html.hasAttribute('data-hush-blocked'));
    assert.equal(w.history.length, 2);
    assert.deepEqual(d.errors, []);
  } finally { d.window.close(); }
});

test('DM content remains visible; shared standalone Reel clicks are canceled; inline video is preserved', async () => {
  const d = dom('https://www.instagram.com/direct/t/1/');
  try {
    await wait();
    assert.equal(hidden(d, 'suggested'), false);
    assert.equal(hidden(d, 'shared'), false);
    const shared = d.window.document.getElementById('shared');
    for (const type of ['click', 'auxclick']) {
      const event = new d.window.MouseEvent(type, { bubbles: true, cancelable: true, ctrlKey: true });
      assert.equal(shared.dispatchEvent(event), false);
    }
    assert.equal(d.window.location.pathname, '/direct/t/1/');
    assert.equal(d.window.document.querySelector('video').hasAttribute('data-hush-hidden'), false);
    assert.equal(d.window.document.querySelectorAll('#hush-controls').length, 1);
  } finally { d.window.close(); }
});

test('navigation href mutations and idle processing are bounded', async () => {
  const d = dom();
  try {
    await wait();
    const a = d.window.document.getElementById('explore');
    a.href = '/alice/'; await wait(); assert.equal(hidden(d, 'explore'), false);
    a.href = '/reels/'; await wait(); assert.equal(hidden(d, 'explore'), true);
    let calls = 0;
    const original = d.window.Element.prototype.querySelectorAll;
    d.window.Element.prototype.querySelectorAll = function (...args) { calls++; return original.apply(this, args); };
    await wait(650); assert.equal(calls, 0, 'idle URL watchdog must not rescan DOM');
    const main = d.window.document.querySelector('main');
    for (let i = 0; i < 200; i++) main.append(d.window.document.createElement('div'));
    await wait(180); assert.ok(calls < 120, `burst scans: ${calls}`);
    assert.deepEqual(d.errors, []);
  } finally { d.window.close(); }
});

test('profiles and supported story paths never apply home filtering', async () => {
  for (const path of ['/alice/', '/alice/reels/', '/stories/alice/123/', '/p/ABC/']) {
    const d = dom('https://www.instagram.com' + path);
    try { await wait(); assert.equal(hidden(d, 'suggested'), false); assert.equal(d.window.document.documentElement.hasAttribute('data-hush-blocked'), false); }
    finally { d.window.close(); }
  }
});


test('media cannot play on blocked routes or inside hidden suggestions', async () => {
  const d = dom();
  try {
    await wait();
    const video = d.window.document.querySelector('video');
    let pauses = 0;
    video.pause = () => { pauses++; };
    video.dispatchEvent(new d.window.Event('play'));
    assert.equal(pauses, 0, 'ordinary inline video is unaffected');
    d.window.document.getElementById('suggested').append(video);
    video.dispatchEvent(new d.window.Event('play'));
    assert.equal(pauses, 1, 'hidden suggestion video paused');
    d.window.document.querySelector('main').append(video);
    d.window.history.pushState({}, '', '/reel/ABC/');
    video.dispatchEvent(new d.window.Event('play'));
    assert.equal(pauses, 2, 'route read immediately even before watchdog');
  } finally { d.window.close(); }
});

test('body replacement and back-forward cache lifecycle restore one set of controls', async () => {
  const d = dom();
  try {
    await wait();
    d.window.document.body.innerHTML = '<main><article id="newpost"><header><span>Suggested for you</span><button>Follow</button></header></article></main>';
    await wait();
    assert.equal(d.window.document.querySelectorAll('#hush-controls').length, 1);
    assert.equal(hidden(d, 'newpost'), true);
    d.window.dispatchEvent(new d.window.Event('pagehide'));
    d.window.history.replaceState({}, '', '/reels/');
    d.window.dispatchEvent(new d.window.Event('pageshow'));
    await wait();
    assert.equal(d.window.document.documentElement.hasAttribute('data-hush-blocked'), true);
    assert.equal(d.window.document.querySelectorAll('#hush-controls').length, 1);
  } finally { d.window.close(); }
});

test('a single Reel can be opened once from the panel; the Reels feed cannot, and leaving re-blocks', async () => {
  const d = dom('https://www.instagram.com/reel/ABC/');
  try {
    const w = d.window, html = w.document.documentElement;
    await wait(); assert.ok(html.hasAttribute('data-hush-blocked'));
    const shadow = w.document.getElementById('hush-controls').shadowRoot;
    const button = shadow.querySelector('.allow-page');
    assert.equal(button.hidden, false);
    button.click(); await wait(100);
    assert.equal(html.hasAttribute('data-hush-blocked'), false);
    w.history.pushState({}, '', '/direct/inbox/'); await wait(320);
    w.history.pushState({}, '', '/reel/ABC/'); await wait(320);
    assert.ok(html.hasAttribute('data-hush-blocked'), 'allowance ends when leaving the Reel');
    w.history.pushState({}, '', '/reels/'); await wait(320);
    assert.ok(html.hasAttribute('data-hush-blocked'));
    assert.equal(shadow.querySelector('.allow-page').hidden, true, 'no allowance for the feed');
    assert.deepEqual(d.errors, []);
  } finally { d.window.close(); }
});

test('a shared Reel link in a DM is canceled, then opened once from the notice', async () => {
  const d = dom('https://www.instagram.com/direct/t/1/');
  try {
    const w = d.window;
    await wait();
    const shared = w.document.getElementById('shared');
    let clicks = 0;
    shared.addEventListener('click', event => { clicks++; event.preventDefault(); });
    assert.equal(shared.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true })), false);
    assert.equal(clicks, 0);
    const shadow = w.document.getElementById('hush-controls').shadowRoot;
    const open = shadow.querySelector('.allow-link');
    assert.equal(open.hidden, false);
    open.click();
    assert.equal(clicks, 1, 'the original link click is replayed once');
    assert.equal(open.hidden, true);
    const feed = w.document.getElementById('reels');
    assert.equal(feed.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true })), false);
    assert.equal(shadow.querySelector('.allow-link').hidden, true, 'the feed gets no open button');
  } finally { d.window.close(); }
});

test('the Messages sidebar hides the bare Reels link but not shared Reels', async () => {
  const html = fixture.replace('<nav>', '<div id="side">').replace('</nav>', '</div>');
  const d = dom('https://www.instagram.com/direct/t/1/', html);
  try {
    await wait();
    assert.equal(hidden(d, 'reels'), true);
    assert.equal(hidden(d, 'shared'), false);
    assert.deepEqual(d.errors, []);
  } finally { d.window.close(); }
});
