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
  ">stash": "▤", ">save": "✚", ">vault": "🔑", ">autodj": "♫", ">mode": "◈", ">phone": "▢",
  ">lock": "▢", ">sleep": "☾", ">shutdown": "⏻", ">abort": "✕", ">mute": "♪",
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
  { cmd: ">help",        hint: "show all commands",               run: () => openPalette(">") },
];

// ---------- pc control: talk to the backend ----------
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
