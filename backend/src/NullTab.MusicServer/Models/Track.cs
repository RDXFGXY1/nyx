namespace NullTab.MusicServer.Models;

/// <summary>A single playable track, as sent to the client.</summary>
public sealed record Track
{
    /// <summary>Stable id (hash of the relative path). Used in stream/art URLs.</summary>
    public required string Id { get; init; }

    public required string Title { get; init; }
    public string Artist { get; init; } = "Unknown Artist";
    public string Album { get; init; } = "Unknown Album";

    /// <summary>Duration in seconds (0 if unknown).</summary>
    public int Duration { get; init; }

    /// <summary>Track number within its album (0 if unknown).</summary>
    public int TrackNumber { get; init; }

    /// <summary>True when the file has embedded cover art available at /api/art/{id}.</summary>
    public bool HasArt { get; init; }

    /// <summary>File extension without dot, e.g. "mp3". Handy for the UI.</summary>
    public required string Format { get; init; }
}

/// <summary>Full-library response with a little metadata.</summary>
public sealed record LibraryResponse
{
    public required IReadOnlyList<Track> Tracks { get; init; }
    public required int Count { get; init; }
    public required DateTimeOffset ScannedAt { get; init; }
    public required string Library { get; init; }
}
