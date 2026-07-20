# Nyx — Changelog

All notable changes to the Nyx new-tab extension are recorded here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

---

## [1.4.0] — 2026-07-20

### Added
- **"What's new" popup** — after an update, the first new tab shows a one-time
  glass card with the version's highlights, dismissed with "Got it" (stored per
  version so it never nags). Also introduced `version/` — a folder of per-release
  notes — and reconciled `manifest.json` to 1.4.0 (`js/whatsnew.js`,
  `css/style.css`).
- **Update notifier (no backend)** — installed copies poll a static root
  `version.json` on GitHub (raw URL, every ~6h) and, if it's newer than the
  installed version, show an "update available" banner with a link to the
  release. Closing the banner **minimizes it to a small persistent corner pill**
  (with a gently pulsing dot) rather than dismissing forever — it stays on every
  new tab until the user actually updates. Clicking the pill opens a **"What's
  new" popup** listing the update's changes (a bulleted `items` array in
  `version.json`, falling back to `notes`) with **Get it** / **Later**. Adds the
  `https://raw.githubusercontent.com/*` host permission (`js/updatecheck.js`,
  `version.json`, `css/style.css`).

### Changed
- **Vault → security dashboard** — the vault passwords view is now a two-column
  dashboard (widened 620px → 1080px) that fills the empty space with a right-hand
  insight sidebar: a big **security-score ring**, a **breakdown** (all / strong /
  weak / reused / old) where each row **filters the list**, a **2FA coverage**
  bar, **recently used**, and **recently saved**. Added a **search** box for the
  list. "Recently used" is powered by a new per-entry **last-used** timestamp
  recorded on reveal and stored inside the encrypted vault
  (`VaultService.LastUsed`, set in `Reveal`). Backend: `VaultService.cs`; UI:
  `js/vault.js`, `css/style.css`.
- **Vault redesign** — the vault now *looks* like a secure vault: a **security
  score meter** (green/amber/red strength bar + a glowing % score) replaces the
  plain "N weak · N reused" text; each login shows a **site favicon** and a
  colored **left status strip** (red = weak, amber = reused) for at-a-glance
  risk scanning; crisp SVG show/delete icons; an accent-glow key, glowing active
  tabs with count pills, and deeper glass rows with lift-on-hover. Verified in a
  browser (`css/style.css`, `js/vault.js`).

### Added
- **Settings → Display section** — new controls in the settings panel: **Size**
  (S / M / L, scales the link boards), **Weight** (Normal / Bold link text),
  **Board width** slider (column width), and **Open links in a new tab**. All
  persist and apply on load (`index.html`, `css/style.css`, `js/extras.js`,
  `js/app.js`).
- **Search bar now suggests from your history** — typing in the new-tab search
  bar surfaces matches from your **browsing history** and **bookmarks** alongside
  your saved links, like the real address bar. Ranked links → bookmarks → history
  (history by visit count), deduped by URL, with favicons and a source tag
  (`saved` / `history`). Adds the `history` permission (`js/extras.js`,
  `css/style.css`).
- **Translation** — select text on any page → the selection pill's new
  **Translate** button shows the translation right there, with the detected
  source language and a target-language picker (remembered for next time). Also a
  **`>translate` / `>tr`** command in the new-tab palette (result copied to the
  clipboard). Uses Google's free endpoint via the background worker (no API key,
  no CORS issues); auto-detects the source. Adds the
  `https://translate.googleapis.com/*` host permission
  (`js/background.js`, `js/content.js`, `js/commands.js`).
- **Translate panel (new tab)** — a full translator overlay (Alt+G, or
  `>translate`): type/paste on the left, live translation on the right, with
  source (auto-detect) + target language pickers and a **swap** button that
  moves the translation back into the input. Target language is remembered
  (`js/translate.js`, `index.html`, `css/style.css`).
- **Player SETTINGS tab + full-screen mode** — a ⚙ tab in the HUD (next to
  PLAYLIST · SEARCH · QUEUE) with live, persisted toggles for the album-art glow,
  synced lyrics, waveform bar, visualizer ring, and always-on-top. Includes a
  **Full-screen "Now Playing"** switch that opens an immersive fullscreen view
  (big art, title, live lyrics, progress, transport) bound to the same playback
  (`FullPlayerWindow`). Toggles are shared with the Control Panel's HUD page.
