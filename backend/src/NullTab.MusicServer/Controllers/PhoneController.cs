using System.Collections.Concurrent;
using System.Net;
using System.Net.Sockets;
using Microsoft.AspNetCore.Mvc;

namespace NullTab.MusicServer.Controllers;

/// <summary>
/// Phone companion. The server binds to the LAN, but a middleware only
/// lets NON-loopback clients reach /phone/* — everything else (vault,
/// music, system) stays localhost-only. LAN calls also need a pairing
/// code that only the localhost new-tab can read.
///
/// Flow: PC shows a QR of  http://&lt;lan-ip&gt;:5055/phone?code=XXXX .
/// The phone opens it, and both sides push links / text to a shared inbox.
/// </summary>
[ApiController]
[Route("phone")]
public sealed class PhoneController : ControllerBase
{
    private static readonly string CodeFile = Path.Combine(AppContext.BaseDirectory, "phone_code.txt");
    private static string _code = LoadOrMakeCode();
    private static readonly ConcurrentQueue<object> ToPc = new();
    private static readonly ConcurrentQueue<object> ToPhone = new();
    private static string _accent = "#ff4d55";
    private static string _ink = "#1a1a1c";

    public sealed record SendDto(string? to, string? kind, string? data, string? code);
    public sealed record ThemeDto(string? accent, string? ink);

    private bool IsLocal => HttpContext.Connection.RemoteIpAddress is { } ip && IPAddress.IsLoopback(ip);
    private bool CodeOk(string? c) => IsLocal || (!string.IsNullOrEmpty(c) && c == _code);

    [HttpGet("")]
    public ContentResult Page() => Content(PageHtml, "text/html; charset=utf-8");

    /// <summary>localhost only — the new tab reads the pairing code + LAN url.</summary>
    [HttpGet("info")]
    public IActionResult Info()
    {
        if (!IsLocal) return StatusCode(403);
        var ip = LanIp();
        return Ok(new { code = _code, ip, url = $"http://{ip}:5055/phone?code={_code}" });
    }

    /// <summary>localhost (new tab) pushes the wallpaper accent; phone reads it.</summary>
    [HttpPost("theme")]
    public IActionResult SetTheme([FromBody] ThemeDto d)
    {
        if (!IsLocal) return StatusCode(403);
        if (!string.IsNullOrWhiteSpace(d.accent)) _accent = d.accent!;
        if (!string.IsNullOrWhiteSpace(d.ink)) _ink = d.ink!;
        return Ok(new { ok = true });
    }

    [HttpGet("theme")]
    public IActionResult GetTheme([FromQuery] string? code)
    {
        if (!CodeOk(code)) return Unauthorized();
        return Ok(new { accent = _accent, ink = _ink });
    }

    /// <summary>Same accent, but for same-PC apps (e.g. the Vinyl HUD) — localhost only, no pairing code.</summary>
    [HttpGet("theme/local")]
    public IActionResult GetThemeLocal()
    {
        if (!IsLocal) return StatusCode(403);
        return Ok(new { accent = _accent, ink = _ink });
    }

    [HttpPost("send")]
    public IActionResult Send([FromBody] SendDto d, [FromHeader(Name = "X-Phone-Code")] string? header)
    {
        if (!CodeOk(header ?? d.code)) return Unauthorized();
        if (string.IsNullOrWhiteSpace(d.data)) return BadRequest();
        var item = new { kind = d.kind ?? "link", data = d.data, at = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds() };
        (d.to == "phone" ? ToPhone : ToPc).Enqueue(item);
        return Ok(new { ok = true });
    }

    [HttpGet("inbox")]
    public IActionResult Inbox([FromQuery] string to, [FromQuery] string? code)
    {
        if (!CodeOk(code)) return Unauthorized();
        var q = to == "phone" ? ToPhone : ToPc;
        var list = new List<object>();
        while (q.TryDequeue(out var i)) list.Add(i);
        return Ok(new { items = list });
    }

    private static string LoadOrMakeCode()
    {
        try { if (System.IO.File.Exists(CodeFile)) return System.IO.File.ReadAllText(CodeFile).Trim(); } catch { }
        var code = Random.Shared.Next(100000, 999999).ToString();
        try { System.IO.File.WriteAllText(CodeFile, code); } catch { }
        return code;
    }

    private static string LanIp()
    {
        try
        {
            using var s = new Socket(AddressFamily.InterNetwork, SocketType.Dgram, ProtocolType.Udp);
            s.Connect("8.8.8.8", 65530);
            return ((IPEndPoint)s.LocalEndPoint!).Address.ToString();
        }
        catch { return "127.0.0.1"; }
    }

