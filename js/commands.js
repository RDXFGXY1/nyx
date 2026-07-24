/* =========================================================
   commands.js — ">" command mode in search bar + Alt+D dock
   =========================================================
   Type ">" in the search bar to open command mode.
   Alt+D (or Alt+K if the browser steals Alt+D) toggles dock.
   ========================================================= */

const CMD_ICONS = {
  ">wall": "▣", ">wall reset": "↺", ">accent auto": "◑", ">accent": "#",
  ">name": "@", ">city": "⌖", ">tab": "▤", ">tabs reset": "↺", ">dock": "▭", ">reset": "⌫",
  ">help": "?", ">dim": "◐", ">blur": "≋", ">avatar": "◉",
  ">play": "▶", ">stop": "◼", ">edit": "✎", ">links reset": "↺",
  ">note": "✎", ">todo": "☑", ">pet": "ᨐ", ">pulse": "◉", ">queue": "≣",
  ">stash": "▤", ">save": "✚", ">translate": "文", ">tr": "文", ">vault": "🔑", ">autodj": "♫", ">mode": "◈", ">phone": "▢",
  ">lock": "▢", ">sleep": "☾", ">shutdown": "⏻", ">abort": "✕", ">mute": "♪",
  ">typing": "⌨", ">grammar": "✓", ">ai": "✦", ">rewrite": "✦", ">reply": "↩", ">dict": "＋",
};

