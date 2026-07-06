using Microsoft.AspNetCore.Mvc;
using NullTab.MusicServer.Services;

namespace NullTab.MusicServer.Controllers;

/// <summary>
/// Local password vault API. Everything except /status requires the
/// extension's secret token in the X-Vault-Token header, so a random
/// web page hitting 127.0.0.1 cannot read the vault.
/// </summary>
[ApiController]
[Route("api/vault")]
public sealed class VaultController : ControllerBase
{
    private readonly VaultService _vault;
    public VaultController(VaultService vault) => _vault = vault;

    public sealed record SetupDto(string master, string token);
    public sealed record UnlockDto(string master);
    public sealed record EntryDto(string? site, string? host, string? username, string? password, string? url, string? totp,
        string? kind, Dictionary<string, string>? fields);

    private bool TokenOk(string? token) => _vault.CheckToken(token);

    [HttpGet("status")]
    public IActionResult Status() => Ok(new { setup = _vault.IsSetup, unlocked = _vault.IsUnlocked });

    [HttpPost("setup")]
    public IActionResult Setup([FromBody] SetupDto dto)
    {
        if (_vault.IsSetup) return Conflict(new { error = "already set up" });
        if (string.IsNullOrWhiteSpace(dto.master) || dto.master.Length < 4)
            return BadRequest(new { error = "master password too short" });
        return _vault.Setup(dto.master, dto.token)
            ? Ok(new { ok = true, unlocked = true })
            : StatusCode(500, new { error = "setup failed" });
    }

    [HttpPost("unlock")]
    public IActionResult Unlock([FromBody] UnlockDto dto, [FromHeader(Name = "X-Vault-Token")] string? token)
    {
        if (!TokenOk(token)) return Unauthorized();
        return _vault.Unlock(dto.master)
            ? Ok(new { ok = true })
            : Unauthorized(new { error = "wrong master password" });
    }

    [HttpPost("reprovision")]
    public IActionResult Reprovision([FromBody] SetupDto dto)
    {
        return _vault.Reprovision(dto.master, dto.token)
            ? Ok(new { ok = true })
            : Unauthorized(new { error = "wrong master password" });
    }

    [HttpPost("lock")]
    public IActionResult Lock([FromHeader(Name = "X-Vault-Token")] string? token)
    {
        if (!TokenOk(token)) return Unauthorized();
        _vault.Lock();
        return Ok(new { ok = true });
    }

    /// <summary>Wipe the whole vault — forgotten master password escape hatch.</summary>
    [HttpPost("reset")]
    public IActionResult Reset([FromHeader(Name = "X-Vault-Token")] string? token)
    {
        if (!TokenOk(token)) return Unauthorized();
        return _vault.Reset() ? Ok(new { ok = true }) : StatusCode(500, new { error = "reset failed" });
    }

    [HttpGet("entries")]
    public IActionResult Entries([FromHeader(Name = "X-Vault-Token")] string? token)
    {
        if (!TokenOk(token)) return Unauthorized();
        if (!_vault.IsUnlocked) return StatusCode(423, new { error = "locked" });
        return Ok(new { entries = _vault.List() });
    }

    [HttpGet("reveal/{id}")]
    public IActionResult Reveal(string id, [FromHeader(Name = "X-Vault-Token")] string? token)
    {
        if (!TokenOk(token)) return Unauthorized();
        if (!_vault.IsUnlocked) return StatusCode(423, new { error = "locked" });
        var pw = _vault.Reveal(id);
        return pw == null ? NotFound() : Ok(new { password = pw });
    }

    [HttpGet("totp/{id}")]
    public IActionResult Totp(string id, [FromHeader(Name = "X-Vault-Token")] string? token)
    {
        if (!TokenOk(token)) return Unauthorized();
        if (!_vault.IsUnlocked) return StatusCode(423, new { error = "locked" });
        var s = _vault.TotpSecret(id);
        return string.IsNullOrEmpty(s) ? NotFound() : Ok(new { secret = s });
    }

    [HttpGet("detail/{id}")]
    public IActionResult Detail(string id, [FromHeader(Name = "X-Vault-Token")] string? token)
    {
        if (!TokenOk(token)) return Unauthorized();
        if (!_vault.IsUnlocked) return StatusCode(423, new { error = "locked" });
        var f = _vault.Detail(id);
        return f == null ? NotFound() : Ok(new { fields = f });
    }

