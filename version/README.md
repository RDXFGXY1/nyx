# Nyx — Versions

Per-version release notes for the Nyx new-tab extension. Each file lists what was
**added**, **changed**, and **fixed** in that version. Newest first.

The rolling, combined log (including the desktop companion app) lives in
[`doc/changelog/CHANGELOG.md`](../doc/changelog/CHANGELOG.md). This folder is the
per-release breakdown.

| Version | Date | Headline |
|---|---|---|
| [1.4.0](1.4.0.md) | 2026-07-20 | Bookmarks, translation, history search, vault dashboard, display settings |
| [1.3.0](1.3.0.md) | 2026-07-11 | Wallpaper lyrics, crossfade, download queue, smart playlists |
| [1.2.0](1.2.0.md) | 2026-07-10 | Random wallpaper from a folder |
| [1.1.0](1.1.0.md) | 2026-07-08 | Cross-tab audio control, weather popup, laptop-layout fixes |
| [1.0.0](1.0.0.md) | earlier | First release — glass new tab, boards, command mode, dashboard |

## Versioning
- The number in [`manifest.json`](../manifest.json) is the source of truth for the
  installed extension version.
- We follow loose semver: **major.minor.patch** — a minor bump for new features,
  a patch bump for fixes-only releases.
- When cutting a new version:
  1. Bump `manifest.json` `version`.
  2. Bump the root **`version.json`** (`version`, `notes`, `url`) — this is what
     installed copies poll from GitHub to show the **"update available"** banner.
  3. Update `js/whatsnew.js` (`version` + `items`) so the post-update
     "What's new" popup matches.
  4. Move the `[Unreleased]` section of `CHANGELOG.md` under the new version +
     date, and add a matching `version/<x.y.z>.md` here.
  5. Commit + push. Installed copies pick up the new `version.json` within ~6h.

## Update notifications (no backend)
- Installed extensions fetch the raw `version.json` from GitHub (URL set in
  `js/updatecheck.js` → `UPDATE_URL`) at most every 6h. If its `version` is newer
  than `manifest.json`, a dismissible banner appears linking to `url`.
- The `"What's new"` popup (`js/whatsnew.js`) shows once after the user actually
  installs the new version.
