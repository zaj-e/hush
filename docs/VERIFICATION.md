# Verification record — 2026-10-11

## 0.1.4: Follow-only posts and loading triggers

Two new regressions failed before the fix: the captured div author row with its
suggestion label removed remained visible, and an IntersectionObserver watching
a display:none tail post never requested the next batch. The installed Edge
suite now verifies the latter at both viewport sizes. Hidden posts retain an
invisible zero-height box, and column flex gaps are canceled. Explicit Following
and recognized repost attribution still override the Follow-only rule.

These tests model concrete failure mechanisms, not Instagram's private loader.
Browser control lost the live Edge connection before this incident could be
inspected. Live Instagram compatibility remains unverified for this build.

## 2026-10-12: readability and regression coverage

The initial readability refactor was rolled back after a reported blank feed,
but no specific refactor change was demonstrated to cause that live failure.
The replacement coverage in `tests/feed-layout.mjs` checks the actual installed
extension, not just the classifier: 30 posts with captured anonymous div-based
markup, consecutive suggestions, measured spacing between allowed posts, and
later appended batches reachable by scrolling. Negative controls deliberately
retain hidden-post height or insert a 600px spacer; both must be rejected by the
same assertions. This covers the blank-space symptom but does not reproduce
Instagram's network pagination or prove the screenshot's root cause.

`npm run verify:edge` is the combined build and verification entry point. Named
state constants, timing/cache limits, the identity-change helper and an independent
stateless scrolling-test baseline are retained. The established classification
API, numeric return values and Map-based cache remain intact while the exact live
failure is unresolved.

## Completed

- Ten automated jsdom fixture tests plus two package/source integrity tests passed: URL scope, username validation, followed creators versus suggestions, caption/name false positives, repost preservation, dynamic insertion and edits, recycled nodes, DMs, stories/profile exclusions, silent history changes, Back/Forward, and canceled shared-Reel clicks.
- Idle watchdog performed zero DOM queries in the instrumented fixture interval; a 200-node mutation burst was batched. These are regression bounds, not a performance benchmark on Instagram.
- Both packages built. Mozilla's `web-ext lint` initially reported 0 errors, 0 warnings, 0 notices for the Firefox build. The project now uses the underlying standalone Mozilla `addons-linter` to avoid unrelated device-runner dependencies.

- **Installed Edge 154.0.4258.37: PASS**, loading the actual unpacked extension at 1280×900 and 390×844. Verified visible/hidden fixture content, direct and author-qualified/shared Reel routes, SPA history, Back/Forward, native DM-page preservation, blocked shared-Reel clicks, and dynamically inserted/recycled posts. No page JavaScript errors. Mobile-sized Edge is not Firefox Android.
- Edge script-injection mode also passed the same fixtures at both sizes. This extra mode exercises the portable source without extension installation.
- Inspected the actual extension's mobile blocked-page screenshot: text and navigation fit the viewport. Screenshots and raw results are reproducible under ignored `test-results/`; a compact result record is retained in `docs/browser-results.json`.
- Final standalone Mozilla `addons-linter` reported **0 errors, 0 warnings, 0 notices**. Final `npm audit` reported **0 vulnerabilities**. Packaged runtime has no third-party dependencies.

## Not verified

- **Live Instagram:** an Edge Home feed was inspected on 2026-10-11. An unhidden collaborative suggestion had two linked author avatars, an exact suggestion label and no Follow control. Hidden articles had zero layout height under the old CSS. The updated 0.1.1 build has not yet been reloaded and verified in that live session; do not infer complete live compatibility from fixture passes.
- **Firefox Android:** no device/emulator session available. Current official manifest/content-script/signing documentation was checked, but Android installation, touch interactions and live mobile Instagram have not been tested.
- **Downloaded test browsers:** Chrome for Testing 156.0.8078.4 and Playwright Firefox 157.0 failed to launch on this Windows host with a side-by-side configuration error. This is an environment failure, not a passing or failing extension compatibility result.
- No Mozilla signing, AMO submission, extension store publication, or native Instagram app modification occurred.

## Before treating this as a live-compatible release

Use an authorized account and test each scenario on desktop Chrome/Edge and an Android device with the signed or temporary Firefox build. Record exact browser versions, locale, date, and sanitized DOM structures; never commit conversations, tokens or personal content.

1. Paste Explore/tag and Reels/individual-Reel URLs. Navigate there through the website, reload, and traverse Back/Forward. Confirm blocking, no history growth, no reload loop, no hidden audio.
2. On Home, compare visible followed accounts (including creators not personally known) with explicit suggestions. Check friend reposts of unfollowed authors, different header layouts, and posts/captions quoting recommendation labels.
3. Read an existing DM; open a profile, supported story, and native person search. Verify no conversation or ordinary post disappears. No test needs to send a message.
4. Open a shared Reel from a DM and a profile: standalone playback must be blocked as documented. Test inline previews separately; do not promise they exist on every layout.
5. Scroll through dynamically inserted posts; navigate between Home, profile, story and DMs without reload. Exercise site locale changes, content recycling, mobile viewport/orientation, background/resume and keyboard/middle-click navigation.
6. Inspect for remaining recommendation overlays that keep a social URL. Add narrow verified selectors if possible; otherwise record the gap. Do not broaden matching to arbitrary text or unfollowed authors.

## Reproduce

`npm ci`, `npm run build`, `npm test`, `npm run lint:firefox`. Browser suite: `npx playwright install chromium firefox`, then `npm run test:browser`. Individual engines can be selected with `edge-extension`, `edge-script`, `chromium-extension`, or `firefox-script` arguments. The script-only modes inject the same source/CSS into synthetic pages; they do not verify installation or isolated-world behavior. Extension mode loads the real unpacked Chromium package. All page requests are fulfilled/aborted locally.



## 0.1.1 scrolling regression

`node scripts/scroll-test.mjs` passed in isolated headless Edge outside the process sandbox. The synthetic height-dependent virtualizer reproduced repeated collapse/restore with the old display:none rule. With the new visibility rule, the post stayed hidden, descendants could not override hiding, and document height and scroll position stayed unchanged across ten updates. This is a model of the failure mechanism, not a claim that Instagram uses the same virtualizer implementation. The new collaborative-post regression covers two author avatars without Follow and preserves repost attribution.

## 0.1.2 continuous feed

The user confirmed 0.1.1 filtered suggestions and stopped the instability, but reported blank spaces. Version 0.1.2 restores collapsing CSS and retains suggestion decisions through missing/unloaded labels. The isolated Edge scroll test passed: the stateless baseline oscillates under the same CSS, while the new stateful classifier leaves zero post height, no blank slot, stable scroll position after the first collapse across ten updates, and restores a recycled ordinary post with a new permalink. Live 0.1.2 behavior still requires reloading the extension.
