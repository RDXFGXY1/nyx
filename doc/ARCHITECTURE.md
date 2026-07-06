# Architecture

How the pieces fit together.

## The two runtimes

```
┌─────────────────────────── Browser ───────────────────────────┐
│                                                                 │
│  New-tab page (extension origin)      Content scripts           │
│  index.html + css + js/*              (run on every web page)   │
│    app, dashboard, theme, extras,       content.js (stash card) │
│    commands, stash, vault, config       vaultContent.js (fill)  │
│                                         snippets.js  qr.js       │
│                    │  chrome.runtime / chrome.storage  │         │
│                    └──────────────┬───────────────────┘         │
│                         background.js (service worker)          │
│                    context menus · RPC · Auto-DJ · vault relay  │
└──────────────────────────────┬────────────────────────────────┘
                                │ HTTP  127.0.0.1:5055
                     ┌──────────┴───────────┐
                     │  Backend (C# / .NET) │  ← optional
                     │  music, system, RPC, │
                     │  vault, phone, power │
                     └──────────────────────┘
```

## Extension file roles

### New-tab page (loads in `index.html`, in DOM order)
| File | Role |
|------|------|
| `js/config.js` | Your links, tabs, dock, name, city (defaults). |
| `js/qrcode.min.js` | QR generator (also used by the phone panel). |
| `js/theme.js` | Wallpaper (image/video) + accent color extraction. Publishes accent to `chrome.storage` for the in-page popups & phone page. |
| `js/client/musicApi.js` | Thin wrapper over the backend's music/system/vault APIs. |
| `js/client/musicSource.js` | Glue between the backend library and the player. |
| `js/commands.js` | The `>` command palette + dock. |
| `js/dashboard.js` | `Alt+D` dashboard: player, system monitor, screen-time, Auto-DJ handler. Owns `PLAYER`. |
| `js/extras.js` | Side panel (notes/todo/snips/sent), pet, pulse, day-mood, calendar popup, life-modes, daily briefing, phone companion. |
| `js/stashCore.js` | Shared stash data layer (`chrome.storage`), used by the board, the popup, and the content script. |
| `js/stash.js` | The stash mode UI (`Alt+S`). |
| `js/vault.js` | The vault mode UI (`Alt+P`): sections, TOTP display, health, import. |
| `js/app.js` | Boot: clock, weather, search, launcher, renders link groups & tabs, wires everything. |

### Background & content scripts
| File | Runs where | Role |
|------|-----------|------|
| `js/background.js` | service worker | Context menus ("Save to Stash"), Discord RPC tab tracking, Auto-DJ signal, and the **vault/phone relays** (holds the secret token so content scripts never do). |
| `js/content.js` | every page | The stash hover-card. |
| `js/vaultContent.js` | every page | Login/2FA/identity/card autofill + save-on-submit, routed through the background. |
| `js/snippets.js` | every page | Text-snippet expander. |
| `js/qr.js` (+ `qrcode.min.js`) | every page | `Alt+Q` page-URL QR. |
| `save.html` + `js/save.js` | popup window | The right-click "Save to Stash" form. |

## Storage

| Where | What |
|-------|------|
| `localStorage` (new-tab origin) | Settings, link/tab edits, notes, to-dos, stash tags, life-modes, sent history, toggles. |
| `chrome.storage.local` | Shared across extension surfaces: stash items, snippets, the accent color, and the vault **token**. |
| IndexedDB | Local music files and the avatar. |
| Backend files | `vault.dat` (encrypted), `screentime.json`, `phone_code.txt`. |

## Key data flows

- **Accent color** → `theme.js` writes it to `chrome.storage`; content-script
  popups and the phone page read it so everything matches the wallpaper.
- **Vault autofill** → content script → `background.js` (adds `X-Vault-Token`) →
  backend. The page never sees the token.
- **Stash** → the in-page card / right-click / `>save` all write through
  `stashCore.js` to `chrome.storage`, so the board updates live.
- **Auto-DJ** → `background.js` classifies the active tab (code/video/other) →
  messages the new-tab page → `dashboard.js` plays/pauses `PLAYER`.
- **Phone** → new-tab shows a QR of `http://<lan-ip>:5055/phone?code=…`; the
  phone page and the new-tab poll `/phone/inbox` and push via `/phone/send`.

## Conventions

- New-tab JS files are plain scripts sharing globals (no modules); load order in
  `index.html` matters.
- Colors come from CSS variables (`--accent`, `--panel`, `--ink`, …) so the whole
  UI re-themes from the wallpaper automatically.
- In-page popups isolate themselves from page CSS with `all:initial` + inline
  styles.