const COMMANDS = [
  { cmd: ">wall",        hint: "pick wallpaper — image or video",            run: () => THEME.pickWallpaper() },
  { cmd: ">wall reset",  hint: "back to default wallpaper",       run: () => THEME.resetWallpaper() },
  { cmd: ">accent auto", hint: "colors from wallpaper",           run: () => { localStorage.removeItem("accent"); THEME.autoAccent(); toast("accent from wallpaper"); } },
  { cmd: ">accent",      hint: ">accent #ff4d55 — set color",     arg: true,
    run: (a) => { if (THEME.applyAccentHex(a)) toast("accent set " + a); } },
  { cmd: ">name",        hint: ">name Kyros — greeting name",     arg: true,
    run: (a) => { localStorage.setItem("name", a); SETTINGS.name = a; setGreeting(); toast("hello " + a); } },
  { cmd: ">city",        hint: ">city Rabat — weather city",      arg: true,
    run: (a) => { localStorage.setItem("city", a); SETTINGS.city = a; loadWeather(); toast("city set " + a); } },
  { cmd: ">tab",         hint: ">tab projects — switch tab",      arg: true,
    run: (a) => { const q = a.toLowerCase();
      const t = getTabs().find((x) => x.name.toLowerCase() === q || x.view === q)
             || getTabs().find((x) => x.name.toLowerCase().includes(q));
      if (t) switchView(t.view); else toast("no tab: " + a); } },
  { cmd: ">tabs reset",  hint: "restore the default tabs",        run: () => {
      localStorage.removeItem("userTabs"); LIVE_TABS = null;
      CURRENT_VIEW = getTabs()[0].view; renderTabs(); renderGroups();
      toast("tabs reset"); } },
  { cmd: ">dock",        hint: "toggle bottom dock",              run: () => toggleDock() },
  { cmd: ">visited",     hint: "show / hide the most-visited row", run: () => toggleTopVisible() },
  { cmd: ">settings",    hint: "open settings (theme, extras, profile)", run: () => openSettings(true) },
  { cmd: ">reset",       hint: "clear all saved settings",        run: () => { localStorage.clear(); location.reload(); } },
  { cmd: ">dim",         hint: ">dim 0.6 — background dim (0.2-1)", arg: true,
    run: (a) => { const v = Math.min(1, Math.max(0.2, parseFloat(a))); if (isNaN(v)) return toast("use 0.2 - 1");
      document.documentElement.style.setProperty("--dim", v); localStorage.setItem("dim", v); toast("dim " + v); } },
  { cmd: ">blur",        hint: ">blur 12 — glass blur px (0-30)",   arg: true,
    run: (a) => { const v = Math.min(30, Math.max(0, parseInt(a))); if (isNaN(v)) return toast("use 0 - 30");
      document.documentElement.style.setProperty("--blur", v + "px"); localStorage.setItem("blur", v); toast("blur " + v + "px"); } },
  { cmd: ">avatar",      hint: "change profile picture",           run: () => document.getElementById("avatar").click() },
  { cmd: ">links reset", hint: "restore the default link groups",  run: () => {
      localStorage.removeItem("userGroups");
      LIVE_GROUPS = null; renderGroups();
      toast("default links restored"); } },
  { cmd: ">play",        hint: ">play <song> — stream from the internet", arg: true,
    run: (a) => playOnlineFirst(a) },
  { cmd: ">stop",        hint: "stop playback",                    run: () => {
      PLAYER.audio.pause(); PLAYER.audio.src = "";
      PLAYER.stream = null; PLAYER.idx = -1;
      renderSongs(); updateNowPlaying();
      toast("stopped"); } },
  { cmd: ">note",        hint: ">note buy milk — quick note (Alt+N)", arg: true,
    run: (a) => addNoteLine(a) },
  { cmd: ">todo",        hint: ">todo fix bug — add a task (Alt+T)",  arg: true,
    run: (a) => { addTodo(a); toast("task added"); } },
  { cmd: ">pet",         hint: "toggle the pet",                  run: () => togglePet() },
  { cmd: ">stash",       hint: "open your saved things (Alt+S)",   run: () => openStash(true) },
  { cmd: ">vault",       hint: "password vault (Alt+P)",          run: () => openVault(true) },
  { cmd: ">save",        hint: ">save Dune 2 — quick-save to stash", arg: true,
    run: (a) => quickSaveStash(a) },
  { cmd: ">translate",   hint: "open the translator (Alt+G)", arg: true,
    run: (a) => openTranslate(true, a) },
  { cmd: ">tr",          hint: ">tr guten tag — quick translate (result copied)", arg: true,
    run: (a) => runTranslate(a) },
  { cmd: ">pulse",       hint: "wallpaper pulses with the music",  run: () => togglePulse() },
  { cmd: ">autodj",      hint: "music follows what you do (code=play, video=pause)", run: () => toggleAutoDj() },
  { cmd: ">mode",        hint: ">mode work · save work · del work — life-modes", arg: true, run: (a) => runModeCommand(a) },
  { cmd: ">phone",       hint: "phone companion — QR + pair code",  run: () => openPhone() },
  { cmd: ">lock",        hint: "lock the PC",                     run: () => pcCmd("lock", null, "locking…") },
  { cmd: ">sleep",       hint: "put the PC to sleep",             run: () => pcCmd("sleep", null, "sleeping…") },
  { cmd: ">shutdown",    hint: ">shutdown 5 — shut down in N min (>abort cancels)", arg: true,
    run: (a) => { const m = a ? parseInt(a) : 1; if (isNaN(m)) return toast("use a number of minutes");
      pcCmd("shutdown", { min: m }, `shutdown in ${m} min — >abort to cancel`); } },
  { cmd: ">abort",       hint: "cancel a scheduled shutdown",     run: () => pcCmd("abort", null, "shutdown cancelled") },
  { cmd: ">mute",        hint: "toggle system mute",              run: () => pcCmd("mute", null, "mute toggled") },
  { cmd: ">queue",       hint: ">queue lofi — search & queue a song", arg: true,
    run: (a) => queueOnlineFirst(a) },
  { cmd: ">typing",      hint: "autocomplete & spell-fix — on·off · local fr · online · dl · stats · status",
    run: (a) => runTypingCommand(a) },
  { cmd: ">grammar",     hint: "grammar fixes while you type — on·off · auto · lang fr · status",
    run: (a) => runGrammarCommand(a) },
  { cmd: ">ai",          hint: "AI rewrite setup — groq·gemini·claude·ollama… · key <k> · model <m> · test",
    run: (a) => runAiCommand(a) },
  { cmd: ">rewrite",     hint: ">rewrite [formal·casual·shorter] my text — AI rewrite (copied)", arg: true,
    run: (a) => runRewrite(a) },
  { cmd: ">reply",       hint: ">reply <their message> — AI drafts your reply (copied)", arg: true,
    run: (a) => runReply(a) },
  { cmd: ">dict",        hint: "personal dictionary — add <word> · del <word> · list",
    run: (a) => runDictCommand(a) },
  { cmd: ">help",        hint: "show all commands",               run: () => openPalette(">") },
];

