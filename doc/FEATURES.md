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

Everything below can also be set up in **settings** (the gear, top-right) —
the **writing assistant** and **AI writing** groups hold every toggle, the
dictionary language + download button, your provider and API key with a
**test** button, your personal dictionary as removable chips, and a shortcut
to the stats panel. The `>` commands stay as the fast path.

## Typing assistant — `>typing`

Autocomplete and spelling correction while you type in any text box, on any
site (and in the new-tab notes/to-do boxes). A small popup follows your caret:
**↑/↓** pick, **Tab** accepts, **Esc** dismisses. Rows marked `fix` are
spelling corrections; `→` rows are completions.

Two engines:

- **Local** — `>typing local fr` downloads a ~50,000-word frequency dictionary
  for your language once (stored in the extension), then everything works
  offline and instantly. Any language code from
  [FrequencyWords](https://github.com/hermitdave/FrequencyWords) works
  (`en`, `fr`, `ar`, `es`, `de`, …).
- **Online** — `>typing online` fetches suggestions as you type (Datamuse,
  English). No download, needs internet.

Off by default; `>typing` toggles it. `>typing status` shows the current
mode, language, and dictionary size.

## Grammar & AI rewrite — `>grammar` / `>ai`

The grammar layer on top of the typing assistant:

- **Online grammar fix** — `>grammar`: when you pause typing, the text box is
  checked with LanguageTool (free, no key, many languages). A popup lists each
  fix (~~wrong~~ → right); click one, or "apply all".
- **Auto-write** — `>grammar auto`: fixes are applied silently as you type —
  no popup, just a small "fixed N things" flash.
- **AI rewrite** — a floating **✦ button** appears on any text box you type in:
  one click and your own AI fixes the whole text in place (Shift-click polishes
  it for clarity, not just correctness; `Alt+R` / `Shift+Alt+R` do the same
  from the keyboard; `>ai button` hides the button). Works with `groq`, `openai`, `gemini`, `claude`, `deepseek`,
  `grok`, `kimi`, `qwen`, or a local `ollama` (no key). Setup:
  `>ai groq` → `>ai key <your-key>` → `>ai test`.

Your API key stays in extension storage and is only used by the background
worker — pages and content scripts never see it. Note: grammar checking sends
the text of the box to languagetool.org, and the AI features send text to the
AI provider you chose — that's inherent to how they work.

More AI helpers (same provider setup):

- **Tone presets** — right-click the ✦ button for a menu: fix / polish /
  formal / casual / shorter. Also `>rewrite formal <text>` from the search bar.
- **Reply helper** — select a message someone sent you (email, chat, comment)
  and press **Alt+A**: a draft reply appears next to it, one click to copy.
  Or `>reply <their message>` from the search bar.
- **Page summarizer** — **Alt+W** on any page: TL;DR + bullet points in the
  page's language, with a copy button.
- **Smart daily briefing** — when an AI provider is configured, the once-a-day
  briefing card opens with one warm AI-written line about your day.

## Personal dictionary — `>dict`

Words the spell-checker keeps flagging that are actually fine (names, slang,
Darija…): add them once and they're never flagged again — by the typing
assistant *or* the grammar checker — and they show up in autocomplete.
`>dict add <word>` / `del <word>` / `list` / `clear`, or click the **＋** next
to any fix in the grammar popup ("that word is fine").

## Typing stats — `>typing stats`

A small panel: words typed today, completions accepted, grammar fixes, AI
rewrites (each with 7-day totals), and your most-fixed mistakes of the week.
Counting happens locally; stats never leave the extension.

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
