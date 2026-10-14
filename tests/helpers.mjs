import { readFile } from 'node:fs/promises';
import { JSDOM, VirtualConsole } from 'jsdom';
export const policySource = await readFile(new URL('../src/policy.js', import.meta.url), 'utf8');
export const contentSource = await readFile(new URL('../src/content.js', import.meta.url), 'utf8');
export const fixture = `<!doctype html><html><body>
<nav><a id="explore" href="/explore/tags/cats/">Explore</a><a id="reels" href="/reels/">Reels</a><button id="search">Search</button><a href="/direct/inbox/">DMs</a></nav>
<main>
<div id="stories"><a href="/stories/alice/123/">Alice's story</a></div>
<article id="followed"><header><a href="/alice/">Alice</a></header><p>Suggested for you: my favorite photo</p></article>
<article id="creator"><header><a href="/creator/">A creator I follow, not a personal friend</a></header><p>Post</p></article>
<article id="suggested"><header><span>Suggested for you</span><a href="/stranger/">Stranger</a><button>Follow</button></header><p>Post</p></article>
<article id="repost"><header><span>Suggested for you</span><button>Follow</button><div><a href="/alice/">alice</a> reposted</div></header><p>Reposted account need not be followed</p></article>
<article id="caption"><header><a href="/alice/">Alice</a></header><p><span>Suggested for you</span><button>Follow</button></p></article>
<article id="unknown"><div>Suggested for you</div><button>Follow</button></article>
<article id="name"><header><a href="/person/"><span>Suggested for you</span></a><button>Follow</button></header></article>
<article id="followonly"><header><a href="/person/">Person</a><button>Follow</button></header></article>
<div role="dialog"><article id="modal"><header><span>Suggested for you</span><button>Follow</button></header></article></div>
<a id="shared" href="/reel/ABC123/">Shared video</a><video id="inline" controls></video>
</main></body></html>`;
export function dom(url = 'https://www.instagram.com/', html = fixture, start = true) {
  const errors = [];
  const console = new VirtualConsole();
  console.on('jsdomError', e => errors.push(e.message));
  const instance = new JSDOM(html, { url, runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole: console });
  instance.errors = errors;
  instance.window.eval(policySource);
  if (start) instance.window.eval(contentSource);
  return instance;
}
export const wait = (ms = 100) => new Promise(resolve => setTimeout(resolve, ms));
export const hidden = (d, id) => d.window.document.getElementById(id).hasAttribute('data-hush-hidden');
