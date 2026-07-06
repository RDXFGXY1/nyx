using NullTab.MusicServer.Models;

namespace NullTab.MusicServer.Services;

/// <summary>
/// Owns the in-memory view of the music library: scanning, lookups,
/// and resolving a public track id back to a real file on disk.
/// </summary>
public interface IMusicLibrary
{
    /// <summary>All known tracks, sorted artist → album → track number.</summary>
    IReadOnlyList<Track> Tracks { get; }

    /// <summary>When the library was last scanned.</summary>
    DateTimeOffset ScannedAt { get; }

    /// <summary>The resolved absolute library path being served.</summary>
    string LibraryPath { get; }

    /// <summary>(Re)scan the library folder from disk.</summary>
    Task ScanAsync(CancellationToken ct = default);

    /// <summary>
    /// Resolve a public id to a real file path, or null if unknown.
    /// The path is guaranteed to sit inside the library folder.
    /// </summary>
    string? ResolvePath(string id);

    /// <summary>Get a single track's metadata by id.</summary>
    Track? Get(string id);
}