- **Floating Vinyl HUD — new touches**:
  - **Album-art ambient glow** — a blurred radial glow behind the vinyl, tinted
    from the current track's album art and pulsing on the bass (via the existing
    FFT). `Services/ArtColors.cs`.
  - **Synced lyrics** — karaoke line under the transport, fetched from LRCLIB and
    highlighted line-by-line. `Services/LyricsService.cs`.
  - **Waveform seek bar** — a stylized bar waveform that fills with playback
    progress, replacing the plain progress line (seek still works).

### Changed
- **Saved tab is now a real bookmarks browser** — it reads your actual browser
  bookmarks (`chrome.bookmarks`, new `bookmarks` permission) instead of a private
  store that could be wiped, so nothing is ever lost. Shows **folders** (with a
  recursive bookmark count) and links together, click a folder to go in, with a
  clickable **breadcrumb** + ↑ to come back, and search across every bookmark at
  once. Adding a link bookmarks it into the current folder; leaving the link empty
  creates a folder. Restyled to match the board; categories/tags are gone (folders
  replace them). New `js/bookmarksCore.js`; `js/stash.js` rewritten.
- **Text-selection popup is now a small pill** (user feedback: the card was
  intrusive). Selecting text shows a 104×30 "🔖 Save ▾" pill instead of the full
  260×189 card: clicking **Save** stashes it in one click; the **▾** expands into
  the original card when you want categories (`js/content.js`).
- **HUD volume now controls the player only**, not the Windows master volume, and
  is persisted (`HudSettings.Volume`). The system-audio service is now used purely
  for the spectrum visualizer.

### Added (control panel)
- **Control panel — four new pages**:
  - **Library & paths** — choose the music library folder (validates + rescans),
    the wallpaper folder, and the yt-dlp executable, with Browse pickers. Backed
    by `GET/POST /api/settings/paths|library|ytdlp` and runtime path overrides
    (`RuntimePaths.cs`) that win over `appsettings.json`.
  - **HUD** — show/hide the Vinyl HUD, always-on-top, visualizer on/off (all
    persisted via `HudSettings.cs`), and the Alt+D summon hotkey shown.
  - **Diagnostics** — today's free-plan usage, yt-dlp/ffmpeg presence + versions,
    library path + track count, app version, and Open-data-folder. Backed by
    `GET /api/diag`.
  - **About & updates** — version, and a "Check for updates" that queries the
    optional `UpdateUrl` from `nyx.config.json`.
- **Configurable activation server** — the desktop app reads `ActivationServer`
  (and `UpdateUrl`) from `nyx.config.json` (`AppConfig.cs`), so a shipped build
  can point at your production license server without recompiling. Deploy runbook
  in `desktop/NullTab.LicenseServer/DEPLOY.md`.
- **Free-plan usage cap (desktop app)** — an unlicensed install may run the
  bundled backend for **2 hours per calendar day**; a valid license lifts the
  cap entirely (unlimited). Usage is persisted and resets at local midnight.
  When the daily budget is spent, the backend stops and refuses to restart until
  the next day, a tray notification appears, and the activation window opens.
  Remaining time is shown in the control panel and license window
  (`Services/UsageLimiter.cs`, `Services/BackendHost.cs`, `TrayManager.cs`,
  `App.xaml.cs`, `ControlWindow.xaml.cs`, `LicenseWindow.xaml.cs`).
- **License server**: per-product filter (`GumroadProductPermalink`) so the
  account-wide Gumroad Ping only mints keys for the Nyx product; token now also
  accepted as a URL path segment; seller-id logging. `README.md` with full
  run/Gumroad/SMTP setup (`desktop/NullTab.LicenseServer/`).

---

## [1.3.0] — 2026-07-11

### Added
- **Lyrics on the wallpaper** — synced lyrics from LRCLIB drawn on the wallpaper
  behind the cards, following the browser player line-by-line. Settings: on/off,
  text size, animation (fade/slide/glow/blur), position, color (white or a
  softened accent), custom **font upload** (`.ttf/.otf/.woff`), and a **sync
  offset** slider for sped-up/remixed tracks (`js/lyrics.js`).
- **Crossfade** — smooth blend between songs via an A/B audio pair; slider in
  settings → playback (0–12s); works on next/prev, queue, and auto-advance
  (`js/dashboard.js`).
