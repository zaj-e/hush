/* Pure policy shared by content script and tests. No network or storage. */
(function (scope) {
  'use strict';
  const HOSTS = new Set(['instagram.com', 'www.instagram.com', 'm.instagram.com']);
  const SUGGESTED = new Set(['Suggested for you', 'Sugerencias para ti', 'Sugerido para ti']);
  const FOLLOWING = new Set(['Following', 'Siguiendo']);
  const FOLLOW = new Set(['Follow', 'Seguir']);
  const REPOST = new Set(['Reposted by', 'reposted', 'Reposted', 'Republicado por', 'republicó']);
  const PostState = Object.freeze({ UNKNOWN: 0, SUGGESTED: 1, PRESERVED: -1 });
  const RESERVED = new Set(['explore', 'reel', 'reels', 'direct', 'stories', 'accounts', 'p', 'tv', 'about', 'legal', 'developer', 'web', 'share']);
  function urlOf(value, base = 'https://www.instagram.com/') {
    try {
      const url = new URL(value, base);
      return url.protocol === 'https:' && HOSTS.has(url.hostname) ? url : null;
    } catch { return null; }
  }
  function parts(url) {
    try { return decodeURIComponent(url.pathname).split('/').filter(Boolean); }
    catch { return url.pathname.split('/').filter(Boolean); }
  }
  function route(value, base) {
    const url = urlOf(value, base);
    if (!url) return 'outside';
    const p = parts(url);
    // The bare /explore/ page is Instagram's Search. Keep it for finding people;
    // its post grid is hidden by CSS. Other Explore routes (tags, places) stay blocked.
    if (p[0] === 'explore') return p.length === 1 || (p[1] === 'search' && p.length === 2) ? 'search' : 'explore';
    if (p[0] === 'reel' || p[0] === 'reels') return 'reels';
    // Specific user reel routes are blocked; profile tabs remain.
    if ((p[1] === 'reel' || p[1] === 'reels') && p.length > 2) return 'reels';
    if (!p.length) return 'home';
    if (p[0] === 'direct') return 'direct';
    return 'social';
  }
  // A single Reel, as opposed to the /reels/ viewer. Only these may be allowed once.
  function reelKey(value, base) {
    const url = urlOf(value, base);
    if (!url) return null;
    const p = parts(url);
    const single = (p[0] === 'reel' && p.length === 2) || (p[1] === 'reel' && p.length === 3 && profilePath(p[0]));
    return single ? '/' + p.join('/') + '/' : null;
  }
  // The bare Reels destination, as used by navigation, not a specific item.
  function feedPath(value, base) {
    const url = urlOf(value, base);
    if (!url) return false;
    const p = parts(url);
    return p.length === 1 && p[0] === 'reels';
  }
  function blocked(value, base) { return ['explore', 'reels'].includes(route(value, base)); }
  function profilePath(value) {
    const name = value.trim().replace(/^@/, '');
    if (!/^[A-Za-z0-9_](?:[A-Za-z0-9_.]{0,28}[A-Za-z0-9_])?$/.test(name) || name.includes('..') || RESERVED.has(name.toLowerCase())) return null;
    return '/' + name + '/';
  }
  function text(node) { return node.textContent.replace(/\s+/g, ' ').trim(); }
  function leaves(header) {
    // Exact header labels only, never caption/comment text or linked names.
    return [...header.querySelectorAll('span,div')].filter(n => !n.children.length && !n.closest('a,button,[role="button"],h1,h2,h3'));
  }
  function postHeaders(article) {
    const headers = [...article.querySelectorAll('header')].filter(h => h.closest('article') === article && !h.closest('[role="dialog"]'));
    if (headers.length || article.closest('[role="dialog"]')) return headers;
    // The observed div layout puts the author row first, before media/captions.
    // Descend only through that leading branch, never search arbitrary post text.
    for (let row = article.firstElementChild; row; row = row.firstElementChild) {
      if (!row.matches('div') || row.closest('article') !== article || row.closest('[role="dialog"]')) break;
      const images = [...row.querySelectorAll('img')];
      // Collaborative posts have multiple author avatars and may omit Follow.
      const avatarOnly = images.length > 0 && images.every(image => image.closest('a,[role="link"]'));
      const author = [...row.querySelectorAll('a[href]')].some(a => {
        const url = urlOf(a.getAttribute('href'));
        return url && profilePath(parts(url).join('/')) === url.pathname;
      });
      if (avatarOnly && author && row.querySelector('[role="button"][aria-haspopup="dialog"],button[aria-haspopup="dialog"]') &&
          !row.querySelector('video,audio,section,article,[role="dialog"]')) return [row];
    }
    return [];
  }
  function suggestionState(article) {
    const headers = postHeaders(article);
    if (!headers.length) return PostState.UNKNOWN; // Unknown is not evidence to reverse a decision.
    for (const header of headers) {
      if (leaves(header).some(n => REPOST.has(text(n)))) return PostState.PRESERVED;
      if ([...header.querySelectorAll('button,[role="button"]')].some(n => FOLLOWING.has(text(n)))) return PostState.PRESERVED;
      if ([...header.querySelectorAll('a[href]')].some(a => {
        const row = a.parentElement;
        return row && row.textContent.length < 100 && /(?:\breposted|\brepublicó)\s*$/u.test(text(row));
      })) return PostState.PRESERVED;
    }
    // The verified div author row can omit the suggestion label (video overlays).
    // Do not infer this from a Follow control elsewhere in a post or caption.
    return headers.some(header => leaves(header).some(n => SUGGESTED.has(text(n))) ||
      (header.matches('div') && [...header.querySelectorAll('button,[role="button"]')].some(n => FOLLOW.has(text(n)))))
      ? PostState.SUGGESTED : PostState.UNKNOWN;
  }
  function postIdentity(article) {
    const links = [...article.querySelectorAll('a[href]')].filter(a => a.closest('article') === article);
    const post = links.map(a => urlOf(a.getAttribute('href'))).filter(Boolean)
      .map(url => url.pathname.match(/\/(?:p|reel)\/([^/]+)\/?$/)?.[1]).find(Boolean) || '';
    const authors = [...new Set(postHeaders(article).flatMap(header => [...header.querySelectorAll('a[href]')])
      .map(a => urlOf(a.getAttribute('href'))).filter(url => url && profilePath(parts(url).join('/')) === url.pathname)
      .map(url => url.pathname.toLowerCase()))].sort().join('|');
    return { post, authors };
  }
  function suggested(article) { return suggestionState(article) === PostState.SUGGESTED; }
  scope.HushPolicy = Object.freeze({ route, blocked, feedPath, reelKey, profilePath, suggested, suggestionState, postIdentity, PostState });
})(globalThis);