// ---------- typing assistant ----------
function runTypingCommand(arg) {
  const parts = (arg || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  const sub = parts[0] || "";

  chrome.storage?.local?.get("typingCfg", (r) => {
    const cfg = { on: false, mode: "local", lang: (navigator.language || "en").slice(0, 2), ...(r.typingCfg || {}) };
    const save = (msg) => chrome.storage.local.set({ typingCfg: cfg }, () => toast(msg));

    const download = (done) => {
      toast(`downloading "${cfg.lang}" dictionary…`);
      chrome.runtime.sendMessage({ type: "typing-download", lang: cfg.lang }, (resp) => {
        if (chrome.runtime.lastError || !resp || !resp.ok)
          return toast(`dictionary failed — ${(resp && resp.error) || "check the language code"}`);
        toast(`"${cfg.lang}" dictionary ready — ${resp.count.toLocaleString()} words`);
        if (done) done();
      });
    };

    if (!sub) { cfg.on = !cfg.on; return save("typing assistant " + (cfg.on ? "on" : "off")); }
    if (sub === "on")  { cfg.on = true;  return save("typing assistant on"); }
    if (sub === "off") { cfg.on = false; return save("typing assistant off"); }

    if (sub === "online") { cfg.mode = "online"; cfg.on = true; return save("typing: online mode (english)"); }

    if (sub === "local") {
      cfg.mode = "local"; cfg.on = true;
      if (parts[1]) cfg.lang = parts[1];
      chrome.storage.local.set({ typingCfg: cfg });
      return chrome.runtime.sendMessage({ type: "typing-status", lang: cfg.lang }, (resp) => {
        if (resp && resp.hasDict) toast(`typing: local "${cfg.lang}" — ${resp.words.toLocaleString()} words`);
        else download();
      });
    }

    if (sub === "lang") {
      if (!parts[1]) return toast("use: >typing lang fr");
      cfg.lang = parts[1];
      chrome.storage.local.set({ typingCfg: cfg });
      return download();
    }

    if (sub === "dl" || sub === "download") return download();

    if (sub === "stats") return showTypingStats();

    if (sub === "status") {
      return chrome.runtime.sendMessage({ type: "typing-status", lang: cfg.lang }, (resp) => {
        const dict = resp && resp.hasDict ? `${resp.words.toLocaleString()} words` : "no dictionary";
        toast(`typing ${cfg.on ? "on" : "off"} · ${cfg.mode} · ${cfg.lang} · ${dict}`);
      });
    }

    toast("use: >typing on·off · local [lang] · online · lang fr · dl · stats · status");
  });
}

// ---------- typing stats panel ----------
function showTypingStats() {
  chrome.runtime.sendMessage({ type: "stats-get" }, (resp) => {
    if (chrome.runtime.lastError || !resp || !resp.ok) return toast("stats unavailable — reload the extension");
    const days = resp.days || {};
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

    const todayKey = new Date().toLocaleDateString("en-CA");
    const t = days[todayKey] || { words: 0, sug: 0, fixes: 0, ai: 0, top: {} };
    const week = { words: 0, sug: 0, fixes: 0, ai: 0, top: {} };
    for (const k of Object.keys(days).sort().slice(-7)) {
      const d = days[k];
      week.words += d.words || 0; week.sug += d.sug || 0; week.fixes += d.fixes || 0; week.ai += d.ai || 0;
      for (const [w, n] of Object.entries(d.top || {})) week.top[w] = (week.top[w] || 0) + n;
    }
    const top = Object.entries(week.top).sort((a, b) => b[1] - a[1]).slice(0, 8);

    const old = document.getElementById("typingStatsPop");
    if (old) old.remove();
    const wrap = document.createElement("div");
    wrap.id = "typingStatsPop";
    wrap.style.cssText = "position:fixed; inset:0; z-index:900; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.35); backdrop-filter:blur(3px);";

    const cell = (label, a, b) => `
      <div style="flex:1; text-align:center; padding:10px 6px;">
        <div style="font-size:22px; font-weight:700; color:var(--accent,#8ab4ff);">${a}</div>
        <div style="font-size:11px; opacity:0.55;">${label}</div>
        <div style="font-size:11px; opacity:0.75; margin-top:3px;">${b} this week</div>
      </div>`;

    wrap.innerHTML = `
      <div style="width:min(420px,92vw); background:var(--panel,rgba(20,22,30,0.92)); color:var(--ink,#e8eaef);
                  border:1px solid rgba(255,255,255,0.12); border-radius:16px; padding:18px 18px 14px;
                  box-shadow:0 18px 50px rgba(0,0,0,0.5); font:14px system-ui;">
        <div style="display:flex; align-items:center; margin-bottom:6px;">
          <span style="font-weight:700; letter-spacing:0.4px;">⌨ typing stats</span>
          <span id="tsClose" style="margin-left:auto; cursor:pointer; opacity:0.6; padding:2px 8px;">✕</span>
        </div>
        <div style="display:flex; gap:4px;">
          ${cell("words today", t.words, week.words)}
          ${cell("completions", t.sug, week.sug)}
          ${cell("grammar fixes", t.fixes, week.fixes)}
          ${cell("AI rewrites", t.ai, week.ai)}
        </div>
        ${top.length ? `
        <div style="margin-top:10px; padding-top:10px; border-top:1px solid rgba(255,255,255,0.08);">
          <div style="font-size:11px; opacity:0.55; margin-bottom:6px;">most fixed this week</div>
          <div style="display:flex; flex-wrap:wrap; gap:6px;">
            ${top.map(([w, n]) => `<span style="background:rgba(255,255,255,0.07); border-radius:99px; padding:3px 10px; font-size:12px;">${esc(w)} <span style="opacity:0.55;">×${n}</span></span>`).join("")}
          </div>
        </div>` : `<div style="margin-top:8px; font-size:12px; opacity:0.5;">no fixed mistakes recorded yet — keep typing ✍</div>`}
      </div>`;

    wrap.addEventListener("mousedown", (e) => { if (e.target === wrap) wrap.remove(); });
    wrap.querySelector("#tsClose").addEventListener("click", () => wrap.remove());
    document.body.appendChild(wrap);
  });
}

// ---------- grammar + AI rewrite ----------
function runGrammarCommand(arg) {
  const parts = (arg || "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  const sub = parts[0] || "";

  chrome.storage?.local?.get("grammarCfg", (r) => {
    const cfg = { on: false, auto: false, lang: "auto", ...(r.grammarCfg || {}) };
    const save = (msg) => chrome.storage.local.set({ grammarCfg: cfg }, () => toast(msg));

    if (!sub) { cfg.on = !cfg.on; return save("grammar fixes " + (cfg.on ? "on" : "off")); }
    if (sub === "on")  { cfg.on = true;  return save("grammar fixes on"); }
    if (sub === "off") { cfg.on = false; return save("grammar fixes off"); }
    if (sub === "auto") {
      cfg.auto = !cfg.auto; cfg.on = cfg.on || cfg.auto;
      return save(cfg.auto ? "auto-write on — fixes apply themselves" : "auto-write off — fixes show in a popup");
    }
    if (sub === "lang") {
      cfg.lang = parts[1] || "auto";
      return save(`grammar language: ${cfg.lang}`);
    }
    if (sub === "status")
      return toast(`grammar ${cfg.on ? "on" : "off"} · auto-write ${cfg.auto ? "on" : "off"} · lang ${cfg.lang}`);

    toast("use: >grammar on·off · auto · lang fr · status");
  });
}

function runAiCommand(arg) {
  const raw = (arg || "").trim();
  const parts = raw.split(/\s+/).filter(Boolean);
  const sub = (parts[0] || "").toLowerCase();

  chrome.runtime.sendMessage({ type: "ai-status" }, (st) => {
    if (chrome.runtime.lastError || !st) return toast("engine unavailable — reload the extension");
    chrome.storage.local.get("aiCfg", (r) => {
      const cfg = { provider: "groq", key: "", model: "", ...(r.aiCfg || {}) };
      const save = (msg) => chrome.storage.local.set({ aiCfg: cfg }, () => toast(msg));

      if (!sub || sub === "status")
        return toast(`AI: ${st.provider} · ${st.model} · key ${st.hasKey ? "set" : "missing"} — providers: ${st.providers.join(", ")}`);

      if (st.providers.includes(sub)) {
        cfg.provider = sub; cfg.model = "";
        return save(`AI provider: ${sub}` + (sub === "ollama" ? " (local, no key needed)" : " — now set the key: >ai key <your-key>"));
      }
      if (sub === "button") {
        return chrome.storage.local.get("grammarCfg", (g) => {
          const gc = { on: false, auto: false, lang: "auto", btn: true, ...(g.grammarCfg || {}) };
          gc.btn = !gc.btn;
          chrome.storage.local.set({ grammarCfg: gc }, () =>
            toast(gc.btn ? "✦ button on — shows on any text box" : "✦ button off"));
        });
      }
      if (sub === "key")   { cfg.key = parts[1] || ""; return save(cfg.key ? "API key saved" : "API key cleared"); }
      if (sub === "model") { cfg.model = parts[1] || ""; return save(cfg.model ? "model: " + cfg.model : "model reset to default"); }
      if (sub === "test") {
        toast("testing " + cfg.provider + "…");
        return chrome.runtime.sendMessage({ type: "ai-rewrite", text: "helo wrold, i em fine thanks yu", mode: "fix" }, (resp) => {
          if (resp && resp.ok) toast(`✓ ${cfg.provider} works — "${resp.text.slice(0, 60)}"`);
          else toast("✕ " + ((resp && resp.error) || "no reply"));
        });
      }
      toast(`use: >ai <provider> · key <k> · model <m> · test — providers: ${st.providers.join(", ")}`);
    });
  });
}

function runRewrite(text) {
  text = (text || "").trim();
  if (!text) return toast("rewrite what?");
  // optional leading tone: >rewrite formal dear sir pls give me job
  const TONES = { fix: "fix", polish: "improve", improve: "improve", formal: "formal", casual: "casual", shorter: "shorter", short: "shorter" };
  let mode = "fix";
  const first = text.split(/\s+/)[0].toLowerCase();
  if (TONES[first] && text.includes(" ")) { mode = TONES[first]; text = text.slice(first.length).trim(); }
  toast("rewriting…");
  chrome.runtime.sendMessage({ type: "ai-rewrite", text, mode }, (resp) => {
    if (chrome.runtime.lastError || !resp || !resp.ok)
      return toast("✕ " + ((resp && resp.error) || "rewrite failed"));
    try { navigator.clipboard.writeText(resp.text); } catch {}
    const t = resp.text.length > 140 ? resp.text.slice(0, 137) + "…" : resp.text;
    toast(t + "  · copied");
  });
}

function runReply(text) {
  text = (text || "").trim();
  if (!text) return toast("paste the message to reply to");
  toast("drafting a reply…");
  chrome.runtime.sendMessage({ type: "ai-reply", text }, (resp) => {
    if (chrome.runtime.lastError || !resp || !resp.ok)
      return toast("✕ " + ((resp && resp.error) || "reply failed"));
    try { navigator.clipboard.writeText(resp.text); } catch {}
    const t = resp.text.length > 140 ? resp.text.slice(0, 137) + "…" : resp.text;
    toast(t + "  · copied");
  });
}

// ---------- personal dictionary ----------
function runDictCommand(arg) {
  const parts = (arg || "").trim().split(/\s+/).filter(Boolean);
  const sub = (parts[0] || "").toLowerCase();
  const word = (parts[1] || "").toLowerCase();

  chrome.storage?.local?.get("personalDict", (r) => {
    let list = Array.isArray(r.personalDict) ? r.personalDict : [];

    if (sub === "add" && word) {
      if (list.includes(word)) return toast(`"${word}" is already in your dictionary`);
      list.push(word);
      return chrome.storage.local.set({ personalDict: list }, () => toast(`"${word}" added — it won't be flagged anymore`));
    }
    if (sub === "del" && word) {
      if (!list.includes(word)) return toast(`"${word}" isn't in your dictionary`);
      list = list.filter((w) => w !== word);
      return chrome.storage.local.set({ personalDict: list }, () => toast(`"${word}" removed`));
    }
    if (sub === "clear") {
      return chrome.storage.local.set({ personalDict: [] }, () => toast("personal dictionary cleared"));
    }
    if (!sub || sub === "list") {
      if (!list.length) return toast("dictionary is empty — >dict add <word>, or ＋ in the grammar popup");
      const shown = list.slice(0, 12).join(", ");
      return toast(`${list.length} word${list.length > 1 ? "s" : ""}: ${shown}${list.length > 12 ? "…" : ""}`);
    }
    toast("use: >dict add <word> · del <word> · list · clear");
  });
}

// ---------- pc control: talk to the backend ----------
function runTranslate(text) {
  text = (text || "").trim();
  if (!text) return toast("translate what?");
  chrome.storage?.local?.get(["translateTo"], (r) => {
    const to = (r && r.translateTo) || "en";
    try {
      chrome.runtime.sendMessage({ type: "translate", text, to }, (resp) => {
        if (chrome.runtime.lastError || !resp || !resp.ok) return toast("translation failed");
        try { navigator.clipboard.writeText(resp.text); } catch {}
        const t = resp.text.length > 140 ? resp.text.slice(0, 137) + "…" : resp.text;
        toast(t + "  · copied");
      });
    } catch { toast("translation unavailable"); }
  });
}

function pcCmd(action, params, okMsg) {
  if (typeof MusicSource === "undefined" || !MusicSource.api || !MusicSource.online)
    return toast("music server offline — start backend/run.bat");
  MusicSource.api.power(action, params)
    .then(() => toast(okMsg))
    .catch(() => toast("could not " + action));
}

// ---------- palette UI ----------
const paletteEl = () => document.getElementById("palette");
let selIndex = 0;

function matchCommands(value) {
  const v = value.toLowerCase();
  return COMMANDS.filter((c) => c.cmd.startsWith(v) || v.startsWith(c.cmd));
}

function renderPalette(value) {
  const el = paletteEl();
  const items = matchCommands(value);
  if (!value.startsWith(">") || !items.length) {
    el.classList.remove("open");
    el.innerHTML = "";
    return;
  }
  selIndex = Math.min(selIndex, items.length - 1);
  el.innerHTML = items
    .map((c, i) => `
      <div class="palette-item ${i === selIndex ? "sel" : ""}" data-i="${i}">
        <span class="palette-ico">${CMD_ICONS[c.cmd] || ">"}</span>
        <span class="palette-txt">
          <span class="palette-cmd">${c.cmd}${c.arg ? " …" : ""}</span>
          <span class="palette-hint">${c.hint}</span>
        </span>
      </div>`)
    .join("");
  el.classList.add("open");

  el.querySelectorAll(".palette-item").forEach((it) => {
    it.addEventListener("mousedown", (e) => {
      e.preventDefault();
      runCommandLine(items[+it.dataset.i].cmd + " ");
    });
  });
}

function closePalette() {
  const el = paletteEl();
  el.classList.remove("open");
  el.innerHTML = "";
  selIndex = 0;
}

function openPalette(prefill) {
  const input = document.getElementById("searchInput");
  input.value = prefill;
  input.focus();
  renderPalette(prefill);
}

// parse + execute a full command line
function runCommandLine(line) {
  const input = document.getElementById("searchInput");
  const raw = line.trim();

  // longest matching command first
  const sorted = [...COMMANDS].sort((a, b) => b.cmd.length - a.cmd.length);
  const found = sorted.find((c) => raw === c.cmd || raw.startsWith(c.cmd + " "));

  if (!found) { toast("unknown command"); return; }

  const arg = raw.slice(found.cmd.length).trim();
  if (found.arg && !arg) {
    // needs argument — keep typing
    input.value = found.cmd + " ";
    input.focus();
    renderPalette(input.value);
    return;
  }
  closePalette();
  input.value = "";
  found.run(arg);
}

function setupCommands() {
  const input = document.getElementById("searchInput");

  input.addEventListener("input", () => {
    if (input.value.startsWith(">")) renderPalette(input.value);
    else if (typeof renderLauncher === "function") renderLauncher(input.value);
    else closePalette();
  });

  input.addEventListener("keydown", (e) => {
    if (!input.value.startsWith(">")) {
      if (typeof launcherKey === "function") launcherKey(e, input);
      return;
    }
    const el = paletteEl();
    if (!el.classList.contains("open")) return;
    const items = el.querySelectorAll(".palette-item");
    if (e.key === "ArrowDown") { e.preventDefault(); selIndex = (selIndex + 1) % items.length; renderPalette(input.value); }
    else if (e.key === "ArrowUp") { e.preventDefault(); selIndex = (selIndex - 1 + items.length) % items.length; renderPalette(input.value); }
    else if (e.key === "Tab") {
      e.preventDefault();
      const m = matchCommands(input.value);
      if (m[selIndex]) { input.value = m[selIndex].cmd + (m[selIndex].arg ? " " : ""); renderPalette(input.value); }
    }
    else if (e.key === "Escape") { closePalette(); input.value = ""; }
  });

  input.addEventListener("blur", () => setTimeout(closePalette, 120));
}

// called by app.js on submit — returns true if it was a command
function handleCommandSubmit(value) {
  if (!value.startsWith(">")) return false;
  const el = paletteEl();
  if (el.classList.contains("open")) {
    const items = matchCommands(value);
    if (items[selIndex] && value.trim() === items[selIndex].cmd) {
      runCommandLine(items[selIndex].cmd + " ");
      return true;
    }
  }
  runCommandLine(value);
  return true;
}
