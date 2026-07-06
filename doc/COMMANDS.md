# Commands & Shortcuts

## Command mode

Type **`>`** in the search bar to open command mode. Arrows move, **Tab**
completes, **Enter** runs, **Esc** closes. `>help` lists everything.

### Appearance
| Command | Does |
|---------|------|
| `>wall` | Pick a wallpaper — image or video (mp4/webm). |
| `>wall reset` | Back to the default wallpaper. |
| `>accent auto` | Recompute the accent color from the wallpaper. |
| `>accent #ff4d55` | Set the accent color manually. |
| `>dim 0.6` | Background dim, `0.2`–`1`. |
| `>blur 12` | Glass blur in px, `0`–`30`. |
| `>avatar` | Change the dashboard profile picture. |

### Page & identity
| Command | Does |
|---------|------|
| `>name Kyros` | Set the greeting name. |
| `>city Rabat` | Set the weather city. |
| `>tab projects` | Switch to a tab by name. |
| `>tabs reset` | Restore the default tabs. |
| `>dock` | Toggle the bottom dock / dashboard. |
| `>reset` | Wipe all saved settings. |

### Links
| Command | Does |
|---------|------|
| `>edit` | Toggle edit mode — add/rename/remove groups, folders, links, and tabs. |
| `>links reset` | Restore the default link groups. |

### Music
| Command | Does |
|---------|------|
| `>play <song>` | Search the internet and play the top hit (backend). |
| `>queue <song>` | Search and add the top hit to the queue. |
| `>stop` | Stop playback. |
| `>pulse` | Toggle the wallpaper pulsing to the beat. |
| `>autodj` | Toggle Auto-DJ (code sites play, video sites pause). |

### Notes / stash / vault
| Command | Does |
|---------|------|
| `>note buy milk` | Append a quick note (side panel). |
| `>todo fix bug` | Add a task. |
| `>stash` | Open the stash (saved things). |
| `>save Dune 2` | Quick-save text/link to the stash. |
| `>vault` | Open the password vault. |

### System & devices
| Command | Does |
|---------|------|
| `>mode work` | Apply a life-mode. `>mode save work` saves the current setup + open tabs; `>mode del work` removes it. |
| `>phone` | Open the phone companion (QR + pair code + send box). |
| `>pet` | Toggle the corner pet. |
| `>lock` | Lock the PC (backend). |
| `>sleep` | Sleep the PC (backend). |
| `>shutdown 5` | Shut down in N minutes (default 1). |
| `>abort` | Cancel a scheduled shutdown. |
| `>mute` | Toggle system mute (backend). |
| `>help` | Show all commands. |

---

## Keyboard shortcuts

### On the new tab
| Key | Action |
|-----|--------|
| `/` | Focus the search bar. |
| type 2+ letters | Launcher — fuzzy-search your links; Enter opens the top hit. |
| `Alt+D` / `Alt+K` | Open the dashboard (Media / System / Dashboard). |
| `Alt+N` | Open the side panel (Notes / To-do / Snips / Sent). |
| `Alt+T` | Open the side panel on To-do. |
| `Alt+S` | Open the stash. |
| `Alt+P` | Open the password vault. |
| `Esc` | Close whatever overlay is open. |

### On any web page (content scripts)
| Key | Action |
|-----|--------|
| `Alt+Q` | Show a QR code of the current page (scan with your phone). |
| select text → hover ~0.5s | "Save to Stash" card. |
| type `;trigger` | Expand a saved text snippet. |
| focus a login field | Autofill menu (saved logins / suggest strong password). |
| focus a 2FA / card / address field | Offer to fill the matching vault item. |

Right-click selected text, a link, or an image on any page → **Save to Stash**.
