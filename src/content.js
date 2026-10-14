(function () {
  'use strict';
  if (globalThis.__hushStarted) return;
  globalThis.__hushStarted = true;
  const policy = globalThis.HushPolicy;
  const { PostState } = policy;
  const HIDDEN = 'data-hush-hidden';
  const BLOCKED = 'data-hush-blocked';
  const SEARCH = 'data-hush-search';
  const MAX_REMEMBERED_POSTS = 500;
  const MAX_DIRTY_ROOTS = 100;
  const MAX_ALLOWED_REELS = 20;
  const FILTER_DELAY_MS = 50;
  const ROUTE_CHECK_MS = 250;
  let href = '', activeRoute = '', pending = false, timer = null;
  let ui, shadow, notice;
  const dirty = new Set();
  const postDecisions = new WeakMap();
  const knownSuggestions = new Map();
  // Single Reels the user explicitly opened. Memory only; dropped on leaving the Reel.
  const allowedReels = new Set();
  let pendingLink = null;
  function isBlocked(url) {
    return policy.blocked(url) && !allowedReels.has(policy.reelKey(url));
  }
  function allowReel(key) {
    allowedReels.add(key);
    if (allowedReels.size > MAX_ALLOWED_REELS) allowedReels.delete(allowedReels.values().next().value);
  }
  function identityChanged(identity, previous) {
    if (!previous) return false;
    // A missing field means content may have unloaded. Only nonempty changes
    // establish that React has reused the article for a different post.
    const changedPost = identity.post && previous.post && identity.post !== previous.post;
    const changedAuthors = identity.authors && previous.authors && identity.authors !== previous.authors;
    return !!(changedPost || changedAuthors);
  }
  function hidePost(article) {
    if (activeRoute !== 'home' || !article.closest('main,[role="main"]') || article.closest('[role="dialog"]')) return false;
    const identity = policy.postIdentity(article);
    const state = policy.suggestionState(article);
    let previous = postDecisions.get(article);
    if (identityChanged(identity, previous)) previous = null;
    const remembered = previous?.hide || (identity.post && knownSuggestions.has(identity.post));
    const hide = state === PostState.SUGGESTED || (state === PostState.UNKNOWN && remembered);
    postDecisions.set(article, {
      post: identity.post || previous?.post || '',
      authors: identity.authors || previous?.authors || '',
      hide: !!hide
    });
    const post = identity.post || previous?.post;
    if (post && state === PostState.PRESERVED) knownSuggestions.delete(post);
    if (post && hide) {
      knownSuggestions.set(post, true);
      if (knownSuggestions.size > MAX_REMEMBERED_POSTS) knownSuggestions.delete(knownSuggestions.keys().next().value);
    }
    return !!hide;
  }
  function mark(node, value, kind = '') {
    if (value && node.getAttribute(HIDDEN) !== kind) node.setAttribute(HIDDEN, kind);
    if (!value && node.hasAttribute(HIDDEN)) node.removeAttribute(HIDDEN);
  }
  function markPost(article, hidden) {
    if (hidden) {
      // A zero-height flex item still participates in its parent's gap. Cancel
      // that gap so observer-visible post boxes don't create empty feed slots.
      const parentStyle = getComputedStyle(article.parentElement);
      const gap = parentStyle.flexDirection === 'column' && /^\d+(?:\.\d+)?px$/.test(parentStyle.rowGap)
        ? parentStyle.rowGap : '0px';
      if (article.style.getPropertyValue('--hush-row-gap') !== gap) {
        article.style.setProperty('--hush-row-gap', gap);
      }
    } else {
      article.style.removeProperty('--hush-row-gap');
    }
    mark(article, hidden, 'post');
  }
  function navigationLink(anchor) {
    if (!isBlocked(anchor.href)) return false;
    // Hide the link itself, never a container that could include social content.
    if (anchor.closest('nav,[role="navigation"],aside')) return true;
    // Messages can contain shared links, so only the bare Explore/Reels destinations
    // are hidden there. Shared single Reels stay visible and are handled on click.
    if (activeRoute === 'direct') return policy.feedPath(anchor.href);
    return !anchor.closest('main,[role="main"],article,[role="dialog"]');
  }
  function filter(root) {
    if (!root || !root.isConnected || root === ui || ui?.contains(root)) return;
    const links = root.matches?.('a[href]') ? [root] : [];
    links.push(...root.querySelectorAll('a[href]'));
    for (const a of links) mark(a, navigationLink(a));
    const articles = root.matches?.('article') ? [root] : [];
    articles.push(...root.querySelectorAll('article'));
    for (const article of articles) {
      markPost(article, hidePost(article));
      if (article.hasAttribute(HIDDEN)) pauseMedia(article);
    }
  }
  function pauseMedia(root) {
    for (const media of root.querySelectorAll('video,audio')) if (!media.paused) media.pause();
  }
  function mount() {
    if (!document.body || ui?.isConnected) return;
    ui = document.createElement('div');
    ui.id = 'hush-controls';
    shadow = ui.attachShadow({ mode: 'open' });
    // Static extension-owned markup; no site data is inserted as HTML.
    shadow.innerHTML = `
      <style>
        :host { all: initial; font: 14px system-ui,sans-serif; color: #182026; }
        * { box-sizing: border-box; }
        .card { background: #fff; color: #1d2328; border: 1px solid #cfd6dc; border-radius: 16px; padding: 16px 18px; box-shadow: 0 8px 28px #0003; }
        .tools { position: fixed; right: 12px; bottom: max(80px, env(safe-area-inset-bottom)); z-index: 2147483647; width: 340px; max-width: calc(100vw - 24px); }
        .tools p { margin: 0; line-height: 1.5; color: #5b6770; }
        .tools .row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 14px; }
        .tools button { font: inherit; cursor: pointer; padding: 8px 16px; border-radius: 999px; border: 1px solid #cfd6dc; background: transparent; color: #1d2328; transition: background .15s; }
        .tools button:hover { background: #eef1f4; }
        .tools button:focus-visible { outline: 2px solid #075a9c; outline-offset: 2px; }
        .tools .allow-link { background: #1d2328; border-color: #1d2328; color: #fff; }
        .tools .allow-link:hover { background: #333c44; }
        button, a { font: inherit; }
        button { cursor: pointer; padding: 8px; }
        a { color: #075a9c; padding: 8px; display: inline-block; }
        @media (prefers-color-scheme: dark) {
          .card { background: #1c2227; color: #e8ecef; border-color: #323b42; box-shadow: 0 8px 28px #0008; }
          .tools p { color: #9aa6af; }
          .tools button { border-color: #323b42; color: #e8ecef; } .tools button:hover { background: #262e34; }
          .tools .allow-link { background: #e8ecef; border-color: #e8ecef; color: #0f1316; } .tools .allow-link:hover { background: #fff; }
        }
        .blocked { position: fixed; inset: 0; z-index: 2147483646; display: grid; place-items: center; padding: 24px; overflow: auto; color: #1d2328;
          background: radial-gradient(ellipse at 50% 35%, #fff 0%, #eef1f4 70%); }
        .hush { max-width: 360px; text-align: center; }
        .hush svg { width: 72px; height: 72px; color: #6b7882; margin-bottom: 20px; }
        .hush h1 { margin: 0 0 10px; font-size: 24px; font-weight: 600; letter-spacing: -0.01em; }
        .hush p { margin: 0 auto; color: #5b6770; line-height: 1.6; }
        .hush .actions { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; margin-top: 28px; }
        .hush .pill { padding: 9px 20px; border-radius: 999px; border: 1px solid #cfd6dc; background: transparent; color: #1d2328; text-decoration: none; transition: background .15s; }
        .hush .pill:hover { background: #fff; }
        .hush .pill:focus-visible, .hush button:focus-visible { outline: 2px solid #075a9c; outline-offset: 2px; }
        .hush .primary { background: #1d2328; border-color: #1d2328; color: #fff; }
        .hush .primary:hover { background: #333c44; }
        .hush .hint { margin-top: 22px; font-size: 12px; color: #8b97a0; }
        @media (prefers-color-scheme: dark) {
          .blocked { color: #e8ecef; background: radial-gradient(ellipse at 50% 35%, #1c2227 0%, #0f1316 70%); }
          .hush svg { color: #8b97a0; } .hush p { color: #9aa6af; } .hush .hint { color: #6b7882; }
          .hush .pill { border-color: #323b42; color: #e8ecef; } .hush .pill:hover { background: #1c2227; }
          .hush .primary { background: #e8ecef; border-color: #e8ecef; color: #0f1316; } .hush .primary:hover { background: #fff; }
        }
        @media (prefers-reduced-motion: reduce) { .hush .pill { transition: none; } }
        [hidden] { display: none !important; }
      </style>
      <section class="blocked" hidden aria-label="Blocked Instagram page">
        <div class="hush">
          <svg viewBox="0 0 72 72" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <circle cx="36" cy="36" r="5" fill="currentColor" stroke="none"/>
            <path d="M25 36a11 11 0 0 1 11-11" opacity=".75"/><path d="M47 36a11 11 0 0 1-11 11" opacity=".75"/>
            <path d="M17 36a19 19 0 0 1 19-19" opacity=".45"/><path d="M55 36a19 19 0 0 1-19 19" opacity=".45"/>
            <path d="M9 36a27 27 0 0 1 27-27" opacity=".2"/><path d="M63 36a27 27 0 0 1-27 27" opacity=".2"/>
          </svg>
          <h1>Hushed</h1>
          <p>Explore and Reels are quiet here. Search, friends' posts and messages work as usual.</p>
          <div class="actions">
            <button type="button" class="allow-page pill primary" hidden>Open this Reel once</button>
            <a class="pill" href="/">Home</a><a class="pill" href="/direct/inbox/">Messages</a>
          </div>
          <p class="hint">Or use Back to return.</p>
        </div>
      </section>
      <div class="tools card" hidden>
        <p role="status"></p>
        <div class="row">
          <button type="button" class="allow-link" hidden>Open this Reel once</button>
          <button type="button" class="dismiss">Dismiss</button>
        </div>
      </div>`;
    notice = shadow.querySelector('[role="status"]');
    shadow.querySelector('.allow-page').addEventListener('click', () => {
      const key = policy.reelKey(location.href);
      if (!key) return;
      allowReel(key);
      activeRoute = 'social';
      renderBlock();
      schedule(document.documentElement);
    });
    shadow.querySelector('.allow-link').addEventListener('click', () => {
      const anchor = pendingLink;
      const key = anchor && policy.reelKey(anchor.href);
      pendingLink = null;
      shadow.querySelector('.allow-link').hidden = true;
      if (!key) return;
      allowReel(key);
      anchor.click();
    });
    shadow.querySelector('.dismiss').addEventListener('click', () => {
      pendingLink = null;
      shadow.querySelector('.allow-link').hidden = true;
      shadow.querySelector('.tools').hidden = true;
    });
    document.body.append(ui);
    renderBlock();
  }
  function showNotice(message, anchor) {
    mount();
    if (!shadow) return;
    notice.textContent = message;
    pendingLink = anchor && policy.reelKey(anchor.href) ? anchor : null;
    shadow.querySelector('.allow-link').hidden = !pendingLink;
    shadow.querySelector('.tools').hidden = false;
  }
  function renderBlock() {
    const blocked = activeRoute === 'explore' || activeRoute === 'reels';
    document.documentElement?.toggleAttribute(BLOCKED, blocked);
    document.documentElement?.toggleAttribute(SEARCH, activeRoute === 'search');
    if (shadow) {
      shadow.querySelector('.blocked').hidden = !blocked;
      shadow.querySelector('.allow-page').hidden = !(blocked && policy.reelKey(location.href));
    }
    if (blocked || activeRoute === 'search') pauseMedia(document);
  }
  function checkRoute() {
    if (href === location.href) return false;
    const left = policy.reelKey(href);
    href = location.href;
    if (left && left !== policy.reelKey(href)) allowedReels.delete(left);
    activeRoute = policy.route(href);
    if (activeRoute === 'reels' && allowedReels.has(policy.reelKey(href))) activeRoute = 'social';
    renderBlock();
    if (document.documentElement) dirty.add(document.documentElement);
    return true;
  }
  function flush() {
    pending = false;
    checkRoute();
    mount();
    const roots = [...dirty];
    dirty.clear();
    for (const root of roots) {
      if (!roots.some(other => other !== root && other.contains(root))) filter(root);
    }
    if (isBlocked(location.href)) pauseMedia(document);
  }
  function schedule(root) {
    if (root) dirty.add(root);
    if (dirty.size > MAX_DIRTY_ROOTS) {
      dirty.clear();
      dirty.add(document.documentElement);
    }
    if (!pending) {
      pending = true;
      setTimeout(flush, FILTER_DELAY_MS);
    }
  }
  const observer = new MutationObserver(records => {
    checkRoute();
    for (const record of records) {
      const element = record.target.nodeType === Node.ELEMENT_NODE ? record.target : record.target.parentElement;
      if (!element || element === ui || ui?.contains(element)) continue;
      const article = element.closest('article');
      if (article) schedule(article);
      else if (record.type === 'attributes') schedule(element);
      else for (const node of record.addedNodes) if (node.nodeType === Node.ELEMENT_NODE) schedule(node);
    }
    if (!ui?.isConnected || dirty.size) schedule();
  });
  observer.observe(document, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['href'] });
  function resume() {
    if (timer !== null) return;
    // Isolated worlds cannot patch Instagram's history reliably. This is a URL-only
    // watchdog, not a repeated DOM scan. Covers silent pushState/replaceState.
    timer = setInterval(() => { if (checkRoute()) schedule(); }, ROUTE_CHECK_MS);
    if (checkRoute()) schedule();
  }
  for (const event of ['popstate', 'hashchange']) addEventListener(event, () => { checkRoute(); schedule(); });
  addEventListener('pageshow', () => { resume(); schedule(document.documentElement); });
  addEventListener('pagehide', () => { clearInterval(timer); timer = null; });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { checkRoute(); schedule(); } });
  function intercept(event) {
    const anchor = event.composedPath().find(n => n instanceof HTMLAnchorElement);
    if (!anchor || !isBlocked(anchor.href)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    showNotice('This Explore or standalone Reel link is blocked. Inline message videos remain available.', anchor);
  }
  document.addEventListener('click', intercept, true);
  document.addEventListener('auxclick', intercept, true);
  document.addEventListener('play', event => {
    if (isBlocked(location.href) || event.target.closest?.('[' + HIDDEN + ']')) event.target.pause();
  }, true);
  checkRoute();
  schedule(document.documentElement);
  resume();
})();

