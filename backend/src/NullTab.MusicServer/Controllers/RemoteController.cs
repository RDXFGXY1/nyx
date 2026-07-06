using System.Collections.Concurrent;
using System.Diagnostics;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using NullTab.MusicServer.Configuration;

namespace NullTab.MusicServer.Controllers;

/// <summary>
/// Online streaming — the browser-friendly version of what a Discord
/// bot's Lavalink node does: resolve a track from the internet and
/// stream the audio. Here yt-dlp resolves, and we proxy the audio over
/// HTTP with Range passthrough so the &lt;audio&gt; element can seek.
/// </summary>
[ApiController]
[Route("api/remote")]
public sealed class RemoteController : ControllerBase
{
    /// <summary>Resolved direct URLs are IP-locked and expire; cache briefly.</summary>
    private static readonly ConcurrentDictionary<string, (string Url, DateTimeOffset Expires)> UrlCache = new();

    private readonly MusicOptions _opts;
    private readonly IHttpClientFactory _http;
    private readonly ILogger<RemoteController> _log;

    public RemoteController(IOptions<MusicOptions> opts, IHttpClientFactory http, ILogger<RemoteController> log)
    {
        _opts = opts.Value;
        _http = http;
        _log = log;
    }

    /// <summary>
    /// GET /api/remote/search?q=... — top YouTube results for a query.
    /// </summary>
    [HttpGet("search")]
    public async Task<IActionResult> Search([FromQuery] string q, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(q))
            return BadRequest(new { error = "missing q" });

        var stdout = await RunYtDlpAsync(
            new[] { "--no-warnings", "--flat-playlist", "--dump-json", $"ytsearch8:{q.Trim()}" }, ct);
        if (stdout is null)
            return StatusCode(502, new { error = "yt-dlp failed — check Music:YtDlpPath" });

        var results = new List<object>();
        foreach (var line in stdout.Split('\n', StringSplitOptions.RemoveEmptyEntries))
        {
            try
            {
                using var doc = JsonDocument.Parse(line);
                var r = doc.RootElement;
                results.Add(new
                {
                    id = r.GetProperty("id").GetString(),
                    title = r.TryGetProperty("title", out var t) ? t.GetString() : "untitled",
                    uploader = r.TryGetProperty("channel", out var c) && c.ValueKind == JsonValueKind.String
                        ? c.GetString()
                        : r.TryGetProperty("uploader", out var u) && u.ValueKind == JsonValueKind.String
                            ? u.GetString()
                            : null,
                    duration = r.TryGetProperty("duration", out var d) && d.ValueKind == JsonValueKind.Number
                        ? (int?)d.GetDouble()
                        : null,
                });
            }
            catch
            {
                // skip malformed line
            }
        }
        return Ok(new { results });
    }

    /// <summary>
    /// GET /api/remote/stream/{id} — resolve the video's audio and proxy
    /// it to the client, passing the Range header through so seeking works.
    /// </summary>
    [HttpGet("stream/{id}")]
    public async Task<IActionResult> Stream(string id, CancellationToken ct)
    {
        if (!IsValidId(id)) return BadRequest();

        var url = await ResolveAsync(id, ct);
        if (url is null)
            return StatusCode(502, new { error = "could not resolve audio" });

        var client = _http.CreateClient("remote");
        var upstreamReq = new HttpRequestMessage(HttpMethod.Get, url);
        if (Request.Headers.TryGetValue("Range", out var range))
            upstreamReq.Headers.TryAddWithoutValidation("Range", (string)range!);

        HttpResponseMessage upstream;
        try
        {
            upstream = await client.SendAsync(upstreamReq, HttpCompletionOption.ResponseHeadersRead, ct);
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "Upstream fetch failed for {Id}", id);
            UrlCache.TryRemove(id, out _);
            return StatusCode(502);
        }

        if (!upstream.IsSuccessStatusCode)
        {
            // stale/expired direct link — forget it so the next try re-resolves
            UrlCache.TryRemove(id, out _);
            upstream.Dispose();
            return StatusCode((int)upstream.StatusCode);
        }

        Response.StatusCode = (int)upstream.StatusCode;
        Response.ContentType = upstream.Content.Headers.ContentType?.ToString() ?? "audio/mp4";
        if (upstream.Content.Headers.ContentLength is { } len) Response.ContentLength = len;
        if (upstream.Content.Headers.ContentRange is { } cr) Response.Headers.ContentRange = cr.ToString();
        Response.Headers.AcceptRanges = "bytes";

        try
        {
            await using var body = await upstream.Content.ReadAsStreamAsync(ct);
            await body.CopyToAsync(Response.Body, 64 * 1024, ct);
        }
        catch (OperationCanceledException)
        {
            // client stopped/seeked — normal
        }
        finally
        {
            upstream.Dispose();
        }
        return new EmptyResult();
    }

    // ---- internals ----

    private async Task<string?> ResolveAsync(string id, CancellationToken ct)
    {
        if (UrlCache.TryGetValue(id, out var hit) && hit.Expires > DateTimeOffset.UtcNow)
            return hit.Url;

        var stdout = await RunYtDlpAsync(new[]
        {
            "--no-warnings", "-f", "bestaudio[ext=m4a]/bestaudio", "-g",
            "https://www.youtube.com/watch?v=" + id,
        }, ct);

        var url = stdout?.Split('\n', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault()?.Trim();
        if (string.IsNullOrEmpty(url) || !url.StartsWith("http")) return null;

        UrlCache[id] = (url, DateTimeOffset.UtcNow.AddMinutes(30));
        return url;
    }

    private async Task<string?> RunYtDlpAsync(string[] args, CancellationToken ct)
    {
        var psi = new ProcessStartInfo
        {
            FileName = _opts.YtDlpPath,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8,
        };
        foreach (var a in args) psi.ArgumentList.Add(a);

        try
        {
            using var proc = Process.Start(psi);
            if (proc is null) return null;

            var stdoutTask = proc.StandardOutput.ReadToEndAsync(ct);
            var stderrTask = proc.StandardError.ReadToEndAsync(ct);
            await proc.WaitForExitAsync(ct);

            if (proc.ExitCode != 0)
            {
                _log.LogWarning("yt-dlp exit {Code}: {Err}", proc.ExitCode,
                    (await stderrTask).Split('\n').FirstOrDefault());
                return null;
            }
            return await stdoutTask;
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Could not run yt-dlp at '{Path}'", _opts.YtDlpPath);
            return null;
        }
    }

    /// <summary>YouTube ids only — keeps arbitrary strings out of the process args.</summary>
    private static bool IsValidId(string id) =>
        id.Length is >= 6 and <= 16 && id.All(ch => char.IsLetterOrDigit(ch) || ch is '-' or '_');
}
