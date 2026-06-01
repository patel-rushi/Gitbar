# Contributing to GitBar

## Prerequisites

- macOS
- Node.js 18+ (`nvm use` activates the version in `.nvmrc`)

## Development

```bash
npm install
npm run electron:dev   # Vite dev server + Electron
```

## Build a DMG locally

```bash
npm run electron:build
```

The installer is written to the `release/` directory.

## Architecture

- **Electron** — main process manages the tray, window positioning, and native notifications
- **React + Vite** — renderer with Zustand state management
- **GitHub REST API v3** — notifications and search/issues for PR data
- **localStorage** — persists token, preferences, read state, and custom filters

## Releasing

GitBar ships via GitHub Releases with in-app auto-updates (`electron-updater`).

### Publish a new version

1. Add a `## vX.Y.Z` section to `CHANGELOG.md` describing the changes.
2. Bump `"version"` in `package.json`.
3. Commit, then tag and push:

```bash
git tag vX.Y.Z
git push origin vX.Y.Z
```

GitHub Actions builds the app, uses the matching `CHANGELOG.md` section as the release notes, publishes the DMG + update artifacts, and bumps the Homebrew cask automatically.

### Homebrew tap

The cask lives in [`patel-rushi/homebrew-gitbar`](https://github.com/patel-rushi/homebrew-gitbar). CI bumps its `version` and `sha256` on each release, provided the `HOMEBREW_TAP_TOKEN` secret (a PAT with write access to the tap) is configured.

### Code signing (optional)

For smooth installs and reliable auto-updates, add these repository secrets before releasing:

| Secret | Description |
|---|---|
| `CSC_LINK` | Base64-encoded `.p12` Developer ID certificate |
| `CSC_KEY_PASSWORD` | Certificate password |
| `APPLE_ID` | Apple ID email |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password for notarization |
| `APPLE_TEAM_ID` | Apple Developer Team ID |

Without these, CI builds unsigned artifacts (users see Gatekeeper warnings on manual installs).

### Local publish

```bash
export GH_TOKEN=ghp_...
npm run electron:publish
```
