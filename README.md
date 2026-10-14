<p align="center">
  <img src="icons/icon.svg" alt="Hush logo" width="96" height="96">
</p>

<h1 align="center">Hush</h1>

Hush is a browser extension that quiets Instagram's website. It hides the recommendation noise (Explore, Reels and "Suggested for you" posts) and leaves the social parts alone: friends' posts, DMs, stories, profiles and comments.

## What it does

| Hush hides or blocks | Hush leaves alone |
| --- | --- |
| Reels links in the navigation | Posts from people you follow |
| The recommended post grid on the Search page (`/explore/`) | Search by name, which still works |
| `/explore/tags/*`, `/reel/*` and `/reels/*` pages (replaced by a small local panel) | Reposts, captions, comments |
| "Suggested for you" posts in the Home feed (English and Spanish labels) | DMs, stories, profiles |
| Posts whose author row shows a Follow/Seguir button | Profile Reels tabs, ordinary post pages |

Also:

- Hidden posts collapse without leaving blank gaps, and they stay hidden while you scroll.
- Instagram's own Search (`/explore/`) stays available for finding people. Hush hides the recommended posts under the search bar.
- Reel pages and the Reels feed are blocked. A single Reel (for example one a friend sent) shows an **Open this Reel once** button. It applies to that Reel only and ends when you leave it. Instagram may still suggest more Reels after it. Inline videos in DMs and ordinary posts still play.

## Install

Hush is not in any extension store yet. You can load it yourself:

1. Download or build the extension (see [Build](#build-and-test)).
2. **Chrome / Edge:** open `chrome://extensions` or `edge://extensions`, turn on **Developer mode**, click **Load unpacked**, and select the `dist/chromium` folder.
3. Reload any open Instagram tabs.

**Firefox:** the Firefox build is unsigned, so regular Firefox won't install it permanently. Signing and Android steps are in [docs/INSTALL.md](docs/INSTALL.md).

## Privacy and permissions

- Runs only on `instagram.com`, `www.instagram.com` and `m.instagram.com`.
- No tabs, history, cookies, storage, messaging, background or network permissions.
- No analytics, accounts, remote code, API calls or logging. Nothing leaves your browser.
- Filtering decisions are kept in memory only.
- Your browser will warn that the extension can read Instagram pages. That is required for any extension that changes a page.

Hush only changes how a page is displayed. It does not call Instagram's API, read your following list, or automate any action. This is a UI filter, not a network firewall: Instagram may still download content that Hush hides. Using any extension on a website may be restricted by that site's terms, so use Hush at your own discretion.

## Known limitations

- **Unlabeled suggestions can't be detected.** Hush decides from what the page shows. If Instagram marks a post with no "Suggested for you" label and no Follow button (for example some collab posts), nothing in the page says it's a recommendation, so the post stays visible. Hush deliberately leaves unknown posts alone rather than risk hiding a friend's post.
- **Instagram changes its site often.** Labels, layout and routes can change without notice, and Hush may stop catching posts until selectors are updated. See [docs/SELECTORS.md](docs/SELECTORS.md).
- **Short flashes are possible.** Hush checks the page URL every 250 ms, so a blocked page may render briefly before the panel appears.
- **Languages:** only English and Spanish suggestion labels are recognized.
- **Not device-tested:** the Firefox minimum versions (desktop 140, Android 142) are manifest targets, not tested minimums.
- A full list of what has and hasn't been verified is in [docs/VERIFICATION.md](docs/VERIFICATION.md).

## Build and test

Requires Node 22.13+ (or 24+) and npm.

```sh
npm ci
npm run build          # outputs to dist/
npm test               # unit and package tests
npm run lint:firefox
npx playwright install chromium firefox
npm run test:browser
npm run test:scroll
npm run test:smoke     # loads dist/chromium, scrolls a 60-post filtered home feed end to end
```

On Windows with Edge installed, `npm run verify:edge` runs the build, tests, lint and the installed-Edge checks in one step.

`src/` holds all runtime code and `manifests/` holds the per-browser differences. The build produces unpacked folders, a Chromium ZIP, an unsigned Firefox XPI, a source ZIP and SHA-256 checksums.

Tests use synthetic fixtures. They do not sign in to or contact Instagram, and none sends messages.

## Contributing

Bug reports and fixes are welcome. If Hush misses or wrongly hides a post, the most useful report is the sanitized markup of that post (remove usernames, tokens and image URLs). Selectors should only be updated from real, sanitized examples, with a regression test that checks followed posts stay visible. There are no automatic updates, so reload the extension after you rebuild.

## License

[AGPL-3.0-or-later](LICENSE). You can use, modify and share Hush, including commercially, but any modified version you distribute or host as a network service must be released under the same license with its source. The name and logo are covered separately by the [trademark policy](TRADEMARK.md).

## Disclaimer

Hush is an independent project. It is not affiliated with, endorsed by or sponsored by Meta Platforms, Inc. or Instagram. "Instagram" is a trademark of its owner and is used here only to describe what the extension works with.
