# NullTab — Nyx

A glass, keyboard-driven **new-tab replacement for Brave/Chrome**, backed by an
optional local **C# server** that unlocks music, live system stats, a password
vault, a Discord Rich Presence, and a phone companion.

It started as a link dashboard and grew into a small personal browser OS.

---

## Two halves

| Part | What it is | Needed for |
|------|------------|-----------|
| **Extension** (`index.html`, `css/`, `js/`) | The new-tab page. Pure browser, no install beyond loading it. | Links, tabs, folders, command mode, dashboard, wallpaper, notes/to-do/snippets, stash, launcher, pet. |
| **Backend** (`backend/`) | A local ASP.NET Core server on `http://127.0.0.1:5055`. | Music (local + online), real system stats, screen-time, password **vault**, **Discord RPC**, **phone companion**, PC control. |

The extension works fully on its own. The backend adds the "superpowers" and is
started separately when you want them.

---

## Quick start

### 1. The extension
1. Unzip the folder somewhere permanent (don't delete after).
2. Open `brave://extensions` (or `chrome://extensions`).
3. Turn on **Developer mode** (top-right).
4. Click **Load unpacked** → select this folder.
5. Open a new tab. Done.

Edit your links in [`js/config.js`](../js/config.js), or just use **edit mode**
(the pencil button, top-right) to add/rename/remove them live.

> After changing `manifest.json`, `js/background.js`, or any `js/*Content.js` /
> `js/snippets.js` / `js/qr.js`, **reload the extension**. Editing the new-tab
> files (`app.js`, `dashboard.js`, `theme.js`, …) only needs a tab refresh.

### 2. The backend (optional)
Requires the [.NET 8 SDK](https://dotnet.microsoft.com/download).

```bash
cd backend
run.bat          # Windows
./run.sh         # Linux / macOS
# or:  cd src/NullTab.MusicServer && dotnet run -c Release
```

It serves on `http://127.0.0.1:5055`. First run restores NuGet packages. See
[BACKEND.md](BACKEND.md) for details, config, and the API.

---

## Feature map

- **Links** — grouped, foldable cards across custom tabs; favicons; edit mode; copy-link.
- **Command mode** — type `>` in the search bar for 30+ commands. See [COMMANDS.md](COMMANDS.md).
- **Launcher** — type in the search bar to fuzzy-jump to any saved link.
- **Dashboard** (`Alt+D`) — weather, profile, calendar, sliders, **music player**, **live system monitor**, **screen-time**.
- **Side panel** (`Alt+N`) — Notes, To-do, Snippets (text expander), Sent history.
- **Stash** (`Alt+S`) — save anything from any page (hover card / right-click), with categories.
- **Vault** (`Alt+P`) — encrypted password manager: logins, 2FA codes, identities, cards. See [VAULT.md](VAULT.md).
- **Phone companion** (`>phone`) — QR-pair your phone, send links/text both ways over WiFi.
- **Music** — local files, the backend's `~/Music` library, and online search (yt-dlp), with a queue.
- **Auto-DJ** — music plays on coding sites, pauses on video sites.
- **Life-modes** — save/restore your whole environment (colors + open tabs).
- **Extras** — the pet, wallpaper pulse, day-mood tint, calendar popup, daily briefing, QR-to-phone (`Alt+Q`), Discord RPC, PC control.

Full walkthrough: [FEATURES.md](FEATURES.md).

---

## Docs in this folder

| File | Covers |
|------|--------|
| [FEATURES.md](FEATURES.md) | Every feature, how to use it, where it lives. |
| [COMMANDS.md](COMMANDS.md) | All `>` commands and keyboard shortcuts. |
| [BACKEND.md](BACKEND.md) | The C# server: run, configure, full API. |
| [VAULT.md](VAULT.md) | The password manager and its security model. |
| [ARCHITECTURE.md](ARCHITECTURE.md) | File layout and how the pieces connect. |

---

## Privacy

Everything is **local**. Links, notes, stash, and settings live in the browser.
The vault is encrypted on disk by the backend. Nothing is sent to any cloud —
the only outbound calls are the weather API (Open-Meteo), Google's favicon
service, and (for online music) whatever yt-dlp resolves on your behalf.
