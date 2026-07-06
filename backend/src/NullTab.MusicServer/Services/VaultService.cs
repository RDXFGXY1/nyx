using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace NullTab.MusicServer.Services;

/// <summary>
/// A small local password vault. Entries are encrypted at rest with
/// AES-256-GCM; the key is derived from a master password via PBKDF2
/// (never stored). The vault stays unlocked in memory only after the
/// master password is supplied, and locks on server restart.
///
/// A provisioning token (held only by the extension) is required on every
/// call so a random web page cannot read the vault through the local port.
/// </summary>
public sealed class VaultService
{
    private const string Verifier = "NULLTAB_VAULT_OK";
    private const int Iterations = 210_000;

    private readonly string _file = Path.Combine(AppContext.BaseDirectory, "vault.dat");
    private readonly object _gate = new();

    private byte[]? _key;                 // present only while unlocked
    private List<Entry> _entries = new();
    private Meta? _meta;
    private DateTime _lastActive = DateTime.UtcNow;
    private readonly Timer _autoLock;

    public int AutoLockMinutes { get; set; } = 10;

    public VaultService()
    {
        _autoLock = new Timer(_ =>
        {
            lock (_gate)
            {
                if (_key != null && AutoLockMinutes > 0 &&
                    (DateTime.UtcNow - _lastActive).TotalMinutes >= AutoLockMinutes)
                    Lock();
            }
        }, null, TimeSpan.FromSeconds(30), TimeSpan.FromSeconds(30));
    }

    public bool IsSetup => File.Exists(_file);
    public bool IsUnlocked { get { lock (_gate) return _key != null; } }

    public sealed class Entry
    {
        public string Id { get; set; } = "";
        public string Kind { get; set; } = "login";   // login | identity | card
        public string Site { get; set; } = "";
        public string Host { get; set; } = "";
        public string Username { get; set; } = "";
        public string Password { get; set; } = "";
        public string Url { get; set; } = "";
        public string Totp { get; set; } = "";   // base32 2FA secret
        public Dictionary<string, string> Fields { get; set; } = new();  // identity/card data
        public long Added { get; set; }
    }

    private sealed class Meta
    {
        public int Version { get; set; } = 1;
        public string Salt { get; set; } = "";
        public int Iterations { get; set; } = VaultService.Iterations;
        public string TokenHash { get; set; } = "";
        public string Verifier { get; set; } = "";
        public string Data { get; set; } = "";
    }

    // ---- lifecycle ----

    public bool Setup(string master, string token)
    {
        lock (_gate)
        {
            if (IsSetup) return false;
            if (string.IsNullOrWhiteSpace(master) || string.IsNullOrWhiteSpace(token)) return false;

            var salt = RandomNumberGenerator.GetBytes(16);
            var key = DeriveKey(master, salt, Iterations);
            _meta = new Meta
            {
                Salt = Convert.ToBase64String(salt),
                Iterations = Iterations,
                TokenHash = Sha256Hex(token),
                Verifier = Encrypt(key, Encoding.UTF8.GetBytes(Verifier)),
            };
            _key = key;
            _entries = new();
            Persist();
            return true;
        }
    }

    public bool Unlock(string master)
    {
        lock (_gate)
        {
            var meta = LoadMeta();
            if (meta == null) return false;
            var key = DeriveKey(master, Convert.FromBase64String(meta.Salt), meta.Iterations);
            var check = TryDecrypt(key, meta.Verifier);
            if (check == null || Encoding.UTF8.GetString(check) != Verifier) return false;

            _key = key;
            _meta = meta;
            _lastActive = DateTime.UtcNow;
            _entries = string.IsNullOrEmpty(meta.Data)
                ? new()
                : JsonSerializer.Deserialize<List<Entry>>(Encoding.UTF8.GetString(TryDecrypt(key, meta.Data)!)) ?? new();
            return true;
        }
    }

    /// <summary>Re-issue the extension token after proving the master password.</summary>
    public bool Reprovision(string master, string token)
    {
        lock (_gate)
        {
            var meta = LoadMeta();
            if (meta == null || string.IsNullOrWhiteSpace(token)) return false;
            var key = DeriveKey(master, Convert.FromBase64String(meta.Salt), meta.Iterations);
            var check = TryDecrypt(key, meta.Verifier);
            if (check == null || Encoding.UTF8.GetString(check) != Verifier) return false;
            meta.TokenHash = Sha256Hex(token);
            File.WriteAllText(_file, JsonSerializer.Serialize(meta));
            if (_key != null) _meta = meta;
            return true;
        }
    }

    public void Lock()
    {
        lock (_gate)
        {
            if (_key != null) Array.Clear(_key);
            _key = null;
            _entries = new();
        }
    }

    /// <summary>Wipe the vault entirely (for a forgotten master password).</summary>
    public bool Reset()
    {
        lock (_gate)
        {
            Lock();
            _meta = null;
            try { if (File.Exists(_file)) File.Delete(_file); return true; }
            catch { return false; }
        }
    }