- **Download queue** — a panel (media → online) listing every active/recent
  download with live progress bars, done/failed states, and "clear done".
  Server tracks titles + exposes `GET /api/remote/downloads` and
  `POST /api/remote/downloads/clear` (`RemoteController.cs`).
- **Smart playlists** — auto-grouped chips from your library's genres
  (plus "shuffle all") in the library view; one click shuffles that group into
  the player (`renderSmartLists` / `playSmart`). Library now carries `genre`.

## [1.2.0] — 2026-07-10

### Added
- **Random wallpaper** — every new tab can load a random wallpaper from a folder
  on disk, served by the backend:
  - settings → appearance: an on/off toggle plus a type picker
    (images only / videos only / both);
  - the hint row shows the folder the server reads and how many
    images/videos it found (recommended: put them all in **Pictures/wallpaper**);
  - a **"wallpapers folder"** input in settings — the user points the server at
    ANY folder (`POST /api/wallpaper/folder`, persisted in
    `%APPDATA%/NullTab/wallpaper-folder.txt` so it survives restarts);
    `Pictures/wallpaper` is only the default suggestion;
  - backend: new `WallpaperController` (`GET /api/wallpaper/list`,
    `GET /api/wallpaper/file?name=`) reading the chosen folder
    (config default `Music:WallpaperFolder`, `~` supported), path-traversal-safe,
    seekable video serving;
  - extension: `THEME.applyRandomWallpaper()` in `js/theme.js` — picks per tab,
    extracts the accent from the random wallpaper (CORS-safe), and falls back
    to your saved wallpaper when the server is off or the folder is empty.

---

## [Desktop Vinyl HUD 1.2.0] — 2026-07-08

### Added
- **Browser ⇄ HUD sync** — a shared now-playing state + command bus on the
  server (`SyncController`, `/api/sync/state` + `/api/sync/cmd`, localhost only).
  Whoever is playing is the "owner" and publishes state; the other side mirrors
  it (track, art, live position) and its transport buttons remote-control the
  owner. So playing in the browser now shows and controls from the HUD, and
  vice-versa. HUD side: `Services/SyncService.cs`; browser side: sync methods in
  `js/client/musicApi.js` + `setupSync` / `syncPublishState` in `js/dashboard.js`.
  The HUD hushes the browser when you start a track on it (no double audio).
- **Queue tab** — right-click a track → "Add to queue"; queued songs play first,
  then genre auto-advance.
- **Status lines** — "searching…" / "no results" for yt-dlp search, and
  "buffering…" while a picked track loads.

### Fixed
- Playlist highlight landed on the wrong (title-similar) row — now highlights the
  exact track you clicked, by id.

## [Desktop Vinyl HUD 1.1.0] — 2026-07-08

### Added
- **HUD-owned playback (`PlayerEngine`)** — clicking a track in the playlist or a
  search result now streams and plays it from the Nyx server via WPF MediaPlayer,
  so **seek, next/prev, loop, and shuffle all work** (previously the HUD could
  only mirror another app).
- **Working seek** — drag/click the timeline (own playback seeks MediaPlayer;
  system playback uses `TryChangePlaybackPositionAsync`).
- **Loop + shuffle** toggles.
- **Auto-advance on song end**, preferring the **same genre** (added a `Genre`
  field to the backend `Track` / `MusicLibrary`; needs a library rescan).
- **yt-dlp SEARCH tab** — search online and play results (`/api/remote/search`
  + `/api/remote/stream/{id}`).
- **Music source badge** (Spotify / Brave / etc. from the system session).
- **Avatar fallback** in the vinyl circle when nothing is playing.

### Changed
- Volume slider **moved** under the vinyl.
- System next/prev/seek routed through GSMTC; HUD-owned controls route to the
  player engine.

## [Desktop Vinyl HUD 1.0.0] — 2026-07-08

New companion app: **Nyx Desktop Vinyl HUD** — a native Windows 11 WPF widget
under `desktop/NullTab.VinylHud/`. An always-on-top glass now-playing HUD.

### Added
- Always-on-top, draggable two-panel glass HUD (analytics + identity).
- **Now playing from any app** via Windows `GlobalSystemMediaTransportControls`
  — title, artist, album, album art, live progress, and play/pause/next/prev
  for Spotify, browsers, the Nyx web player, etc. (`Services/MediaService.cs`).
