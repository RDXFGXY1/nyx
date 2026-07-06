# Features

Every feature, what it does, and where it lives. Backend-only features are
marked **[backend]** and need `run.bat` running.

---

## Links & tabs

- **Groups** — cards of links laid out across four columns. Each link shows the
  site's favicon (falls back to a letter).
- **Folders** — inside any card, add foldable sub-groups. Click a folder header
  to open/close; state is remembered.
- **Custom tabs** — the top bar tabs (Home/Projects/…) are yours to change. In
  edit mode: `+` adds a tab, the active tab becomes a rename field, `✕` deletes.
- **Copy link** — a copy button on every link row.
- **Edit mode** — pencil button (top-right) or `>edit`: add/rename/remove groups,
  folders, links, and tabs. Everything saves to the browser. `>links reset` and
  `>tabs reset` restore defaults.

## Search, launcher & command mode

- **Search bar** — type a query → Brave search; type a URL → go there.
- **Launcher** — type 2+ letters → fuzzy list of your saved links; Enter opens
  the highlighted one.
- **Command mode** — `>` opens 30+ commands (see [COMMANDS.md](COMMANDS.md)).

## Dashboard — `Alt+D`

Three panes:

- **Dashboard** — weather card, profile (click the avatar to change it),
  date, full calendar, and sliders for background dim, glass blur, and video
  wallpaper volume. Pinned links at the bottom.
- **Media** — the music player (see below).
- **System** — a **live monitor** **[backend]**: real CPU, RAM, disk, network,
  battery, and browser storage, refreshing every 2s, plus a **screen-time**
  card showing today's per-app foreground time.

Click the **clock** in the top bar for a quick calendar popover.

## Music

- **Sources** — local files you add (stored in the browser), the backend's
  `~/Music` library **[backend]**, and **online search** **[backend]** that
  resolves & streams tracks via yt-dlp.
- **Queue** — hover a song or online result → `＋` to queue it; "up next" list
  auto-advances.
- **Mini player** — a small now-playing pill appears on the main screen while
  music plays.
- **Commands** — `>play <song>`, `>queue <song>`, `>stop`.
- **Auto-DJ** — `>autodj`: music plays when the active tab is a coding site
  (GitHub, StackOverflow, CodePen…) and pauses on video sites (YouTube, Netflix,
  Twitch). Needs the backend for the tab signal.
- **Wallpaper pulse** — `>pulse`: the wallpaper breathes with the beat.

## Side panel — `Alt+N`

- **Notes** — an autosaving scratchpad. `>note <text>` appends.
- **To-do** — tasks with a progress bar. `>todo <text>` adds one.
- **Snips** — text expander. Define `;addr` → your address; type the trigger in
  any text box on any site and it expands.
- **Sent** — history of everything sent to/from your phone (see Phone).

## Stash — `Alt+S`

Save things you find, from anywhere:

- **In-page card** — select text on any page, hover the selection ~0.5s → a
  "Save to Stash" card with a category dropdown. Saves directly.
- **Right-click** — selected text / a link / an image → "Save to Stash".
- **Quick-save** — `>save <text or url>`.
- **Categories** — a dropdown of reusable tags (movie, watch, read…). Add/remove
  your own. Filter the board by category; untagged items are grouped.
- Everything is shared via the extension's storage, so saves show on the board
  instantly.

## Vault — `Alt+P` **[backend]**

An encrypted password manager with four sections: **passwords**, **2FA**,
**identity**, **cards**. In-page autofill for logins, one-time codes, addresses,
and (safely) cards. Full details and the security model: [VAULT.md](VAULT.md).

## Phone companion — `>phone` **[backend]**

Pair your phone over WiFi:

1. `>phone` shows a **QR** + a **6-digit pair code**.
2. Scan the QR with your phone (same network) — a mobile page opens, themed to
   your wallpaper color.
3. **Phone → PC**: paste a link/text on the phone → it opens/copies on your PC.
4. **PC → phone**: the send box in the `>phone` panel.
5. All transfers are logged in the **Sent** side-panel tab.

Security: the backend binds to the LAN, but a firewall lets non-local clients
reach **only** `/phone/*` — the vault, music, and system endpoints stay
localhost-only. Actions need the pair code, which is readable only on your PC.

## QR to phone — `Alt+Q`

On any web page, `Alt+Q` shows a QR of that page's URL. Scan it to open the page
on your phone. Generated locally; nothing is uploaded.

## Life-modes

Save and restore your whole environment:

- `>mode save work` — captures your accent, dim, blur, active tab, and every
  open browser tab's URL.
- `>mode work` — reapplies the look and reopens those tabs.
- `>mode` lists modes; `>mode del work` removes one.

## Daily briefing

Once per day, the first new tab shows a glass card: greeting, weather + 3-day
forecast, your open to-dos, and today's screen-time **[backend]**. Auto-dismisses
after ~13s, or click `✕`.

## Discord Rich Presence **[backend]**

Your Discord status follows your browsing: watching YouTube shows the video
title; on GitHub it shows the repo. The elapsed timer never resets. Requires a
Discord application ID in the backend config and its art assets uploaded — see
[BACKEND.md](BACKEND.md).

## PC control **[backend]**

From the search bar: `>lock`, `>sleep`, `>mute`, `>shutdown <min>` (with
`>abort` to cancel).

## Little things

- **The pet** — a corner creature that breathes, blinks, dances to music, and
  sleeps when you're idle. `>pet` toggles it.
- **Day mood** — a whisper of color tints the wallpaper by time of day.
- **Wallpaper** — image or video, auto-shrunk to fit storage; the accent color
  is pulled from it automatically.
