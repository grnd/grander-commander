# Grander Commander

<p align="center">
  <img src="build/icon.png" alt="GranderCommander" width="160" />
</p>

<p align="center">
  <b>Total Commander-style dual-pane file manager for macOS.</b>
</p>

<p align="center">
  <img src="docs/screenshot.png" alt="GranderCommander screenshot" width="820" />
</p>

---

## Why

I really miss Total Commander. Over the years I couldn't find anything on macOS that stuck with me — so I vibe-coded one.

## Install

Grab the latest `.dmg` from [Releases](https://github.com/grnd/grander-commander/releases/latest).

Builds are signed with a Developer ID and notarized by Apple, so it opens normally — no
right-click-to-open or Privacy & Security detour. Once installed it checks for updates on
launch and offers them in a banner; nothing downloads or installs without you clicking.
You can also trigger a check from **GranderCommander → Check for Updates…**

## Manual

> **Hold `?` anywhere in the app for the full keyboard cheatsheet.** That's the only shortcut you need to memorize.

## Run it

Requires Node 20+ and macOS 12+.

```bash
npm install
npm run dev          # dev mode
npm test             # unit tests
npm run typecheck    # tsc across main / preload / renderer
npm run dist         # build a signed .dmg — see below
```

`npm run dist` now signs and notarizes. It picks up a Developer ID from your keychain, and
notarization additionally needs `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and
`APPLE_TEAM_ID` in the environment. To build locally without any of that:

```bash
npx electron-builder --mac --dir -c.mac.identity=null -c.mac.notarize=false
```

Auto-update is disabled in dev builds — the updater reports `unsupported` rather than
failing, since an unpackaged app has no signature for Squirrel to validate.

## What's there

Two panels, keyboard-first navigation, quick search (`Alt+letter`), copy/move with conflict
prompts, trash, Quick Look, favorites, a command line at the bottom, F-keys, and native
context menus with Reveal in Finder / Open With.

An embedded terminal (`` Ctrl+` ``) opens a real shell in the active panel's directory.
Cloud folders under `~/Library/CloudStorage` (Google Drive, Dropbox, OneDrive) appear in the
drive bar and are navigable, including via symlinks like `~/Google Drive`.

See [`todo.md`](./todo.md) for what's next.

## Releasing

Tagging is what publishes — the [release workflow](.github/workflows/release.yml) builds,
signs, notarizes and uploads on any `v*` tag.

```bash
npm version 0.1.3 --no-git-tag-version   # electron-builder reads this, NOT the tag
git commit -am "chore(release): 0.1.3"
git tag v0.1.3 && git push --tags
```

The version bump is not optional: `latest-mac.yml` is generated from `package.json`, so
tagging without bumping publishes a manifest advertising the *old* version and no client
ever sees the update.

Requires these repository secrets: `CSC_LINK` (base64 `.p12`), `CSC_KEY_PASSWORD`,
`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`.

## License

[MIT](./LICENSE) © grnd