    private const string PageHtml = @"<!DOCTYPE html><html><head><meta charset='utf-8'>
<meta name='viewport' content='width=device-width,initial-scale=1,maximum-scale=1'>
<title>NullTab Phone</title><style>
:root{--accent:#ff4d55;--ink:#1a1a1c;--soft:rgba(255,77,85,.16)}
*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
body{background:#101015;color:#f4f4f6;font-family:-apple-system,'Segoe UI',Roboto,sans-serif;padding:20px 18px 40px;max-width:520px;margin:0 auto;min-height:100vh}
.hero{display:flex;align-items:center;gap:10px;margin-bottom:18px}
.dot{width:38px;height:38px;border-radius:12px;background:var(--soft);color:var(--accent);display:grid;place-items:center;font-size:20px}
.hero h1{font-size:17px;font-weight:800}
.hero .sub{font-size:11px;color:rgba(244,244,246,.5)}
.panel{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:18px;padding:16px;margin-bottom:16px}
textarea{width:100%;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.14);border-radius:12px;color:#f4f4f6;font-family:inherit;font-size:15px;padding:12px 14px;outline:none;min-height:76px;resize:vertical}
textarea:focus{border-color:var(--accent)}
.row{display:flex;gap:8px;margin-top:10px}
button{flex:1;border:none;border-radius:12px;background:var(--accent);color:var(--ink);font-family:inherit;font-size:15px;font-weight:800;padding:14px 0;cursor:pointer;transition:transform .1s}
button:active{transform:scale(.97)}
button.ghost{flex:0 0 96px;background:rgba(255,255,255,.08);color:#f4f4f6;font-weight:600}
h2{font-size:11px;text-transform:uppercase;letter-spacing:1.4px;color:rgba(244,244,246,.5);margin:6px 2px 10px}
.item{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:12px 14px;margin-bottom:8px;font-size:14px;word-break:break-all;animation:pop .25s ease}
@keyframes pop{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}
.item a{color:var(--accent);text-decoration:none;font-weight:600}
.item .btn2{display:inline-block;margin-top:8px;font-size:12px;color:var(--accent)}
.empty{font-size:13px;color:rgba(244,244,246,.32);padding:8px 2px}
.toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%) translateY(8px);background:rgba(20,20,26,.97);border:1px solid var(--accent);border-radius:99px;padding:11px 22px;font-size:13px;opacity:0;transition:opacity .2s,transform .2s;pointer-events:none}
.toast.on{opacity:1;transform:translateX(-50%) translateY(0)}
</style></head><body>
<div class='hero'><div class='dot'>&#128241;</div><div><h1>NullTab phone</h1><div class='sub'>linked to your computer</div></div></div>
<div class='panel'>
  <textarea id='box' placeholder='paste a link or type text&hellip;'></textarea>
  <div class='row'><button id='send'>send to PC &rarr;</button><button class='ghost' id='paste'>paste</button></div>
</div>
<h2>from your PC</h2><div id='inbox'><div class='empty'>nothing yet &mdash; send something from your computer</div></div>
<div class='toast' id='t'></div>
<script>
var code=new URLSearchParams(location.search).get('code')||localStorage.getItem('ntCode')||'';
if(code)localStorage.setItem('ntCode',code);
function toast(m){var t=document.getElementById('t');t.textContent=m;t.className='toast on';setTimeout(function(){t.className='toast';},1500);}
// pull the wallpaper accent from the PC
fetch('/phone/theme?code='+encodeURIComponent(code)).then(function(r){return r.ok?r.json():null;}).then(function(t){
  if(!t)return;var r=document.documentElement.style;r.setProperty('--accent',t.accent);r.setProperty('--ink',t.ink);
  var n=parseInt((t.accent||'').replace('#',''),16);if(!isNaN(n))r.setProperty('--soft','rgba('+((n>>16)&255)+','+((n>>8)&255)+','+(n&255)+',.16)');
}).catch(function(){});
document.getElementById('send').onclick=function(){
  var v=document.getElementById('box').value.trim();if(!v)return;
  var kind=/^https?:\/\//i.test(v)?'link':'text';
  fetch('/phone/send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({to:'pc',kind:kind,data:v,code:code})})
   .then(function(r){if(r.ok){document.getElementById('box').value='';toast('sent to PC ✓');}else toast('not paired');}).catch(function(){toast('offline');});
};
document.getElementById('paste').onclick=function(){navigator.clipboard.readText().then(function(t){document.getElementById('box').value=t;}).catch(function(){});};
function poll(){
  fetch('/phone/inbox?to=phone&code='+encodeURIComponent(code)).then(function(r){return r.ok?r.json():{items:[]};}).then(function(d){
    if(d.items&&d.items.length){var box=document.getElementById('inbox');var e=box.querySelector('.empty');if(e)e.remove();
      d.items.forEach(function(i){var el=document.createElement('div');el.className='item';
        if(i.kind==='link'){el.innerHTML=""<a href='""+i.data+""' target='_blank'>""+i.data+""</a>"";}
        else{el.innerHTML=i.data.replace(/</g,'&lt;')+""<div class='btn2' onclick='navigator.clipboard.writeText(this.parentNode.textContent.replace(/copy$/,\""\""));'>copy</div>"";}
        box.insertBefore(el,box.firstChild);});}
  }).catch(function(){});
}
setInterval(poll,3000);poll();
</script></body></html>";
}
