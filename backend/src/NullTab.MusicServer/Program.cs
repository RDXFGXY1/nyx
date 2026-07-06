using NullTab.MusicServer.Configuration;
using NullTab.MusicServer.Services;

var builder = WebApplication.CreateBuilder(args);

// ---- options ----
builder.Services.Configure<MusicOptions>(
    builder.Configuration.GetSection(MusicOptions.SectionName));

// ---- services ----
builder.Services.AddSingleton<IMusicLibrary, MusicLibrary>();
builder.Services.AddSingleton<SystemStatsService>();
builder.Services.AddSingleton<ScreenTimeService>();
builder.Services.AddSingleton<DiscordRpcService>();
builder.Services.AddSingleton<VaultService>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<ScreenTimeService>());
builder.Services.AddHostedService<LibraryScanHostedService>();
builder.Services.AddControllers();

// proxy client for /api/remote — no timeout (audio streams are long-lived)
builder.Services.AddHttpClient("remote", c =>
{
    c.Timeout = Timeout.InfiniteTimeSpan;
    c.DefaultRequestHeaders.UserAgent.ParseAdd("Mozilla/5.0");
});

// ---- CORS (so the browser extension can call us) ----
var musicOpts = builder.Configuration
    .GetSection(MusicOptions.SectionName)
    .Get<MusicOptions>() ?? new MusicOptions();

const string CorsPolicy = "extension";
builder.Services.AddCors(options =>
{
    options.AddPolicy(CorsPolicy, policy =>
    {
        if (musicOpts.AllowedOrigins.Contains("*"))
            policy.AllowAnyOrigin();
        else
            policy.WithOrigins(musicOpts.AllowedOrigins);

        policy.AllowAnyHeader().AllowAnyMethod();
    });
});

var app = builder.Build();

// LAN firewall: non-loopback clients may ONLY reach /phone/* (the phone
// companion). Everything else — vault, music, system — stays localhost-only,
// even though Kestrel now binds to the LAN so the phone can connect.
app.Use(async (ctx, next) =>
{
    var ip = ctx.Connection.RemoteIpAddress;
    var isLocal = ip != null && System.Net.IPAddress.IsLoopback(ip);
    if (!isLocal && !ctx.Request.Path.StartsWithSegments("/phone"))
    {
        ctx.Response.StatusCode = 403;
        return;
    }
    await next();
});

app.UseCors(CorsPolicy);
app.MapControllers();

// friendly root
app.MapGet("/", () => Results.Json(new
{
    name = "NullTab Music Server",
    endpoints = new[]
    {
        "GET  /api/library",
        "GET  /api/tracks/{id}",
        "GET  /api/stream/{id}",
        "GET  /api/art/{id}",
        "POST /api/rescan",
        "GET  /api/health",
        "GET  /api/remote/search?q={query}",
        "GET  /api/remote/stream/{videoId}",
        "GET  /api/system",
        "GET  /api/screentime",
        "POST /api/power/{lock|sleep|shutdown|abort|mute|vol}",
        "POST /api/rpc/activity",
        "GET  /api/vault/status",
        "POST /api/vault/{setup|unlock|lock}",
        "GET  /api/vault/entries|reveal/{id}|match",
    },
}));

app.Run();