    public bool CheckToken(string? token)
    {
        var meta = LoadMeta();
        return meta != null && !string.IsNullOrEmpty(token) && Sha256Hex(token) == meta.TokenHash;
    }

    // ---- entries (unlocked only) ----

    public IEnumerable<object> List()
    {
        lock (_gate)
        {
            Ensure();
            return _entries
                .OrderBy(e => e.Site)
                .Select(e => new
                {
                    e.Id,
                    kind = string.IsNullOrEmpty(e.Kind) ? "login" : e.Kind,
                    e.Site, e.Host, e.Username, e.Url, e.Added,
                    hasTotp = !string.IsNullOrEmpty(e.Totp),
                    hasPassword = !string.IsNullOrEmpty(e.Password),
                    fields = SafeFields(e),
                })
                .ToList();
        }
    }

    /// <summary>Non-sensitive summary fields safe to list (never full card number / cvv).</summary>
    private static Dictionary<string, string> SafeFields(Entry e)
    {
        var f = e.Fields ?? new();
        if (e.Kind == "card")
        {
            var num = f.GetValueOrDefault("number", "");
            var digits = new string(num.Where(char.IsDigit).ToArray());
            return new()
            {
                ["brand"] = f.GetValueOrDefault("brand", ""),
                ["last4"] = digits.Length >= 4 ? digits[^4..] : "",
                ["expiry"] = f.GetValueOrDefault("expiry", ""),
                ["cardholder"] = f.GetValueOrDefault("cardholder", ""),
            };
        }
        if (e.Kind == "identity")
        {
            return new()
            {
                ["fullName"] = f.GetValueOrDefault("fullName", ""),
                ["email"] = f.GetValueOrDefault("email", ""),
            };
        }
        return new();
    }

    public string? Reveal(string id)
    {
        lock (_gate) { Ensure(); return _entries.FirstOrDefault(e => e.Id == id)?.Password; }
    }

    /// <summary>Full field set for one entry (card number, identity address, …) — explicit fetch only.</summary>
    public Dictionary<string, string>? Detail(string id)
    {
        lock (_gate) { Ensure(); return _entries.FirstOrDefault(e => e.Id == id)?.Fields; }
    }

    /// <summary>Current 6-digit codes for every 2FA entry (secrets never leave the server).</summary>
    public IEnumerable<object> OtpCodes()
    {
        lock (_gate)
        {
            Ensure();
            return _entries.Where(e => !string.IsNullOrEmpty(e.Totp))
                .Select(e => new { id = e.Id, site = e.Site, code = ComputeTotp(e.Totp) })
                .ToList();
        }
    }

    public string? TotpSecret(string id)
    {
        lock (_gate) { Ensure(); return _entries.FirstOrDefault(e => e.Id == id)?.Totp; }
    }

    public object Health()
    {
        lock (_gate)
        {
            Ensure();
            var reused = _entries.Where(e => !string.IsNullOrEmpty(e.Password))
                .GroupBy(e => e.Password).Where(g => g.Count() > 1)
                .SelectMany(g => g.Select(e => e.Id)).ToHashSet();
            var now = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            const long yearMs = 365L * 24 * 3600 * 1000;

            var items = _entries.Select(e =>
            {
                var issues = new List<string>();
                if (IsWeak(e.Password)) issues.Add("weak");
                if (reused.Contains(e.Id)) issues.Add("reused");
                if (e.Added > 0 && now - e.Added > yearMs) issues.Add("old");
                return new { id = e.Id, issues };
            }).Where(x => x.issues.Count > 0).ToList();

            return new
            {
                items,
                weak = items.Count(i => i.issues.Contains("weak")),
                reused = items.Count(i => i.issues.Contains("reused")),
                old = items.Count(i => i.issues.Contains("old")),
                total = _entries.Count,
            };
        }
    }

    private static bool IsWeak(string p)
    {
        if (string.IsNullOrEmpty(p) || p.Length < 8) return true;
        var classes = 0;
        if (p.Any(char.IsUpper)) classes++;
        if (p.Any(char.IsLower)) classes++;
        if (p.Any(char.IsDigit)) classes++;
        if (p.Any(c => !char.IsLetterOrDigit(c))) classes++;
        return classes < 3;
    }

    public IEnumerable<object> Match(string host)
    {
        lock (_gate)
        {
            Ensure();
            host = (host ?? "").ToLowerInvariant().Replace("www.", "");
            return _entries
                .Where(e => !string.IsNullOrEmpty(e.Host) &&
                            (host == e.Host || host.EndsWith("." + e.Host) || e.Host.EndsWith("." + host)))
                .Select(e => new { e.Id, e.Site, e.Username, e.Password })
                .ToList();
        }
    }

    public Entry Add(Entry e)
    {
        lock (_gate)
        {
            Ensure();
            e.Id = Guid.NewGuid().ToString("N")[..12];
            e.Added = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            e.Host = NormalizeHost(e.Host, e.Url);
            _entries.Add(e);
            Persist();
            return e;
        }
    }

