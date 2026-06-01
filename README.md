# GitBar: GitHub Notifications & Pull Request Inbox for the macOS Menu Bar

GitBar is a free, open-source **macOS menu bar app** that cuts through GitHub notification noise. It surfaces only what matters: replies on your **pull requests**, replies to your comments, **@mentions**, and **review requests** — so you can stay on top of **code reviews** without living in the GitHub web UI.

```bash
brew install --cask patel-rushi/gitbar/gitbar
```

![GitBar — GitHub pull request inbox in the macOS menu bar](docs/images/app-screenshot.png)

## Features

- **Lives in your menu bar** — a quiet tray icon with an unread badge counter
- **GitHub notifications** — alerts only for replies to your PRs, replies to your comments, @mentions, and review requests
- **Tabbed pull request inbox** — My PRs, Reviewed by Me, Review Requested, I Commented, and custom filters
- **Custom filters** — pin views by repository, label, author, or any GitHub search query
- **Click to open** — jump straight to any PR or thread in your browser

## Screenshots

| | |
|:---:|:---:|
| ![GitBar My PRs tab showing open pull requests](docs/images/my-prs.png) | ![GitBar Reviewed by Me tab with labels](docs/images/reviewed-by-me.png) |
| **My PRs** — your open pull requests and incoming comments | **Reviewed by Me** — PRs you've reviewed, with labels and replies |
| ![GitBar custom filter builder](docs/images/custom-filter.png) | ![GitBar Review Requested team filter](docs/images/review-requested-filter.png) |
| **Custom filters** — by repository, label, author, or any GitHub query | **Review Requested** — scope to specific teammates or teams |

## Install

### Homebrew (recommended)

```bash
brew install --cask patel-rushi/gitbar/gitbar
```

GitBar installs into your Applications folder with no Gatekeeper warnings.

### Manual download

1. Download the latest `.dmg` from the [releases page](https://github.com/patel-rushi/Gitbar/releases/latest).
2. Open the DMG and drag **GitBar** into **Applications**.
3. The manual build is unsigned, so macOS Gatekeeper quarantines it and may say the app is *"damaged"* or *"can't be opened."* Clear the quarantine flag, then launch:

```bash
xattr -cr /Applications/GitBar.app
```

`xattr -cr` removes the `com.apple.quarantine` attribute macOS attaches to anything downloaded from the internet. It's only needed because the manual build isn't code-signed — Homebrew does this step for you automatically, which is why it's the recommended install.

## Getting started

GitBar needs a GitHub **personal access token (classic)** to read your notifications and pull requests.

### 1. Create the token

Open the pre-filled token page — [**Create a token for GitBar**](https://github.com/settings/tokens/new?description=GitBar&scopes=repo,notifications,read:org). The required scopes are already checked for you:

| Scope | Why GitBar needs it |
|---|---|
| `repo` | Read your pull requests and review threads (including private repos) |
| `notifications` | Fetch your GitHub notifications |
| `read:org` | List org repositories and teammates for custom filters |

Set an expiration (or **No expiration**), then scroll down and click **Generate token**.

### 2. Authorize SSO (required for organizations using SAML)

If your repositories belong to an organization that enforces **SAML single sign-on**, the token won't see them until you authorize it. On the token list, find your new token, click **Configure SSO** (or **Enable SSO**), and **Authorize** each organization you need.

> Skipping this step is the most common reason GitBar shows no PRs for a work org — the token is valid, but GitHub hides SSO-protected data until it's authorized.

### 3. Copy and paste it into GitBar

Copy the token value — it starts with `ghp_` and you won't be able to see it again. Launch GitBar from your menu bar, paste the token, and you're done — it starts tracking your pull requests and notifications immediately.

From **Settings** you can toggle notification types, change the polling interval, reorder or hide tabs, and create custom pinned filters.

## Privacy

GitBar is fully local, your GitHub token, settings, and PR data stay on your machine. It never collects your token, username, PR content, IP address, or any device identifiers. Build from source to opt out entirely.

## Contributing

GitBar is built with Electron, React, and the GitHub REST API. To run it locally or cut a release, see [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
