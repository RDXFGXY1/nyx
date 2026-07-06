using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Options;
using NullTab.MusicServer.Configuration;
using NullTab.MusicServer.Models;

namespace NullTab.MusicServer.Services;

/// <summary>
/// Scans the library folder, reads tags with ATL, and keeps an
/// id → file-path map in memory. Thread-safe for concurrent reads
/// while a rescan is running.
/// </summary>
public sealed class MusicLibrary : IMusicLibrary
{
    private readonly MusicOptions _opts;
    private readonly ILogger<MusicLibrary> _log;
    private readonly HashSet<string> _exts;

    // published atomically on each scan
    private volatile Snapshot _snapshot = Snapshot.Empty;

    public MusicLibrary(IOptions<MusicOptions> opts, ILogger<MusicLibrary> log)
    {
        _opts = opts.Value;
        _log = log;
        _exts = _opts.Extensions
            .Select(e => e.StartsWith('.') ? e : "." + e)
            .Select(e => e.ToLowerInvariant())
            .ToHashSet();
    }

    public IReadOnlyList<Track> Tracks => _snapshot.Tracks;
    public DateTimeOffset ScannedAt => _snapshot.ScannedAt;
    public string LibraryPath => ResolveLibraryPath();

    public Track? Get(string id) =>
        _snapshot.ById.TryGetValue(id, out var e) ? e.Track : null;

    public string? ResolvePath(string id)
    {
        if (!_snapshot.ById.TryGetValue(id, out var e)) return null;

        // Defence in depth: make sure the resolved file is still inside
        // the library root and still exists.
        var root = ResolveLibraryPath();
        var full = Path.GetFullPath(e.Path);
        // Windows paths are case-insensitive; Linux/macOS are not.
        var cmp = OperatingSystem.IsWindows()
            ? StringComparison.OrdinalIgnoreCase
            : StringComparison.Ordinal;
        if (!full.StartsWith(root, cmp) || !File.Exists(full))
            return null;

        return full;
    }

    public Task ScanAsync(CancellationToken ct = default)
    {
        return Task.Run(() =>
        {
            var root = ResolveLibraryPath();
            _log.LogInformation("Scanning music library at {Root}", root);

            if (!Directory.Exists(root))
            {
                _log.LogWarning("Library folder does not exist: {Root}", root);
                _snapshot = Snapshot.Empty;
                return;
            }

            var tracks = new List<Track>();
            var byId = new ConcurrentDictionary<string, Entry>();

            IEnumerable<string> files;
            try
            {
                files = Directory.EnumerateFiles(root, "*", SearchOption.AllDirectories)
                    .Where(f => _exts.Contains(Path.GetExtension(f).ToLowerInvariant()));
            }
            catch (Exception ex)
            {
                _log.LogError(ex, "Failed to enumerate library");
                return;
            }

            foreach (var file in files)
            {
                ct.ThrowIfCancellationRequested();
                try
                {
                    var rel = Path.GetRelativePath(root, file);
                    var id = MakeId(rel);
                    var track = ReadTrack(id, file);
                    tracks.Add(track);
                    byId[id] = new Entry(track, file);
                }
                catch (Exception ex)
                {
                    _log.LogDebug(ex, "Skipping unreadable file {File}", file);
                }
            }

            tracks.Sort((a, b) =>
            {
                var c = string.Compare(a.Artist, b.Artist, StringComparison.OrdinalIgnoreCase);
                if (c != 0) return c;
                c = string.Compare(a.Album, b.Album, StringComparison.OrdinalIgnoreCase);
                if (c != 0) return c;
                c = a.TrackNumber.CompareTo(b.TrackNumber);
                return c != 0 ? c : string.Compare(a.Title, b.Title, StringComparison.OrdinalIgnoreCase);
            });

            _snapshot = new Snapshot(tracks, byId, DateTimeOffset.UtcNow);
            _log.LogInformation("Scan complete: {Count} tracks", tracks.Count);
        }, ct);
    }

    private Track ReadTrack(string id, string file)
    {
        var ext = Path.GetExtension(file).TrimStart('.').ToLowerInvariant();

        Track Fallback() => new()
        {
            Id = id,
            Title = Path.GetFileNameWithoutExtension(file),
            Format = ext,
        };

        try
        {
            var tag = new ATL.Track(file);
            var title = string.IsNullOrWhiteSpace(tag.Title)
                ? Path.GetFileNameWithoutExtension(file)
                : tag.Title;

            return new Track
            {
                Id = id,
                Title = title,
                Artist = string.IsNullOrWhiteSpace(tag.Artist) ? "Unknown Artist" : tag.Artist,
                Album = string.IsNullOrWhiteSpace(tag.Album) ? "Unknown Album" : tag.Album,
                Duration = tag.Duration,           // seconds
                TrackNumber = TrackNo(tag),
                HasArt = tag.EmbeddedPictures.Count > 0,
                Format = ext,
            };
        }
        catch
        {
            return Fallback();
        }
    }

    // ATL exposes TrackNumber as int in some versions, int? in others.
    // Convert.ToInt32 on the boxed value handles both without a compile-time dependency.
    private static int TrackNo(ATL.Track tag)
    {
        try
        {
            object? val = tag.TrackNumber;
            return val is null ? 0 : Convert.ToInt32(val);
        }
        catch
        {
            return 0;
        }
    }

    private string ResolveLibraryPath()
    {
        var p = _opts.Library;
        if (p == "~" || p.StartsWith("~/") || p.StartsWith("~\\"))
        {
            var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
            p = Path.Combine(home, p.Length <= 2 ? "" : p[2..]);
        }
        return Path.GetFullPath(p);
    }

    private static string MakeId(string relativePath)
    {
        // Deterministic short id from the relative path — stable across restarts.
        var bytes = SHA1.HashData(Encoding.UTF8.GetBytes(relativePath));
        return Convert.ToHexString(bytes)[..16].ToLowerInvariant();
    }

    private readonly record struct Entry(Track Track, string Path);

    private sealed class Snapshot(
        IReadOnlyList<Track> tracks,
        IReadOnlyDictionary<string, Entry> byId,
        DateTimeOffset scannedAt)
    {
        public static readonly Snapshot Empty =
            new(Array.Empty<Track>(), new Dictionary<string, Entry>(), DateTimeOffset.UtcNow);

        public IReadOnlyList<Track> Tracks { get; } = tracks;
        public IReadOnlyDictionary<string, Entry> ById { get; } = byId;
        public DateTimeOffset ScannedAt { get; } = scannedAt;
    }
}
