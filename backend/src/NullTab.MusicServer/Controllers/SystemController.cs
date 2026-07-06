using Microsoft.AspNetCore.Mvc;
using NullTab.MusicServer.Services;

namespace NullTab.MusicServer.Controllers;

[ApiController]
[Route("api")]
public sealed class SystemController : ControllerBase
{
    private readonly SystemStatsService _stats;
    private readonly ScreenTimeService _screenTime;

    public SystemController(SystemStatsService stats, ScreenTimeService screenTime)
    {
        _stats = stats;
        _screenTime = screenTime;
    }

    /// <summary>GET /api/system — real machine stats for the dashboard.</summary>
    [HttpGet("system")]
    public IActionResult System() => Ok(_stats.Snapshot());

    /// <summary>GET /api/screentime — today's per-app foreground time.</summary>
    [HttpGet("screentime")]
    public IActionResult ScreenTime() => Ok(_screenTime.Snapshot());
}
