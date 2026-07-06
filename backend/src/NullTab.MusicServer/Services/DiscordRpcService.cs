using System.Text.Json;
using DiscordRPC;
using Microsoft.Extensions.Configuration;

namespace NullTab.MusicServer.Services;

/// <summary>
/// Talks to the Discord desktop client over the official RPC client library
/// and sets Rich Presence. The start timestamp is fixed for the life of the
/// server process, so status updates never reset the elapsed timer.
///
/// Setup (one time): create an app at https://discord.com/developers,
/// put its Application ID in appsettings ("Rpc:ClientId"), and upload
/// Rich-Presence art named: youtube, github, browser, play, code.
/// </summary>
public sealed class DiscordRpcService : IDisposable
{
    private readonly string _clientId;
    private readonly ILogger<DiscordRpcService> _log;
    private readonly SemaphoreSlim _lock = new(1, 1);
    private DiscordRpcClient? _client;

    public long StartUnix { get; } = DateTimeOffset.UtcNow.ToUnixTimeSeconds();

    public DiscordRpcService(IConfiguration cfg, ILogger<DiscordRpcService> log)
    {
        _clientId = cfg["Rpc:ClientId"] ?? "";
        _log = log;
        if (Enabled) InitializeClient();
    }

    public bool Enabled => !string.IsNullOrWhiteSpace(_clientId);

    public async Task UpdateAsync(object activity)
    {
        if (!Enabled) return;

        await _lock.WaitAsync();
        try
        {
            if (_client is null) InitializeClient();
            if (_client is null) return;

            _client.SetPresence(BuildPresence(activity));
        }
        catch (Exception ex)
        {
            _log.LogWarning(ex, "Discord RPC update failed (is Discord running?)");
        }
        finally { _lock.Release(); }
    }

    private void InitializeClient()
    {
        if (!Enabled || _client is not null) return;

        _client = new DiscordRpcClient(_clientId);
        _client.OnReady += (_, _) => _log.LogInformation("Discord RPC client ready");
        _client.OnError += (_, args) => _log.LogWarning("Discord RPC error: {Message}", args.Message);
        _client.Initialize();
        _log.LogInformation("Discord RPC client initialized");
    }

    private RichPresence BuildPresence(object activity)
    {
        var json = JsonSerializer.Serialize(activity,
            new JsonSerializerOptions { DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull });
        var payload = JsonSerializer.Deserialize<Dictionary<string, JsonElement>>(json) ?? new();

        var assets = new Assets
        {
            LargeImageKey = GetString(payload, "assets", "large_image", "browser"),
            LargeImageText = GetString(payload, "assets", "large_text", "Browser"),
            SmallImageKey = GetString(payload, "assets", "small_image"),
            SmallImageText = GetString(payload, "assets", "small_text")
        };

        var buttons = new List<Button>();
        if (payload.TryGetValue("buttons", out var buttonsElement) && buttonsElement.ValueKind == JsonValueKind.Array)
        {
            foreach (var buttonElement in buttonsElement.EnumerateArray())
            {
                if (buttonElement.ValueKind != JsonValueKind.Object) continue;
                var label = buttonElement.TryGetProperty("label", out var labelElement) ? labelElement.GetString() : null;
                var url = buttonElement.TryGetProperty("url", out var urlElement) ? urlElement.GetString() : null;
                if (!string.IsNullOrWhiteSpace(label) && !string.IsNullOrWhiteSpace(url))
                    buttons.Add(new Button { Label = label, Url = url });
            }
        }

        return new RichPresence
        {
            Details = GetString(payload, "details"),
            State = GetString(payload, "state"),
            Assets = assets,
            Buttons = buttons.Count > 0 ? buttons.ToArray() : Array.Empty<Button>(),
            Timestamps = new Timestamps(DateTimeOffset.FromUnixTimeSeconds(StartUnix).UtcDateTime)
        };
    }

    private static string? GetString(Dictionary<string, JsonElement> payload, string key)
    {
        if (!payload.TryGetValue(key, out var element)) return null;
        return element.ValueKind == JsonValueKind.String ? element.GetString() : null;
    }

    private static string? GetString(Dictionary<string, JsonElement> payload, string parentKey, string childKey, string? fallback = null)
    {
        if (!payload.TryGetValue(parentKey, out var parent) || parent.ValueKind != JsonValueKind.Object)
            return fallback;
        if (!parent.TryGetProperty(childKey, out var child))
            return fallback;
        return child.ValueKind == JsonValueKind.String ? child.GetString() : fallback;
    }

    public void Dispose()
    {
        _client?.Dispose();
        _lock.Dispose();
    }
}
