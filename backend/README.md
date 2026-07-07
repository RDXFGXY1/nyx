# NullTab Music Server

NullTab Music Server is a lightweight ASP.NET Core backend designed to bring your local music collection into the browser-based Nyx experience. It scans your music directory, reads metadata and cover art, and exposes clean HTTP endpoints so the extension can browse and play tracks without relying on cloud services.

## Main features

- scans a local music folder and builds a searchable library
- reads track metadata such as title, artist, album, and duration
- extracts embedded cover art for rich media display
- serves audio files with streaming and seek support
- provides a simple API for the extension to discover and play music
- works entirely offline and locally for privacy-friendly playback
- supports rescan operations so new files are picked up automatically

## Project structure

```text
backend/
├── NullTab.MusicServer.sln
├── run.sh / run.bat
├── src/NullTab.MusicServer/
│   ├── Program.cs
│   ├── appsettings.json
│   ├── Configuration/
│   ├── Controllers/
│   ├── Models/
│   └── Services/
└── client/
```

## Requirements

- .NET 8 SDK

## Quick start

From the backend folder, run:

```bash
./run.sh          # Linux / macOS
run.bat          # Windows
```

Or run it manually:

```bash
cd src/NullTab.MusicServer
dotnet run -c Release
```

The server starts on http://127.0.0.1:5055 by default.

## Configuration

Edit appsettings.json to customize the music source and refresh behavior:

```json
"Music": {
  "Library": "~/Music",
  "RescanMinutes": 0
}
```

You can point the server to any folder you want, including a custom music directory on your machine.

## API endpoints

| Method | Route | Purpose |
|--------|-------|---------|
| GET | /api/library | list all tracks |
| GET | /api/tracks/{id} | get detailed metadata for one track |
| GET | /api/stream/{id} | stream audio content |
| GET | /api/art/{id} | retrieve embedded cover art |
| POST | /api/rescan | rescan the library immediately |
| GET | /api/health | check server health and track count |

## Extension integration

The browser extension can communicate with the server through the client helpers in the client folder. If local requests are blocked by the browser, ensure the extension has permission to access the local server endpoint.

## Notes

This backend is intentionally simple, local-first, and focused on browser playback. It is designed for personal use and does not include Discord, Lavalink, or cloud streaming features.
