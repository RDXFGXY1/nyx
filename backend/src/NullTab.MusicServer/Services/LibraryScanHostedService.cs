using Microsoft.Extensions.Options;
using NullTab.MusicServer.Configuration;

namespace NullTab.MusicServer.Services;

/// <summary>
/// Runs one scan at startup, then optionally re-scans every
/// MusicOptions.RescanMinutes. Keeps the library fresh when you
/// drop new files into ~/Music without restarting the server.
/// </summary>
public sealed class LibraryScanHostedService : BackgroundService
{
    private readonly IMusicLibrary _library;
    private readonly MusicOptions _opts;
    private readonly ILogger<LibraryScanHostedService> _log;

    public LibraryScanHostedService(
        IMusicLibrary library,
        IOptions<MusicOptions> opts,
        ILogger<LibraryScanHostedService> log)
    {
        _library = library;
        _opts = opts.Value;
        _log = log;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        try
        {
            await _library.ScanAsync(stoppingToken);
        }
        catch (Exception ex)
        {
            _log.LogError(ex, "Initial library scan failed");
        }

        if (_opts.RescanMinutes <= 0)
            return;

        var period = TimeSpan.FromMinutes(_opts.RescanMinutes);
        using var timer = new PeriodicTimer(period);

        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try
            {
                await _library.ScanAsync(stoppingToken);
            }
            catch (OperationCanceledException) { }
            catch (Exception ex)
            {
                _log.LogError(ex, "Periodic rescan failed");
            }
        }
    }
}
