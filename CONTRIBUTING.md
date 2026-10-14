# Contributing to Hush

Thanks for helping. Hush is a small project, so contributing is simple.

## The most useful thing you can do

Instagram changes its markup constantly. If Hush misses a suggested post or
hides one it shouldn't, open an issue with:

- What happened and what you expected
- Browser and version, and your Instagram language
- **Sanitized** markup of the post. Remove usernames, tokens and image URLs.
  Never paste conversations or personal content.

## Code changes

1. Fork the repo and create a branch.
2. `npm ci`, then make your change in `src/` (see `docs/SELECTORS.md`).
3. Run `npm run build && npm test && npm run lint:firefox`.
4. Open a pull request describing what changed and why.

## Ground rules

- **Never hide a followed person's post.** When unsure, leave the post visible.
  Every selector change needs a regression test proving followed posts stay
  visible.
- Update selectors only from real, sanitized examples, not guesses.
- No network calls, analytics, remote code or new permissions. The privacy
  promise in the README is a hard requirement.
- Keep dependencies minimal. They are dev-only today.
- Tests use synthetic fixtures. Do not add tests that contact Instagram.

## Scope

Hush filters what the page shows. It does not automate actions, call
Instagram's API or read your following list. Changes outside that scope will
likely be declined.

By contributing, you agree your work is released under the GNU Affero General Public License v3.0 or later (see `LICENSE`).
