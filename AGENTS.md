# Working on GitBar

Guidance for any AI agent working on this project. Read before making changes.

GitBar is a macOS menu bar Electron app for GitHub PR/notification triage.

- **Repos**: source `patel-rushi/Gitbar` (the remote prints a harmless "repository moved" notice on push — ignore it). Homebrew tap lives in the separate `patel-rushi/homebrew-gitbar`; CI auto-bumps its cask on every release.
- **Stack**: Electron main in `electron/*.ts`; renderer is React + Vite + Zustand in `src/*`. State + persistence in `src/store.ts` (localStorage **and** main-process electron-store via `gitbar-data.json`; hydrate dismissal/persistent state from the main store on startup). GitHub REST calls in `src/github.ts`. Analytics via PostHog (`electron/analytics.ts`), configured from `POSTHOG_PROJECT_TOKEN`/`POSTHOG_HOST` in `.env` (see `.env.example`; `.env` is gitignored, injected into the packaged build via `vite.config.ts` `define`). Anonymous installs use a random id persisted in `gitbar-analytics-id.json`; after GitHub auth, events are attributed to `github:<user id>` (renderer calls `window.gitbar.identifyAnalytics`/`trackAnalytics`/`resetAnalytics` over the preload IPC bridge, validated in `main.ts`'s `track-analytics` handler). No events send until `.env` has a real project token.
- **Node**: ALWAYS run node/npm via nvm first: `source ~/.nvm/nvm.sh && nvm use`. System node is v16 and breaks `vite build`. `.nvmrc` pins 18.18.0.

## Releasing
**NEVER cut a new version (bump version, tag, or push a release) without the user's explicit permission — no exceptions.** Implement and verify changes, then ask before releasing. Cut a release only when the user explicitly says so (e.g. "cut a release"). Steps once permitted:
1. Bump `version` in `package.json`.
2. Add a `## vX.Y.Z` section at the top of `CHANGELOG.md`. The release workflow extracts this exact section as the GitHub release body and the in-app "What's new" banner renders it.
3. Verify: `npx tsc --noEmit -p tsconfig.json` then `npx vite build` (via nvm).
4. `git add -A` → commit → push `main` → `git tag vX.Y.Z` → push the tag.
5. Watch it: `gh run watch <id> -R patel-rushi/Gitbar --exit-status` (gh commands need network permission). Then confirm the `homebrew-gitbar` cask bumped (`git fetch` + check `Casks/gitbar.rb`).
6. Report back with a small table: workflow run link, release link, cask commit.

## Changelog entries (the in-app "What's new")
The `## vX.Y.Z` bullets are shown verbatim in the app's update panel, so write them for end users, not developers:
- One short bullet per user-visible change; lead with the benefit or outcome.
- Plain and casual. No code names, file names, function names, or how it was built.
- Capitalize, end with a period, no hyphens/em-dashes as punctuation.
- Frame from the user's side ("You can now…", "… now shows…", "Fixed a…").
- Skip purely internal work, or fold it into one line like "Minor under-the-hood maintenance."

Real examples that hit the mark:
- "You can now edit a pinned custom filter instead of recreating it."
- "The update prompt now always offers the newest version, even if you're several releases behind."
- "Fixed a false 'token expired' message that appeared on a passing token."
- "Moved the update notice to a compact pill in the top bar; click it to see what's new right inside the app."

## Previewing UI before shipping
The user likes to SEE UI changes. Dev disables the updater, so to preview update/MainPanel UI: temporarily seed store state (e.g. `view:'main'`, mock data, fake `pendingUpdateVersion`) with `// TEMP_PREVIEW` markers. Run `npx vite --port 5174` (nvm), `open -a "Google Chrome"` the URL, position the window with AppleScript, `screencapture -x -R` a region, and read/embed the image. **Always revert every `TEMP_PREVIEW` edit afterward** (`rg TEMP_PREVIEW src/` must be empty) before building/releasing.

## Demo mode for recordings
Use demo mode when recording videos/screenshots and you want zero real PR/notification data visible.

- Start it explicitly in local dev only: `source ~/.nvm/nvm.sh && nvm use && VITE_GITBAR_DEMO=1 npm run dev`.
- Demo mode is intentionally gated to local dev/unpackaged runs only, and should never appear in normal packaged app flows.
- Demo persistence is namespaced with `*_demo` keys so real app token/settings/state are not affected.
- Do not rely on hidden preview edits for recordings when demo mode is available.

## Naming + agent hygiene
- If a feature's UI label changes but behavior/data model stays the same, prefer keeping existing internal code names to avoid broad churn. Example: keep `PinnedFilters` / `gitbar_custom_filters` internals while showing "Custom Filters" in UI copy.
- Keep Review Requested filter configuration inside the Review Requested tab itself, not in Settings. Use in-context guidance that explains users can control which PRs appear there.
- Keep sign-out session-only. Revoke Token & Sign Out should disconnect the account but leave user customization and local data intact; provide a separate danger-styled full reset action for clearing everything.
- In My PRs, treat review state and pipeline health as separate signals. Keep pipeline as a distinct CI chip style (not a plain approval icon variant) and keep fetch cost capped to top visible items during poll.
- GitHub rate limits are a hard product constraint, not a reason to avoid necessary fresh data. Prefer cached data for startup and local UI updates, batch independent requests, and cap per-PR enrichment to visible/recent items. Make GitHub calls when remote state must be refreshed, but never solely to recalculate derived local state such as counters, badges, filters, or dismissals.
- The menu bar counter is the number of visible, actionable Review Requested PRs. Derive it from the cached Review Requested list and local ignored state, including on startup and ignore/unignore actions; never add a GitHub request just to update the counter.
- Tab dots indicate unread comment or reply rows that are currently visible in that tab. Do not derive them from persisted notification history; Review Requested uses the menu bar counter instead of a duplicate dot.
- Treat `AGENTS.md` as a living checklist for future diff agents. After any meaningful product change, add or update brief guidance that captures:
	- user-visible naming decisions
	- persistence guarantees (restart, update, sign out/in behavior)
	- API or polling cost decisions (what was removed/limited and why)
	- release-sensitive constraints
- Do this proactively in the same change set when relevant so the user does not need to ask explicitly.

## Style & communication
- User-facing copy (app text, changelog, release notes): short, casual, human. **No hyphens/em-dashes as punctuation** — write plainly.
- Code: no narrating comments; comments only for non-obvious intent. Match existing patterns. Run `ReadLints` after edits.
- Be concise and direct; give a recommendation. Proactively flag caveats (rate limits, security, irreversible git ops).
