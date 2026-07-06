using Microsoft.AspNetCore.Mvc;
using NullTab.MusicServer.Models;
using NullTab.MusicServer.Services;

namespace NullTab.MusicServer.Controllers;

[ApiController]
[Route("api")]
public sealed class LibraryController : ControllerBase
{
    private readonly IMusicLibrary _library;

    public LibraryController(IMusicLibrary library) => _library = library;

    /// <summary>GET /api/library — the whole library as JSON.</summary>
    [HttpGet("library")]
    public ActionResult<LibraryResponse> GetLibrary()
    {
        return Ok(new LibraryResponse
        {
            Tracks = _library.Tracks,
            Count = _library.Tracks.Count,
            ScannedAt = _library.ScannedAt,
            Library = _library.LibraryPath,
        });
    }

    /// <summary>GET /api/tracks/{id} — one track's metadata.</summary>
    [HttpGet("tracks/{id}")]
    public ActionResult<Track> GetTrack(string id)
    {
        var track = _library.Get(id);
        return track is null ? NotFound() : Ok(track);
    }

    /// <summary>POST /api/rescan — force a fresh scan of ~/Music.</summary>
    [HttpPost("rescan")]
    public async Task<ActionResult<object>> Rescan(CancellationToken ct)
    {
        await _library.ScanAsync(ct);
        return Ok(new { count = _library.Tracks.Count, scannedAt = _library.ScannedAt });
    }

    /// <summary>GET /api/health — quick liveness probe for the client.</summary>
    [HttpGet("health")]
    public ActionResult<object> Health() =>
        Ok(new { status = "ok", tracks = _library.Tracks.Count, library = _library.LibraryPath });
}
