Nyx — Brave / Chrome extension

![screenshot](/assets/screenshots/screenshoot.png)

Make your new tab feel like a personal command center.
Nyx is a beautiful, modern new-tab extension that replaces the ordinary new-tab page with something more useful, stylish, and personal. Instead of a blank or generic page, you get a fast workspace for your favorite links, real bookmarks, a live dashboard, translation, a password vault, immersive wallpapers, and a smooth local music experience.

Current version: 1.4.0 — see [doc/changelog/CHANGELOG.md](doc/changelog/CHANGELOG.md) and per-release notes in [version/](version/).

Why users love it
- It turns every new tab into a productive and enjoyable start point.
- It feels premium and polished without being complicated to use.
- It keeps you organized with grouped shortcuts, real bookmarks, and quick actions.
- It gives your browser a personal identity with dynamic colors and custom backgrounds.
- It supports local music playback, so your media experience stays private and fast.

Main features
- Organized link groups and pinned shortcuts with inline editing and drag-to-reorder
- Bookmarks browser — the saved tab browses your real browser bookmarks (folders and all), with a breadcrumb and search
- Translation — select text on any page to translate it inline, plus a full translator panel (Alt+G) and a `>translate` command
- History-aware search bar — suggestions from your browsing history and bookmarks, like the address bar
- Password vault — a security dashboard with a score ring, weak/reused breakdown, 2FA coverage, and recently used/saved
- Display settings — text size (S/M/L), bold weight, board width, and open-links-in-new-tab
- Beautiful wallpapers — image and video backgrounds, with smart accent colors that adapt automatically, plus optional random wallpaper and lyrics-on-wallpaper
- Command mode (`>`) for quick actions, and an Alt+D dashboard (weather, date, calendar, profile, system, local music player)
- Built-in update notifications — no server needed (see "Updates" below)

Installation
1. Copy or unzip this folder somewhere permanent (or clone this repo).
2. Open brave://extensions (or chrome://extensions).
3. Turn on Developer mode.
4. Click Load unpacked and select this project folder.
5. Open a new tab to start using the extension.

Customize your experience
Edit js/config.js to change:
- your link groups and shortcuts
- your name and city
- dock pins and favorites
- tab names and layout settings

Command mode
Type `>` in the search bar to use quick commands such as:
- >wall / >wall reset     pick or restore a wallpaper (image or video)
- >accent auto / >accent #hex   auto or manual accent color
- >name X / >city X       change the greeting name or weather city
- >translate / >tr        open the translator, or quick-translate text
- >stash                  open your bookmarks
- >vault                  open the password vault
- >settings               open settings
- >tab X / >dock / >reset

Keyboard shortcuts
- `/`        focus the search bar
- Alt+D      dashboard (Alt+K if Brave uses Alt+D)
- Alt+S      bookmarks
- Alt+P      password vault
- Alt+G      translator
- Alt+N / Alt+T   quick note / to-do

Dashboard experience
Use Alt+D to open the dashboard:
- Dashboard tab — weather, profile, date, and calendar
- Media tab — local music playback and control of audio in your other tabs
- System tab — battery, memory, storage, and network details

Local music server (optional)
Nyx can pair with a local backend music server (in the backend folder, not tracked here) for browsing and streaming your own music library, lyrics, and a desktop Vinyl HUD. It listens on http://127.0.0.1:5055 by default. Everything works without it — the server just unlocks the music/vault features.

Updates
Nyx checks a small `version.json` in this repo (no backend). When a newer version is published, installed copies show an update banner; closing it leaves a small pulsing pill that opens a "What's new" list. To publish a release: bump `manifest.json` and `version.json`, update `js/whatsnew.js`, and follow [version/README.md](version/README.md).

Permissions
`storage`, `tabs`, `topSites`, `bookmarks`, `history`, `contextMenus`, `webNavigation`, and host access for weather, lyrics, translation, update checks, and the optional local server.

Project files
- manifest.json      extension configuration
- index.html         page layout
- css/style.css      main styling
- js/config.js       your personal links and settings
- js/app.js          clock, weather, search, and tabs
- js/theme.js        wallpaper and color logic
- js/commands.js     command palette and dock behavior
- js/stash.js + js/bookmarksCore.js   bookmarks browser
- js/vault.js        password vault dashboard
- js/translate.js + js/content.js     translation
- js/whatsnew.js + js/updatecheck.js  what's-new popup + update notifications

Built for people who want their browser to feel more like a personal workspace than a blank page.
