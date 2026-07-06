using Microsoft.AspNetCore.Mvc;
using NullTab.MusicServer.Services;

namespace NullTab.MusicServer.Controllers;

[ApiController]
[Route("api")]
public sealed class StreamController : ControllerBase
{
    private readonly IMusicLibrary _library;

    public StreamController(IMusicLibrary library) => _library = library;

    /// <summary>
    /// GET /api/stream/{id} — streams the audio file.
    /// EnableRangeProcessing lets the browser seek and the &lt;audio&gt;
    /// element request byte ranges instead of the whole file.
    /// </summary>
    [HttpGet("stream/{id}")]
    public IActionResult Stream(string id)
    {
        var path = _library.ResolvePath(id);
        if (path is null) return NotFound();

        var contentType = AudioContentTypes.ForFile(path);
        var stream = new FileStream(
            path, FileMode.Open, FileAccess.Read, FileShare.Read,
            bufferSize: 64 * 1024, useAsync: true);

        // enableRangeProcessing: true  → HTTP 206 partial content + seeking
        return File(stream, contentType, enableRangeProcessing: true);
    }

    /// <summary>
    /// GET /api/art/{id} — embedded cover art for a track, if any.
    /// </summary>
    [HttpGet("art/{id}")]
    public IActionResult Art(string id)
    {
        var path = _library.ResolvePath(id);
        if (path is null) return NotFound();

        try
        {
            var atl = new ATL.Track(path);
            var pic = atl.EmbeddedPictures.FirstOrDefault();
            if (pic?.PictureData is { Length: > 0 } data)
            {
                // cover art rarely changes — let the browser cache it
                Response.Headers.CacheControl = "public, max-age=86400";
                return File(data, SniffImageMime(data));
            }
        }
        catch
        {
            // fall through to 404
        }

        return NotFound();
    }

    /// <summary>Detect image type from magic bytes (jpeg/png/gif/webp).</summary>
    private static string SniffImageMime(byte[] b)
    {
        if (b.Length >= 3 && b[0] == 0xFF && b[1] == 0xD8 && b[2] == 0xFF)
            return "image/jpeg";
        if (b.Length >= 8 && b[0] == 0x89 && b[1] == 0x50 && b[2] == 0x4E && b[3] == 0x47)
            return "image/png";
        if (b.Length >= 6 && b[0] == 0x47 && b[1] == 0x49 && b[2] == 0x46)
            return "image/gif";
        if (b.Length >= 12 && b[0] == 0x52 && b[1] == 0x49 && b[2] == 0x46 && b[3] == 0x46
            && b[8] == 0x57 && b[9] == 0x45 && b[10] == 0x42 && b[11] == 0x50)
            return "image/webp";
        return "image/jpeg";
    }
}
