using Microsoft.AspNetCore.Mvc;
using NullTab.MusicServer.Services;

namespace NullTab.MusicServer.Controllers;

[ApiController]
[Route("api/rpc")]
public sealed class RpcController : ControllerBase
{
    private readonly DiscordRpcService _rpc;

    public RpcController(DiscordRpcService rpc)
    {
        _rpc = rpc;
    }

    [HttpPost("activity")]
    public async Task<IActionResult> SetActivity([FromBody] Dictionary<string, object?> activity)
    {
        if (activity is null || activity.Count == 0)
            return BadRequest(new { error = "activity required" });

        var assetKey = activity.GetValueOrDefault("largeImageKey")?.ToString();
        var smallAssetKey = activity.GetValueOrDefault("smallImageKey")?.ToString();

        var buttons = new List<object>();
        if (activity.GetValueOrDefault("buttonUrl")?.ToString() is { } buttonUrl && !string.IsNullOrWhiteSpace(buttonUrl))
        {
            buttons.Add(new { label = activity.GetValueOrDefault("buttonLabel")?.ToString() ?? "Open", url = buttonUrl });
        }

        await _rpc.UpdateAsync(new
        {
            details = activity.GetValueOrDefault("details")?.ToString(),
            state = activity.GetValueOrDefault("state")?.ToString(),
            assets = new
            {
                large_image = !string.IsNullOrWhiteSpace(assetKey) ? assetKey : "browser",
                large_text = activity.GetValueOrDefault("largeImageText")?.ToString() ?? "Browser",
                small_image = !string.IsNullOrWhiteSpace(smallAssetKey) ? smallAssetKey : null,
                small_text = activity.GetValueOrDefault("smallImageText")?.ToString(),
            },
            buttons = buttons.Count > 0 ? buttons : null,
            timestamps = new { start = _rpc.StartUnix }
        });

        return Ok(new { ok = true });
    }
}
