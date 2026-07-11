namespace NullTab.MusicServer.Configuration;

/// <summary>
/// Bound from the "Music" section of appsettings.json (and env vars).
/// Everything the server needs to know about the library lives here.
/// </summary>
public sealed class MusicOptions
{
    public const string SectionName = "Music";

    /// <summary>
    /// Folder to scan. Supports "~" for the user home directory.
    /// Defaults to ~/Music.
    /// </summary>
    public string Library { get; set; } = "~/Music";

    /// <summary>File extensions treated as playable audio.</summary>
    public string[] Extensions { get; set; } =
        { ".mp3", ".flac", ".ogg", ".opus", ".m4a", ".aac", ".wav", ".wma" };

    /// <summary>
    /// Origins allowed to call the API (your extension id / new-tab origin).
    /// "*" allows any — fine for a purely local server.
    /// </summary>
    public string[] AllowedOrigins { get; set; } = { "*" };

    public string TyDlpDefaultPath { get; set; } = "~/Downloads/ty-dlp.exe";

    /// <summary>Re-scan the library automatically every N minutes. 0 = off.</summary>
    public int RescanMinutes { get; set; } = 0;

    /// <summary>
    /// Folder the random-wallpaper feature reads. Supports "~".
    /// Recommended: put all your wallpapers in ~/Pictures/wallpaper.
    /// </summary>
    public string WallpaperFolder { get; set; } = "~/Pictures/wallpaper";

    /// <summary>
    /// Path to the yt-dlp executable used by /api/remote. A bare
    /// "yt-dlp" works when it is on PATH; otherwise set the full path.
    /// </summary>
    public string YtDlpPath { get; set; } = "yt-dlp";
}
