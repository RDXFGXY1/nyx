using System.Diagnostics;
using System.Runtime.InteropServices;
using Microsoft.AspNetCore.Mvc;

namespace NullTab.MusicServer.Controllers;

/// <summary>
/// Little command-center for the machine itself: lock, sleep, mute, and a
/// cancelable shutdown. Triggered from the Nyx's ">" commands.
/// All actions are local-only (the server binds to 127.0.0.1).
/// </summary>
[ApiController]
[Route("api/power")]
public sealed class PowerController : ControllerBase
{
    private const byte VK_VOLUME_MUTE = 0xAD;
    private const byte VK_VOLUME_DOWN = 0xAE;
    private const byte VK_VOLUME_UP = 0xAF;
    private const uint KEYEVENTF_KEYUP = 0x0002;

    [HttpPost("lock")]
    public IActionResult Lock() => Run("rundll32.exe", "user32.dll,LockWorkStation");

    [HttpPost("sleep")]
    public IActionResult Sleep() => Run("rundll32.exe", "powrprof.dll,SetSuspendState 0,1,0");

    /// <summary>POST /api/power/shutdown?min=1 — schedule a shutdown (cancel with /abort).</summary>
    [HttpPost("shutdown")]
    public IActionResult Shutdown([FromQuery] int min = 1)
    {
        var sec = Math.Clamp(min, 0, 1440) * 60;
        return Run("shutdown", $"/s /t {sec}");
    }

    [HttpPost("abort")]
    public IActionResult Abort() => Run("shutdown", "/a");

    /// <summary>POST /api/power/mute — toggle system mute via the media key.</summary>
    [HttpPost("mute")]
    public IActionResult Mute() => Tap(VK_VOLUME_MUTE);

    /// <summary>POST /api/power/vol?dir=up&amp;steps=5 — nudge volume (each step ≈ 2%).</summary>
    [HttpPost("vol")]
    public IActionResult Volume([FromQuery] string dir = "up", [FromQuery] int steps = 5)
    {
        var key = dir == "down" ? VK_VOLUME_DOWN : VK_VOLUME_UP;
        for (var i = 0; i < Math.Clamp(steps, 1, 50); i++) Tap(key);
        return Ok(new { ok = true });
    }

    private IActionResult Run(string file, string args)
    {
        try
        {
            Process.Start(new ProcessStartInfo(file, args) { UseShellExecute = false, CreateNoWindow = true });
            return Ok(new { ok = true });
        }
        catch (Exception ex)
        {
            return StatusCode(500, new { ok = false, error = ex.Message });
        }
    }

    private IActionResult Tap(byte key)
    {
        keybd_event(key, 0, 0, UIntPtr.Zero);
        keybd_event(key, 0, KEYEVENTF_KEYUP, UIntPtr.Zero);
        return Ok(new { ok = true });
    }

    [DllImport("user32.dll")]
    private static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
}
