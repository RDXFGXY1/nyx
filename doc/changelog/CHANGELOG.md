# Nyx — Changelog

All notable changes to the Nyx new-tab extension are recorded here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/).

---

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
