# Backend — NullTab.MusicServer

A local **ASP.NET Core (C# / .NET 8)** server that gives the extension its
superpowers. Binds to `http://0.0.0.0:5055` so the phone companion can reach it
over WiFi — but a firewall keeps everything except `/phone/*` **localhost-only**.

## Requirements

- [.NET 8 SDK](https://dotnet.microsoft.com/download) (`dotnet --version` ≥ 8)
- For online music: **yt-dlp** (path set in config).
- For Discord RPC: the `DiscordRichPresence` NuGet package (already referenced).

## Run

```bash
cd backend
run.bat            # Windows
./run.sh           # Linux / macOS
# or:  cd src/NullTab.MusicServer && dotnet run -c Release
```

Only **one** instance can hold port 5055. If you see *"address already in use"*,
another copy is running:

```bash
netstat -ano | findstr :5055     # find the PID
taskkill /PID <pid> /F           # stop it
```

## Configuration — `src/NullTab.MusicServer/appsettings.json`

```jsonc
"Kestrel": { "Endpoints": { "Http": { "Url": "http://0.0.0.0:5055" } } },
"Rpc":     { "ClientId": "<your Discord application id>" },
"Music": {
  "Library": "~/Music",          // "~" = home dir, or an absolute path
  "Extensions": [ ".mp3", ".flac", ".ogg", ".opus", ".m4a", ".aac", ".wav", ".wma" ],
  "AllowedOrigins": [ "*" ],
  "RescanMinutes": 0,            // auto-rescan interval; 0 = off
  "YtDlpPath": "C:\\...\\yt-dlp.exe"
}
```

To keep the server local-only (disable the phone companion), set the Kestrel URL
back to `http://127.0.0.1:5055`.

## Data files (next to the built binary)

| File | Contents |
|------|----------|
| `vault.dat` | The encrypted password vault. |
| `discord_client_id.txt` | Optional runtime Discord client id. |
| `screentime.json` | Today's per-app foreground seconds. |
| `phone_code.txt` | The phone pairing code. |

---

## API

### Music & library
| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/library` | All local `~/Music` tracks. |
| GET | `/api/tracks/{id}` | One track's metadata. |
| GET | `/api/stream/{id}` | Stream audio (Range/seek). |
| GET | `/api/art/{id}` | Embedded cover art. |
| POST | `/api/rescan` | Re-scan the library. |
| GET | `/api/health` | Liveness + track count. |
| GET | `/api/remote/search?q=` | Online search (yt-dlp). |
| GET | `/api/remote/stream/{videoId}` | Proxy-stream an online track (seekable). |

### System
| Method | Route | Purpose |
|--------|-------|---------|
| GET | `/api/system` | Real CPU / RAM / disk / network / uptime. |
| GET | `/api/screentime` | Today's per-app foreground time. |

### Discord Rich Presence
| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/rpc/activity` | Set presence (details, state, image keys). Timestamp is fixed so the timer never resets. |

**Setup:** create an app at <https://discord.com/developers>, put its
Application ID in `Rpc:ClientId`, and upload Rich-Presence **art assets** named
`youtube`, `github`, `browser`, `play`, `code`. The Discord **desktop** app must
be running.

### Power / PC control
| Method | Route | Purpose |
|--------|-------|---------|
| POST | `/api/power/lock` | Lock the workstation. |
| POST | `/api/power/sleep` | Sleep. |
| POST | `/api/power/shutdown?min=N` | Shut down in N minutes. |
| POST | `/api/power/abort` | Cancel a scheduled shutdown. |
| POST | `/api/power/mute` | Toggle system mute. |
| POST | `/api/power/vol?dir=up&steps=5` | Nudge volume. |

### Vault
Token-guarded (`X-Vault-Token`). See [VAULT.md](VAULT.md) for the full list and
the security model.

### Phone companion (the only LAN-reachable group)
| Method | Route | Auth | Purpose |
|--------|-------|------|---------|
| GET | `/phone` | — | The mobile page. |
| GET | `/phone/info` | localhost | Pair code + LAN URL (for the QR). |
| GET/POST | `/phone/theme` | code / localhost | The accent color for the phone page. |
| POST | `/phone/send` | code | Queue a link/text to PC or phone. |
| GET | `/phone/inbox?to=pc\|phone` | code | Drain queued items. |

**Firewall:** middleware in `Program.cs` returns 403 to any non-loopback request
whose path isn't `/phone/*`. So on the LAN, the vault, music, and system APIs are
unreachable; only the phone endpoints are, and they need the pair code (which is
readable only from localhost).

---

## Project layout

```
backend/src/NullTab.MusicServer/
├── Program.cs                 # entry, DI, CORS, LAN firewall
├── appsettings.json           # config
├── Configuration/MusicOptions.cs
├── Models/Track.cs
├── Services/
│   ├── MusicLibrary.cs        # scan + tags + id→path
│   ├── AudioContentTypes.cs
│   ├── LibraryScanHostedService.cs
│   ├── SystemStatsService.cs  # Win32 CPU/RAM/net counters
│   ├── ScreenTimeService.cs   # foreground-window sampler
│   ├── DiscordRpcService.cs   # Rich Presence
│   └── VaultService.cs        # AES-GCM vault + TOTP
└── Controllers/
    ├── LibraryController.cs   StreamController.cs   RemoteController.cs
    ├── SystemController.cs     RpcController.cs       PowerController.cs
    ├── VaultController.cs      PhoneController.cs
```