    public int AddMany(IEnumerable<Entry> items)
    {
        lock (_gate)
        {
            Ensure();
            var n = 0;
            foreach (var e in items)
            {
                if (string.IsNullOrWhiteSpace(e.Password)) continue;
                e.Id = Guid.NewGuid().ToString("N")[..12];
                e.Added = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
                e.Host = NormalizeHost(e.Host, e.Url);
                if (string.IsNullOrWhiteSpace(e.Site)) e.Site = e.Host.Length > 0 ? e.Host : "login";
                _entries.Add(e);
                n++;
            }
            if (n > 0) Persist();
            return n;
        }
    }

    public bool Update(string id, Entry patch)
    {
        lock (_gate)
        {
            Ensure();
            var e = _entries.FirstOrDefault(x => x.Id == id);
            if (e == null) return false;
            e.Site = patch.Site; e.Username = patch.Username;
            if (!string.IsNullOrEmpty(patch.Password)) e.Password = patch.Password;
            if (patch.Totp != null) e.Totp = patch.Totp;
            if (patch.Fields != null && patch.Fields.Count > 0) e.Fields = patch.Fields;
            e.Url = patch.Url; e.Host = NormalizeHost(patch.Host, patch.Url);
            Persist();
            return true;
        }
    }

    public bool Delete(string id)
    {
        lock (_gate)
        {
            Ensure();
            var n = _entries.RemoveAll(x => x.Id == id);
            if (n > 0) Persist();
            return n > 0;
        }
    }

    // ---- internals ----

    private void Ensure()
    {
        if (_key == null) throw new InvalidOperationException("vault locked");
        _lastActive = DateTime.UtcNow;
    }

    private void Persist()
    {
        if (_key == null || _meta == null) return;
        _meta.Data = Encrypt(_key, JsonSerializer.SerializeToUtf8Bytes(_entries));
        File.WriteAllText(_file, JsonSerializer.Serialize(_meta));
    }

    private Meta? LoadMeta()
    {
        if (_meta != null && _key != null) return _meta;
        if (!File.Exists(_file)) return null;
        try { return JsonSerializer.Deserialize<Meta>(File.ReadAllText(_file)); }
        catch { return null; }
    }

    private static byte[] DeriveKey(string master, byte[] salt, int iters) =>
        Rfc2898DeriveBytes.Pbkdf2(Encoding.UTF8.GetBytes(master), salt, iters, HashAlgorithmName.SHA256, 32);

    private static string Encrypt(byte[] key, byte[] plain)
    {
        var nonce = RandomNumberGenerator.GetBytes(12);
        var cipher = new byte[plain.Length];
        var tag = new byte[16];
        using var gcm = new AesGcm(key, 16);
        gcm.Encrypt(nonce, plain, cipher, tag);
        var buf = new byte[12 + cipher.Length + 16];
        nonce.CopyTo(buf, 0);
        cipher.CopyTo(buf, 12);
        tag.CopyTo(buf, 12 + cipher.Length);
        return Convert.ToBase64String(buf);
    }

    private static byte[]? TryDecrypt(byte[] key, string blob)
    {
        try
        {
            var buf = Convert.FromBase64String(blob);
            var nonce = buf[..12];
            var tag = buf[^16..];
            var cipher = buf[12..^16];
            var plain = new byte[cipher.Length];
            using var gcm = new AesGcm(key, 16);
            gcm.Decrypt(nonce, cipher, tag, plain);
            return plain;
        }
        catch { return null; }
    }

    private static string Sha256Hex(string s) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(s)));

    // ---- TOTP (RFC 6238) ----
    private static string ComputeTotp(string base32, int period = 30, int digits = 6)
    {
        var key = Base32Decode(base32);
        if (key.Length == 0) return new string('0', digits);
        var counter = DateTimeOffset.UtcNow.ToUnixTimeSeconds() / period;
        var msg = BitConverter.GetBytes(counter);
        if (BitConverter.IsLittleEndian) Array.Reverse(msg);
        using var hmac = new HMACSHA1(key);
        var hash = hmac.ComputeHash(msg);
        var o = hash[^1] & 0xf;
        var code = ((hash[o] & 0x7f) << 24) | ((hash[o + 1] & 0xff) << 16) | ((hash[o + 2] & 0xff) << 8) | (hash[o + 3] & 0xff);
        return (code % (int)Math.Pow(10, digits)).ToString().PadLeft(digits, '0');
    }

    private static byte[] Base32Decode(string s)
    {
        const string A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
        s = new string((s ?? "").ToUpperInvariant().Where(c => A.Contains(c)).ToArray());
        int bits = 0, val = 0;
        var outp = new List<byte>();
        foreach (var c in s)
        {
            val = (val << 5) | A.IndexOf(c);
            bits += 5;
            if (bits >= 8) { outp.Add((byte)((val >> (bits - 8)) & 0xff)); bits -= 8; }
        }
        return outp.ToArray();
    }

    private static string NormalizeHost(string host, string url)
    {
        if (!string.IsNullOrWhiteSpace(host)) return host.ToLowerInvariant().Replace("www.", "");
        if (Uri.TryCreate(url, UriKind.Absolute, out var u)) return u.Host.ToLowerInvariant().Replace("www.", "");
        return "";
    }
}