    /// <summary>Live 6-digit codes for every 2FA entry (used by in-page autofill).</summary>
    [HttpGet("otpcodes")]
    public IActionResult OtpCodes([FromHeader(Name = "X-Vault-Token")] string? token)
    {
        if (!TokenOk(token)) return Unauthorized();
        if (!_vault.IsUnlocked) return Ok(new { codes = Array.Empty<object>(), locked = _vault.IsSetup });
        return Ok(new { codes = _vault.OtpCodes(), locked = false });
    }

    [HttpGet("health")]
    public IActionResult Health([FromHeader(Name = "X-Vault-Token")] string? token)
    {
        if (!TokenOk(token)) return Unauthorized();
        if (!_vault.IsUnlocked) return StatusCode(423, new { error = "locked" });
        return Ok(_vault.Health());
    }

    [HttpGet("match")]
    public IActionResult Match([FromQuery] string host, [FromHeader(Name = "X-Vault-Token")] string? token)
    {
        if (!TokenOk(token)) return Unauthorized();
        if (!_vault.IsUnlocked) return Ok(new { matches = Array.Empty<object>(), locked = _vault.IsSetup });
        return Ok(new { matches = _vault.Match(host), locked = false });
    }

    [HttpPost("entries")]
    public IActionResult Add([FromBody] EntryDto d, [FromHeader(Name = "X-Vault-Token")] string? token)
    {
        if (!TokenOk(token)) return Unauthorized();
        if (!_vault.IsUnlocked) return StatusCode(423, new { error = "locked" });
        var kind = string.IsNullOrEmpty(d.kind) ? "login" : d.kind;
        if (kind == "login" && string.IsNullOrWhiteSpace(d.password) && string.IsNullOrWhiteSpace(d.totp))
            return BadRequest(new { error = "need a password or a 2FA secret" });
        var e = _vault.Add(new VaultService.Entry
        {
            Kind = kind,
            Site = d.site ?? d.host ?? "site",
            Host = d.host ?? "",
            Username = d.username ?? "",
            Password = d.password ?? "",
            Url = d.url ?? "",
            Totp = (d.totp ?? "").Replace(" ", ""),
            Fields = d.fields ?? new(),
        });
        return Ok(new { ok = true, id = e.Id });
    }

    [HttpPost("import")]
    public IActionResult Import([FromBody] List<EntryDto> items, [FromHeader(Name = "X-Vault-Token")] string? token)
    {
        if (!TokenOk(token)) return Unauthorized();
        if (!_vault.IsUnlocked) return StatusCode(423, new { error = "locked" });
        if (items == null || items.Count == 0) return BadRequest(new { error = "no rows" });
        var n = _vault.AddMany(items.Select(d => new VaultService.Entry
        {
            Site = d.site ?? "", Host = d.host ?? "", Username = d.username ?? "",
            Password = d.password ?? "", Url = d.url ?? "",
        }));
        return Ok(new { ok = true, count = n });
    }

    [HttpPut("entries/{id}")]
    public IActionResult Update(string id, [FromBody] EntryDto d, [FromHeader(Name = "X-Vault-Token")] string? token)
    {
        if (!TokenOk(token)) return Unauthorized();
        if (!_vault.IsUnlocked) return StatusCode(423, new { error = "locked" });
        var ok = _vault.Update(id, new VaultService.Entry
        {
            Site = d.site ?? "", Host = d.host ?? "", Username = d.username ?? "",
            Password = d.password ?? "", Url = d.url ?? "",
            Totp = d.totp?.Replace(" ", ""),
            Fields = d.fields ?? new(),
        });
        return ok ? Ok(new { ok = true }) : NotFound();
    }

    [HttpDelete("entries/{id}")]
    public IActionResult Delete(string id, [FromHeader(Name = "X-Vault-Token")] string? token)
    {
        if (!TokenOk(token)) return Unauthorized();
        if (!_vault.IsUnlocked) return StatusCode(423, new { error = "locked" });
        return _vault.Delete(id) ? Ok(new { ok = true }) : NotFound();
    }
}
