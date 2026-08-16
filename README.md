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

Power-user tools:

| | |
|---|---|
| `F3` / `Ctrl+Q` | Internal viewer (text / hex / image), and quick preview in the other pane |
| `Cmd+F` | Find by name, content, size and date — results open as a browsable panel |
| `Cmd+D` | Compare two files side by side |
| `Cmd+Y` | Synchronise the two panel folders, with copy-missing and mirror |
| `Ctrl+M` | Multi-rename with regex, counters and a live preview |
| `Cmd+T` / `Cmd+W` / `Cmd+1..9` | Per-panel tabs |
| `Ctrl+1..9` | Numbered folder bookmarks (`Ctrl+Shift+N` to set) |
| `Enter` on an archive | Browse `.zip` / `.tar.gz` / `.7z` in place; `F5` extracts, `Alt+F5` packs |
| `Tab` in the command line | Complete paths and executables |
| drag a row | Copy to the other panel; `Shift` moves, `Alt` drags out to Finder |

An embedded terminal (`` Ctrl+` ``) opens a real shell in the active panel's directory.
Cloud folders under `~/Library/CloudStorage` (Google Drive, Dropbox, OneDrive) appear in the
drive bar and are navigable, including via symlinks like `~/Google Drive`.

Archives use the tools macOS already ships. `.7z` additionally needs a 7-Zip binary on
`PATH` (`brew install sevenzip`); without one, the app says so instead of failing quietly.

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
