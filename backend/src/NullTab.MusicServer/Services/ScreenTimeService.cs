using System.Collections.Concurrent;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text.Json;

namespace NullTab.MusicServer.Services;

/// <summary>
/// Screen-time mirror: samples the foreground window every 5 seconds and
/// accumulates seconds per app for the current day. Pauses counting when
/// the user has been idle for 2+ minutes. Persists next to the binary so
/// a restart doesn't wipe the day.
/// </summary>
public sealed class ScreenTimeService : BackgroundService
{
    private readonly ConcurrentDictionary<string, long> _today = new();
    private string _date = DateTime.Now.ToString("yyyy-MM-dd");
    private readonly string _file = Path.Combine(AppContext.BaseDirectory, "screentime.json");
    private readonly ILogger<ScreenTimeService> _log;
    private int _sinceSave;

    public ScreenTimeService(ILogger<ScreenTimeService> log) => _log = log;

    public object Snapshot() => new
    {
        date = _date,
        totalSec = _today.Values.Sum(),
        apps = _today
            .OrderByDescending(kv => kv.Value)
            .Take(8)
            .Select(kv => new { name = kv.Key, sec = kv.Value }),
    };

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        Load();
        while (!ct.IsCancellationRequested)
        {
            try { Sample(); } catch { /* a vanished process is fine */ }
            if (++_sinceSave >= 12) { _sinceSave = 0; Save(); }
            await Task.Delay(5000, ct);
        }
        Save();
    }

    private void Sample()
    {
        var day = DateTime.Now.ToString("yyyy-MM-dd");
        if (day != _date) { _today.Clear(); _date = day; }

        if (IdleSeconds() > 120) return;

        var hwnd = GetForegroundWindow();
        if (hwnd == IntPtr.Zero) return;
        GetWindowThreadProcessId(hwnd, out var pid);
        if (pid == 0) return;

        string name;
        try { name = Process.GetProcessById((int)pid).ProcessName; }
        catch { return; }
        if (string.IsNullOrWhiteSpace(name)) return;

        _today.AddOrUpdate(name.ToLowerInvariant(), 5, (_, v) => v + 5);
    }

    private static double IdleSeconds()
    {
        var lii = new LASTINPUTINFO { cbSize = (uint)Marshal.SizeOf<LASTINPUTINFO>() };
        if (!GetLastInputInfo(ref lii)) return 0;
        return ((uint)Environment.TickCount - lii.dwTime) / 1000.0;
    }

    private void Load()
    {
        try
        {
            if (!File.Exists(_file)) return;
            using var doc = JsonDocument.Parse(File.ReadAllText(_file));
            var root = doc.RootElement;
            if (root.GetProperty("date").GetString() != _date) return; // stale day
            foreach (var p in root.GetProperty("apps").EnumerateObject())
                _today[p.Name] = p.Value.GetInt64();
        }
        catch (Exception ex) { _log.LogWarning(ex, "screentime load failed"); }
    }

    private void Save()
    {
        try
        {
            File.WriteAllText(_file, JsonSerializer.Serialize(new
            {
                date = _date,
                apps = _today.ToDictionary(kv => kv.Key, kv => kv.Value),
            }));
        }
        catch (Exception ex) { _log.LogWarning(ex, "screentime save failed"); }
    }

    [DllImport("user32.dll")]
    private static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);

    [StructLayout(LayoutKind.Sequential)]
    private struct LASTINPUTINFO
    {
        public uint cbSize;
        public uint dwTime;
    }

    [DllImport("user32.dll")]
    private static extern bool GetLastInputInfo(ref LASTINPUTINFO plii);
}
