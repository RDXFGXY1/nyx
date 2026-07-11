using System.Collections.Concurrent;
using System.Diagnostics;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using NullTab.MusicServer.Configuration;
using NullTab.MusicServer.Services;

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

    /// <summary>Live download jobs by YouTube id: state (downloading/done/error) + percent + error text.</summary>
    private static readonly ConcurrentDictionary<string, (string State, double Percent, string Error)> Downloads = new();

    private static readonly System.Text.RegularExpressions.Regex PercentRe =
        new(@"(\d{1,3}(?:\.\d+)?)%", System.Text.RegularExpressions.RegexOptions.Compiled);

    private readonly MusicOptions _opts;
    private readonly IHttpClientFactory _http;
    private readonly IMusicLibrary _library;
    private readonly ILogger<RemoteController> _log;

    public RemoteController(IOptions<MusicOptions> opts, IHttpClientFactory http,
        IMusicLibrary library, ILogger<RemoteController> log)
    {
        _opts = opts.Value;
        _http = http;
        _library = library;
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

        // filenames already in the library, so we can flag results you own
        var libraryFiles = SafeLibraryFileNames();

        var results = new List<object>();
        foreach (var line in stdout.Split('\n', StringSplitOptions.RemoveEmptyEntries))
        {
            try
            {
                using var doc = JsonDocument.Parse(line);
                var r = doc.RootElement;
                string? vid = r.GetProperty("id").GetString();
                results.Add(new
                {
                    id = vid,
                    title = r.TryGetProperty("title", out var t) ? t.GetString() : "untitled",
                    uploader = r.TryGetProperty("channel", out var c) && c.ValueKind == JsonValueKind.String
                        ? c.GetString()
                        : r.TryGetProperty("uploader", out var u) && u.ValueKind == JsonValueKind.String
                            ? u.GetString()
                            : null,
                    duration = r.TryGetProperty("duration", out var d) && d.ValueKind == JsonValueKind.Number
                        ? (int?)d.GetDouble()
                        : null,
                    inLibrary = vid != null && libraryFiles.Any(f => f.Contains("[" + vid + "]")),
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

    /// <summary>
    /// POST /api/remote/download/{id} — start saving a track's audio into the
    /// library folder (best audio, no re-encode). Runs in the background; poll
    /// /status for progress. On success the library is rescanned.
    /// </summary>
    [HttpPost("download/{id}")]
    public IActionResult Download(string id)
    {
        if (!IsValidId(id)) return BadRequest();

        if (Downloads.TryGetValue(id, out var cur) && cur.State == "downloading")
            return Ok(new { started = true, already = true });

        Downloads[id] = ("downloading", 0, "");
        _ = Task.Run(() => RunDownloadJobAsync(id));
        return Ok(new { started = true });
    }

    /// <summary>GET /api/remote/download/{id}/status — { state, percent, error }.</summary>
    [HttpGet("download/{id}/status")]
    public IActionResult DownloadStatus(string id)
    {
        if (Downloads.TryGetValue(id, out var s))
            return Ok(new { state = s.State, percent = s.Percent, error = s.Error });
        return Ok(new { state = "idle", percent = 0.0, error = "" });
    }

    private async Task RunDownloadJobAsync(string id)
    {
        try
        {
            var dir = _library.LibraryPath;
            Directory.CreateDirectory(dir);
            var outTemplate = Path.Combine(dir, "%(title)s [%(id)s].%(ext)s");

            var (ok, error) = await RunYtDlpDownloadAsync(new[]
            {
                "--no-playlist", "--newline", "--no-part",
                "-f", "bestaudio[ext=m4a]/bestaudio/best",
                "-o", outTemplate,
                "https://www.youtube.com/watch?v=" + id,
            }, pct => Downloads[id] = ("downloading", pct, ""));

            if (ok)
            {
                await _library.ScanAsync();
                Downloads[id] = ("done", 100, "");
            }
            else
            {
                _log.LogWarning("Download of {Id} failed: {Error}", id, error);
                Downloads[id] = ("error", 0, error);
            }
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "Download job failed for {Id}", id);
            Downloads[id] = ("error", 0, ex.Message);
        }
    }

    private async Task<(bool ok, string error)> RunYtDlpDownloadAsync(string[] args, Action<double> onProgress)
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

        var errLines = new List<string>();

        try
        {
            using var proc = Process.Start(psi);
            if (proc is null) return (false, "could not start yt-dlp — check Music:YtDlpPath");

            void Handle(string? line, bool isErr)
            {
                if (line is null) return;
                var m = PercentRe.Match(line);
                if (m.Success && double.TryParse(m.Groups[1].Value,
                        System.Globalization.CultureInfo.InvariantCulture, out double p))
                    onProgress(Math.Clamp(p, 0, 100));
                if (isErr && line.Contains("ERROR", StringComparison.OrdinalIgnoreCase))
                    errLines.Add(line.Trim());
            }

            proc.OutputDataReceived += (_, e) => Handle(e.Data, false);
            proc.ErrorDataReceived += (_, e) => Handle(e.Data, true);
            proc.BeginOutputReadLine();
            proc.BeginErrorReadLine();

            await proc.WaitForExitAsync();

            if (proc.ExitCode == 0) return (true, "");
            string err = errLines.Count > 0 ? errLines[^1] : $"yt-dlp exited with code {proc.ExitCode}";
            return (false, err);
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Could not run yt-dlp download at '{Path}'", _opts.YtDlpPath);
            return (false, ex.Message);
        }
    }

    private List<string> SafeLibraryFileNames()
    {
        try
        {
            var dir = _library.LibraryPath;
            if (!Directory.Exists(dir)) return new();
            return Directory.EnumerateFiles(dir).Select(Path.GetFileName).Where(n => n != null).ToList()!;
        }
        catch { return new(); }
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
