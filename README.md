# GitBar

A macOS menu bar app that cuts through GitHub notification noise by surfacing only the signals that matter: replies on your PRs, replies to your comments, and @mentions.

## Features

- **Menu bar tray app** — lives quietly in the macOS top bar with badge counter
- **Smart notifications** — only fires for replies to your PRs, replies to your comments, @mentions, and review requests
- **Tabbed PR inbox** — My PRs, Reviewed by Me, Review Requested, I Commented, and custom Pinned Filters
- **1-minute polling** — configurable interval from 15s to 5min
- **Click to open** — any PR or notification opens the thread in your browser
- **Custom filters** — create pinned filters by label, repo, or author
- **Fully local** — your GitHub token, settings, and PR data stay on your machine
- **Anonymous usage analytics** — counts launches and update adoption (no PII; see [Privacy](#privacy))

## Setup

### Prerequisites

- macOS
- Node.js 18+ (use `nvm use` to activate via the included `.nvmrc`)

### Development

```bash
# Install dependencies
npm install

# Run in development mode (Vite dev server + Electron)
npm run electron:dev
```

### Build DMG

```bash
# Build production app and package as .dmg
npm run electron:build
```

The DMG installer will be output to the `release/` directory.

## Releasing

GitBar ships via **GitHub Releases** with in-app auto-updates (`electron-updater`).

### First-time install

**Homebrew (recommended)** — no Gatekeeper warnings, auto-strips quarantine:

```bash
brew install --cask patel-rushi/gitbar/gitbar
```

Update later with `brew upgrade --cask gitbar`.

**Manual DMG:**

1. Download `GitBar-x.y.z.dmg` from [GitHub Releases](https://github.com/patel-rushi/Gitbar/releases)
2. Open the DMG and drag GitBar to Applications
3. Launch GitBar from Applications
4. If macOS says the app is "damaged" (unsigned build), either right-click GitBar → **Open** → **Open**, or run:

```bash
xattr -cr /Applications/GitBar.app
```

### Publishing a new version

1. Bump `"version"` in `package.json` (e.g. `1.0.0` → `1.0.1`)
2. Commit and push
3. Create and push a tag:

```bash
git tag v1.0.1
git push origin v1.0.1
```

4. GitHub Actions builds the app and publishes a release with:
   - `GitBar-x.y.z.dmg` — for new installs
   - `GitBar-x.y.z-mac.zip` + `latest-mac.yml` — for in-app updates

Installed apps check for updates on launch and daily, and whenever the panel is opened. Users can also right-click the tray icon → **Check for Updates…**

### Homebrew tap

The cask lives in [`patel-rushi/homebrew-gitbar`](https://github.com/patel-rushi/homebrew-gitbar). When a release is published, CI bumps the cask's `version` and `sha256` automatically — provided a `HOMEBREW_TAP_TOKEN` secret (a PAT with write access to the tap repo) is configured. Without it, update the cask manually.

### Code signing (recommended)

For smooth installs and reliable auto-updates on macOS, add these GitHub repository secrets before releasing:

| Secret | Description |
|---|---|
| `CSC_LINK` | Base64-encoded `.p12` Developer ID certificate |
| `CSC_KEY_PASSWORD` | Certificate password |
| `APPLE_ID` | Apple ID email |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password for notarization |
| `APPLE_TEAM_ID` | Apple Developer Team ID |

Without these secrets, CI still builds unsigned artifacts (users will see Gatekeeper warnings).

### Local publish (optional)

```bash
export GH_TOKEN=ghp_...
npm run electron:publish
```

## Configuration

1. Launch GitBar
2. Enter your GitHub Personal Access Token (PAT)
   - Create one at [github.com/settings/tokens](https://github.com/settings/tokens?type=beta)
   - Required scopes: `notifications`, `repo`
3. GitBar starts polling immediately

### Settings

- Toggle notification types (replies, mentions, review requests)
- Adjust polling interval (15s–300s)
- Customize tabs (rename, reorder, hide)
- Create custom pinned filters

## Architecture

- **Electron** — main process manages tray, window positioning, native notifications
- **React + Vite** — renderer process with Zustand state management
- **GitHub REST API v3** — fetches notifications, search/issues for PR data
- **localStorage** — persists token, preferences, read state, custom filters

## Privacy

GitBar sends a small amount of anonymous usage data to [Aptabase](https://aptabase.com) so we can see how many people use the app and which versions are in use. This is what's collected:

- App version
- Operating system and version
- Approximate country (derived from IP at request time, then discarded)
- A handful of events: app start, update applied

What's **not** collected:

- Your GitHub token, username, PR data, or any identifying info
- IP address (Aptabase does not store it)
- Any cookies, device IDs, or fingerprints

If you'd rather not contribute analytics, you can build GitBar from source — analytics only runs in production builds with a configured app key.

## License

MIT