- **Spinning vinyl** album-art disc that rotates while playing.
- **Real audio visualizer** — WASAPI loopback capture + FFT spectrum, plus a
  **system-volume slider** (`Services/AudioService.cs`, NAudio).
- **Alt+D toggle that slides down from the top** of the screen; positioned
  top-center; **auto-hide during fullscreen** apps/games; hidden from
  Alt-Tab/taskbar (`Interop/NativeMethods.cs`).
- **Playlist from the Nyx server** — the left card lists the Nyx music library
  (`GET /api/library`) with the current track highlighted; layout redesigned to
  match the reference (rounded glass cards: left = playlist + timeline + volume,
  right = vinyl + controls).
- **Wallpaper-matched colors** — samples the Windows desktop wallpaper for a
  dark card tint + vivid accent (`Services/WallpaperColorService.cs`); the
  visualizer now drives a reactive glow ring around the vinyl.
- **Nyx theming bridge** — pulls the wallpaper accent from the backend
  (`GET /phone/theme/local`) so the HUD matches your Nyx theme
  (`Services/NyxServerService.cs`).
- The Nyx web player now publishes `navigator.mediaSession` metadata
  (`js/dashboard.js`) so Nyx tracks show in the HUD + Windows media flyout and
  respond to OS media keys.

### Backend
- Added `GET /phone/theme/local` (localhost-only, no pairing code) to
  `PhoneController.cs` so same-PC apps can read the accent color.

---

## [1.1.0] — 2026-07-08

### Added
- **Cross-tab audio control** — the Media pane in the dashboard (Alt+D → Media)
  now shows a **"playing in your tabs"** section that lists every browser tab
  currently producing sound. For each tab you can:
  - **play / pause** its audio or video,
  - **mute / unmute** it (the mute button lights up in your accent color),
  - **click the title to jump to that tab**.
  - The list refreshes live as audio starts or stops, and hides itself when
    nothing is playing.
  - Implementation: `js/background.js` queries audible tabs and relays
    play/pause to a new content script `js/mediaControl.js`; the dashboard UI
    lives in `js/dashboard.js` (`setupTabAudio` / `renderTabAudio`). Uses only
    the already-granted `tabs` permission — no new permissions required.
- **Weather popup** — clicking the temperature in the top bar opens a glass
  card with the city, a condition emoji, big temperature, "feels like", wind,
  humidity, last-updated time, and a live **Refresh** button. The weather fetch
  now also pulls apparent temperature, humidity and wind speed
  (`loadWeather` / `buildWxPop` in `js/app.js`, styles in `css/style.css`).

### Fixed
- **14" / high-DPI laptop layout ("everything too big / clipped")** — on
  smaller effective viewports (a 14" laptop at 125–175% Windows scaling renders
  a small CSS viewport) the fixed-size UI was oversized and the clock/weather
  were clipped off the right edge. The whole UI now scales down proportionally
  with tiered `zoom` breakpoints on `:root`; fixed full-screen backgrounds and
  overlays still cover the screen correctly. (`css/style.css`, "RESPONSIVE
  SCALING" block.)
- **Card drag "ghost" showed a broken orange half-outline** — the browser was
  snapshotting the card while it still had its hover accent border. The card's
  border/shadow/transform are now neutralized the instant the drag starts,
  before the snapshot, so the dragged card looks clean. (`js/app.js`
  `onBoardDragStart` / `cleanupDrag`, `css/style.css` `.group.dragging`.)
- **Hard black shadow on cards + visible column scrollbar** — the card
  drop-shadow was being clipped into a hard black edge by the scrolling
  columns, and the scrollbar covered card content. Cards are now flat glass
  (subtle inset line only) and the column scrollbars are hidden while columns
  still scroll. (`css/style.css`.)

---

## [1.0.0] — earlier

Initial Nyx: glass new-tab replacement with link groups/boards, tabs,
command mode (`>`), Alt+D dashboard (weather / profile / calendar / system /
local music player), image & video wallpaper with auto accent color,
most-visited row, inline board/link editing (add via **+**, hover ⋯ menus,
right-click context menus, drag-to-reorder), stash, password vault, phone
companion, and the optional `NullTab.MusicServer` C# backend
(music streaming, system stats, vault, Discord Rich Presence).
