# Changelog

## v1.2.6
- You can now edit a pinned custom filter instead of recreating it.

## v1.2.5
- The update prompt now always offers the newest version, even if you're several releases behind.

## v1.2.4
- Minor under-the-hood maintenance and stability tweaks.

## v1.2.3
- Fixed the menu bar panel sometimes not opening, jumping to a fullscreen space, or needing a second click.
- The menu bar icon now stays highlighted while the panel is open.

## v1.2.2
- The Replies tab now has the same dismiss checkmark as PRs; ticking it removes that comment.
- Dismissed PRs and comments now stay dismissed after restarting the app.

## v1.2.1
- Made the "Reviewed by Me" dismiss checkmark clearly visible and stopped it overlapping the row.
- Dismissing a PR now also clears its replies from the Replies tab.

## v1.2.0
- PRs you simply commented on now show under "Reviewed by Me", along with replies to those comments.
- Added a dismiss checkmark on "Reviewed by Me" to hide stale PRs and clear their replies.

## v1.1.9
- Moved the update notice to a compact pill in the top bar; click it to see what's new right inside the app.

## v1.1.8
- Redesigned the setup screen with a clearer, guided way to create a GitHub token, including screenshots you can click to enlarge.
- Added a step for authorizing SAML SSO, the most common reason work PRs don't show up.
- Empty tabs now hint that a token may need SSO authorized when PRs are missing.

## v1.1.7
- Custom filters now ask for the repository before labels, so label suggestions match the repos you pick.
- Added an optional advanced query field to custom filters — use any GitHub search qualifiers (e.g. `draft:false -review:approved`) together with the structured fields.
- The update banner now shows a "What's new" summary right inside the app, so you can review changes without opening GitHub.

## v1.1.6
- Internal release; changes are listed under v1.1.7.

## v1.1.5
- Verified the automated Homebrew cask updates on each release.
