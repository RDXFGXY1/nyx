namespace NullTab.MusicServer.Services;

/// <summary>Maps audio file extensions to MIME types for correct playback.</summary>
public static class AudioContentTypes
{
    private static readonly Dictionary<string, string> Map = new(StringComparer.OrdinalIgnoreCase)
    {
        [".mp3"] = "audio/mpeg",
        [".flac"] = "audio/flac",
        [".ogg"] = "audio/ogg",
        [".opus"] = "audio/ogg",
        [".m4a"] = "audio/mp4",
        [".aac"] = "audio/aac",
        [".wav"] = "audio/wav",
        [".wma"] = "audio/x-ms-wma",
    };

    public static string ForFile(string path) =>
        Map.TryGetValue(Path.GetExtension(path), out var mime) ? mime : "application/octet-stream";
}
