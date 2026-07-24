/* =========================================================
   extras.js — side panel (notes / to-do), keyboard launcher,
   mini player, day mood, the pet.
   Loaded after dashboard.js, before app.js.
   ========================================================= */

/* ---------- side panel: notes + to-do ---------- */
function openPanel(which) {
  const panel = document.getElementById("sidePanel");
  const already = !panel.classList.contains("hidden");
  const active = document.querySelector(".sp-tab.active")?.dataset.sp;
  if (already && active === which) return closePanel(); // same button = toggle
  panel.classList.remove("hidden");
  switchPanelTab(which);
  if (which === "notes") document.getElementById("notesArea").focus();
  else document.getElementById("todoInput").focus();
}

function closePanel() {
  document.getElementById("sidePanel").classList.add("hidden");
}

function switchPanelTab(which) {
  document.querySelectorAll(".sp-tab").forEach((t) =>
    t.classList.toggle("active", t.dataset.sp === which)
  );
  document.getElementById("spNotes").classList.toggle("hidden", which !== "notes");
  document.getElementById("spTodo").classList.toggle("hidden", which !== "todo");
  document.getElementById("spSnips").classList.toggle("hidden", which !== "snips");
  document.getElementById("spSent").classList.toggle("hidden", which !== "sent");
  if (which === "snips") renderSnips();
  if (which === "sent") renderSent();
}

/* ---------- text snippets (expand ;trigger anywhere) ---------- */
function getSnips(cb) {
  try { chrome.storage.local.get("snippets", (r) => cb(Array.isArray(r.snippets) ? r.snippets : [])); }
  catch { cb([]); }
}
function saveSnips(list) { try { chrome.storage.local.set({ snippets: list }); } catch {} }

function renderSnips() {
  getSnips((list) => {
    const el = document.getElementById("snipList");
    if (!el) return;
    el.innerHTML = list.length
      ? list.map((s, i) => `
        <div class="snip" data-i="${i}">
          <span class="snip-trig">${escHtml(s.trigger)}</span>
          <span class="snip-text">${escHtml(s.text)}</span>
          <button class="snip-del" data-i="${i}" title="remove">✕</button>
        </div>`).join("")
      : `<div class="song-empty">no snippets yet — add one above</div>`;
    el.querySelectorAll(".snip-del").forEach((b) =>
      b.addEventListener("click", () => getSnips((l) => { l.splice(+b.dataset.i, 1); saveSnips(l); renderSnips(); })));
  });
}

function addSnip() {
  let trig = document.getElementById("snipTrig").value.trim();
  const text = document.getElementById("snipText").value.trim();
  if (!trig || !text) return toast("need a trigger and text");
  if (!trig.startsWith(";")) trig = ";" + trig;
  getSnips((l) => {
    if (l.some((s) => s.trigger === trig)) return toast("that trigger exists");
    l.push({ trigger: trig, text });
    saveSnips(l);
    document.getElementById("snipTrig").value = "";
    document.getElementById("snipText").value = "";
    renderSnips();
    toast("snippet added");
  });
}

function setupSnips() {
  const add = document.getElementById("snipAdd");
  if (add) add.addEventListener("click", addSnip);
  renderSnips();
}

/* notes: plain autosaving scratchpad */
function notesCount() {
  const v = document.getElementById("notesArea").value.trim();
  const words = v ? v.split(/\s+/).length : 0;
  document.getElementById("notesCount").textContent =
    words + (words === 1 ? " word" : " words");
}

function setupNotes() {
  const area = document.getElementById("notesArea");
  area.value = localStorage.getItem("notes") || "";
  notesCount();
  let t;
  area.addEventListener("input", () => {
    notesCount();
    clearTimeout(t);
    t = setTimeout(() => localStorage.setItem("notes", area.value), 300);
  });

  // clear: first click arms, second wipes
  const clearBtn = document.getElementById("notesClear");
  clearBtn.addEventListener("click", () => {
    if (clearBtn.dataset.arm) {
      area.value = "";
      localStorage.setItem("notes", "");
      notesCount();
      delete clearBtn.dataset.arm; clearBtn.textContent = "clear";
      toast("notes cleared");
    } else {
      clearBtn.dataset.arm = "1"; clearBtn.textContent = "sure?";
      setTimeout(() => { delete clearBtn.dataset.arm; clearBtn.textContent = "clear"; }, 2200);
    }
  });
}

function addNoteLine(text) {
  const area = document.getElementById("notesArea");
  area.value = (area.value ? area.value + "\n" : "") + text;
  localStorage.setItem("notes", area.value);
  notesCount();
  toast("noted");
}

/* to-dos */
function getTodos() {
  try { return JSON.parse(localStorage.getItem("todos") || "[]"); } catch { return []; }
}
function saveTodos(ts) { localStorage.setItem("todos", JSON.stringify(ts)); }

function renderTodos() {
  const el = document.getElementById("todoList");
  const ts = getTodos();

  // progress bar: done / total
  const done = ts.filter((t) => t.done).length;
  document.getElementById("tpFill").style.width =
    ts.length ? (done / ts.length) * 100 + "%" : "0%";
  document.getElementById("tpLabel").textContent = done + " / " + ts.length;

  if (!ts.length) {
    el.innerHTML = `<div class="song-empty">nothing to do — nice</div>`;
    return;
  }
  el.innerHTML = ts
    .map((t, i) => `
      <div class="todo ${t.done ? "done" : ""}" data-i="${i}">
        <span class="todo-check">${t.done ? "✓" : ""}</span>
        <span class="todo-text">${escHtml(t.t)}</span>
        <button class="todo-del" data-i="${i}" title="remove">✕</button>
      </div>`)
    .join("");
  el.querySelectorAll(".todo").forEach((row) =>
    row.addEventListener("click", () => {
      const ts2 = getTodos();
      ts2[+row.dataset.i].done = !ts2[+row.dataset.i].done;
      saveTodos(ts2); renderTodos();
    })
  );
  el.querySelectorAll(".todo-del").forEach((b) =>
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      const ts2 = getTodos();
      ts2.splice(+b.dataset.i, 1);
      saveTodos(ts2); renderTodos();
    })
  );
}

function addTodo(text) {
  if (!text) return;
  const ts = getTodos();
  ts.push({ t: text, done: false });
  saveTodos(ts); renderTodos();
}

function setupTodos() {
  const input = document.getElementById("todoInput");
  const add = () => { addTodo(input.value.trim()); input.value = ""; };
  document.getElementById("todoAddBtn").addEventListener("click", add);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") add(); });
  document.getElementById("todoClear").addEventListener("click", () => {
    saveTodos(getTodos().filter((t) => !t.done));
    renderTodos(); toast("done tasks cleared");
  });
  renderTodos();
}

/* ---------- keyboard-first launcher (search bar) ---------- */
const LAUNCH = { items: [], sel: 0, open: false };

function flatLinks() {
  const out = [];
  getGroups().forEach((g) =>
    g.links.forEach((it) => {
      if (it.folder) (it.links || []).forEach((l) => out.push(l));
      else out.push(it);
    })
  );
  return out;
}

// strip protocol/www/trailing-slash so the same page from different sources dedupes
function normUrl(u) {
  try {
    const x = new URL(u);
    return (x.hostname.replace(/^www\./, "") + x.pathname + x.search).replace(/\/$/, "");
  } catch { return (u || "").replace(/\/$/, ""); }
}

function queryHistory(q, max) {
  return new Promise((resolve) => {
    if (!(typeof chrome !== "undefined" && chrome.history && chrome.history.search)) return resolve([]);
    try {
      chrome.history.search({ text: q, maxResults: max, startTime: 0 }, (items) => {
        resolve((items || [])
          .filter((h) => h.url)
          .map((h) => ({ type: "history", name: h.title || h.url, url: h.url, visits: h.visitCount || 0 })));
      });
    } catch { resolve([]); }
  });
}

function queryBookmarkLinks(q, max) {
  return new Promise((resolve) => {
    if (!(typeof chrome !== "undefined" && chrome.bookmarks && chrome.bookmarks.search)) return resolve([]);
    try {
      chrome.bookmarks.search(q, (nodes) => {
        resolve((nodes || [])
          .filter((n) => n.url)
          .slice(0, max)
          .map((n) => ({ type: "bookmark", name: n.title || n.url, url: n.url })));
      });
    } catch { resolve([]); }
  });
}

async function renderLauncher(raw) {
  const el = document.getElementById("palette");
  const q = raw.trim();
  const ql = q.toLowerCase();
  if (ql.length < 2) { LAUNCH.open = false; closePalette(); return; }

  LAUNCH._q = ql; // guard against out-of-order async results

  // your curated links first
  const links = flatLinks()
    .filter((l) => l.name.toLowerCase().includes(ql) || (l.url || "").toLowerCase().includes(ql))
    .slice(0, 4)
    .map((l) => ({ type: "link", name: l.name, url: l.url }));

  const [hist, marks] = await Promise.all([queryHistory(q, 8), queryBookmarkLinks(q, 4)]);
  if (LAUNCH._q !== ql) return; // a newer keystroke already ran

  // history ranked by how often you visit it
  hist.sort((a, b) => b.visits - a.visits);

  // merge links → bookmarks → history, deduping by normalized URL
  const seen = new Set();
  const items = [];
  for (const it of [...links, ...marks, ...hist]) {
    const key = normUrl(it.url);
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(it);
    if (items.length >= 7) break;
  }

  LAUNCH.items = items;
  if (!items.length) { LAUNCH.open = false; closePalette(); return; }
  LAUNCH.sel = Math.min(LAUNCH.sel, items.length - 1);
  LAUNCH.open = true;

  const tagFor = { history: "history", bookmark: "saved", link: "" };
  el.innerHTML = items
    .map((l, i) => {
      const fav = favicon(l.url);
      const ico = fav
        ? `<img src="${escHtml(fav)}" alt="" loading="lazy">`
        : escHtml(iconLetter(l.name));
      const tag = tagFor[l.type] ? `<span class="palette-tag">${tagFor[l.type]}</span>` : "";
      return `
      <div class="palette-item ${i === LAUNCH.sel ? "sel" : ""}" data-i="${i}">
        <span class="palette-ico">${ico}</span>
        <span class="palette-txt">
          <span class="palette-cmd">${escHtml(l.name)}${tag}</span>
          <span class="palette-hint">${escHtml(l.url)}</span>
        </span>
      </div>`;
    })
    .join("");
  el.classList.add("open");
  el.querySelectorAll(".palette-item").forEach((it) =>
    it.addEventListener("mousedown", (e) => {
      e.preventDefault();
      goTo(LAUNCH.items[+it.dataset.i].url);
    })
  );
}

function launcherKey(e, input) {
  if (!LAUNCH.open) return;
  if (e.key === "ArrowDown") {
    e.preventDefault();
    LAUNCH.sel = (LAUNCH.sel + 1) % LAUNCH.items.length;
    renderLauncher(input.value);
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    LAUNCH.sel = (LAUNCH.sel - 1 + LAUNCH.items.length) % LAUNCH.items.length;
    renderLauncher(input.value);
  } else if (e.key === "Escape") {
    LAUNCH.open = false; closePalette();
  }
}

/* Enter in the search bar: open the selected link (app.js calls this) */
function launcherSubmit() {
  if (!LAUNCH.open || !LAUNCH.items[LAUNCH.sel]) return false;
  goTo(LAUNCH.items[LAUNCH.sel].url);
  return true;
}

/* ---------- mini player ---------- */
function updateMini() {
  const mp = document.getElementById("miniPlayer");
  const active = PLAYER.stream || PLAYER.idx >= 0;
  mp.classList.toggle("hidden", !active);
  if (!active) return;
  const song = PLAYER.idx >= 0 ? playlist()[PLAYER.idx] : null;
  const title = PLAYER.stream ? PLAYER.stream.name : song ? song.name : "—";
  document.getElementById("mpTitle").textContent = title;
  const playing = !PLAYER.audio.paused;
  document.getElementById("mpPlay").classList.toggle("playing", playing);
  mp.classList.toggle("live", playing);
}

function setupMiniPlayer() {
  ["play", "pause", "ended", "emptied", "loadedmetadata"].forEach((ev) =>
    PLAYER.audio.addEventListener(ev, updateMini)
  );
  document.getElementById("mpPlay").addEventListener("click", () => {
    if (PLAYER.audio.paused) PLAYER.audio.play(); else PLAYER.audio.pause();
  });
  document.getElementById("mpNext").addEventListener("click", () => playIndex(PLAYER.idx + 1));
  document.getElementById("mpTitle").addEventListener("click", () => {
    toggleDock(true);
    document.querySelector('.dash-tab[data-pane="media"]').click();
  });
}

/* ---------- day mood: subtle tint by time of day ---------- */
function applyDayMood() {
  const h = new Date().getHours();
  const mood = h < 6 ? "night" : h < 12 ? "morning" : h < 18 ? "day" : h < 22 ? "evening" : "night";
  ["mood-night", "mood-morning", "mood-day", "mood-evening"].forEach((c) =>
    document.body.classList.remove(c)
  );
  document.body.classList.add("mood-" + mood);
}

/* ---------- the pet ---------- */
const PET = { last: Date.now() };

function setupPet() {
  const pet = document.getElementById("pet");
  if (localStorage.getItem("petOff")) pet.classList.add("hidden");

  ["mousemove", "keydown", "click"].forEach((ev) =>
    document.addEventListener(ev, () => { PET.last = Date.now(); }, { passive: true })
  );

  pet.addEventListener("click", () => {
    const lines = ["hi :3", "back to work?", "play some music!", "*happy wiggle*", "meow?", "nice wallpaper"];
    toast(lines[Math.floor(Math.random() * lines.length)]);
    pet.classList.add("jump");
    setTimeout(() => pet.classList.remove("jump"), 650);
  });

  setInterval(() => {
    const playing = typeof PLAYER !== "undefined" &&
      !PLAYER.audio.paused && (PLAYER.idx >= 0 || PLAYER.stream);
    const idle = Date.now() - PET.last > 60000;
    pet.classList.toggle("dance", playing);
    pet.classList.toggle("sleep", !playing && idle);
  }, 2000);
}

function togglePet() {
  const pet = document.getElementById("pet");
  const off = pet.classList.toggle("hidden");
  if (off) localStorage.setItem("petOff", "1");
  else localStorage.removeItem("petOff");
  toast(off ? "pet is gone :(" : "pet is back!");
}

/* ---------- screen-time card on the main grid ---------- */
/* a monthly calendar card on the main screen (replaces the old screen-time card) */
function renderCalendarCard() {
  const col = document.querySelector(".col-4");
  if (!col || (typeof EDIT_MODE !== "undefined" && EDIT_MODE)) return;
  const old = document.getElementById("calCard");
  if (old) old.remove();

  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth(), today = now.getDate();
  const monthName = now.toLocaleDateString([], { month: "long" });

  const days = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
  let head = days.map((d) => `<span class="cc-h">${d}</span>`).join("");
  const first = new Date(y, m, 1);
  const startDow = (first.getDay() + 6) % 7; // Mon = 0
  const dim = new Date(y, m + 1, 0).getDate();
  const prevDim = new Date(y, m, 0).getDate();
  const cells = [];
  for (let i = startDow - 1; i >= 0; i--) cells.push({ d: prevDim - i, out: true });
  for (let d = 1; d <= dim; d++) cells.push({ d, today: d === today });
  let nx = 1;
  while (cells.length % 7 !== 0) cells.push({ d: nx++, out: true });
  const grid = cells.map((c) =>
    `<span class="cc-d ${c.out ? "out" : ""} ${c.today ? "today" : ""}">${c.d}</span>`).join("");

  const el = document.createElement("section");
  el.className = "group cal-card";
  el.id = "calCard";
  el.dataset.view = "home";
  el.innerHTML = `
    <div class="group-head">
      <span class="group-title">${monthName}</span>
      <span class="group-count">${y}</span>
    </div>
    <div class="cc-grid">${head}${grid}</div>`;
  el.classList.toggle("hidden", typeof CURRENT_VIEW !== "undefined" && CURRENT_VIEW !== "home");
  col.appendChild(el);
}

/* ---------- wallpaper pulse: background breathes with the music ---------- */
const PULSE = { ctx: null, analyser: null, src: null, data: null, raf: null };

function pulseEnabled() { return !localStorage.getItem("pulseOff"); }

function initPulse() {
  if (PULSE.ctx) return true;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    PULSE.ctx = new Ctx();
    PULSE.src = PULSE.ctx.createMediaElementSource(PLAYER.audio);
    PULSE.analyser = PULSE.ctx.createAnalyser();
    PULSE.analyser.fftSize = 256;
    PULSE.analyser.smoothingTimeConstant = 0.82;
    PULSE.src.connect(PULSE.analyser);
    PULSE.analyser.connect(PULSE.ctx.destination);
    PULSE.data = new Uint8Array(PULSE.analyser.frequencyBinCount);
    return true;
  } catch { PULSE.ctx = null; return false; }
}

function pulseLoop() {
  if (!PULSE.analyser) return;
  PULSE.analyser.getByteFrequencyData(PULSE.data);
  let sum = 0;
  for (let i = 0; i < 20; i++) sum += PULSE.data[i]; // bass-ish bins
  const level = sum / 20 / 255; // 0..1
  const r = document.documentElement.style;
  r.setProperty("--pulse-scale", (1 + level * 0.045).toFixed(3));
  r.setProperty("--pulse-bright", (1 + level * 0.28).toFixed(3));
  PULSE.raf = requestAnimationFrame(pulseLoop);
}

function startPulse() {
  if (!pulseEnabled()) return;
  if (!initPulse()) return;
  if (PULSE.ctx.state === "suspended") PULSE.ctx.resume();
  if (!PULSE.raf) pulseLoop();
}

function stopPulse() {
  cancelAnimationFrame(PULSE.raf);
  PULSE.raf = null;
  const r = document.documentElement.style;
  r.setProperty("--pulse-scale", "1");
  r.setProperty("--pulse-bright", "1");
}

function setupPulse() {
  PLAYER.audio.addEventListener("play", startPulse);
  PLAYER.audio.addEventListener("pause", stopPulse);
  PLAYER.audio.addEventListener("ended", stopPulse);
}

function togglePulse() {
  if (pulseEnabled()) {
    localStorage.setItem("pulseOff", "1");
    stopPulse();
    toast("wallpaper pulse off");
  } else {
    localStorage.removeItem("pulseOff");
    if (!PLAYER.audio.paused) startPulse();
    toast("wallpaper pulse on");
  }
}

/* ---------- click the clock → calendar popover ---------- */
const CALPOP = { y: null, m: null };

function openCalPop(force) {
  const pop = document.getElementById("calPop");
  const show = force !== undefined ? force : pop.classList.contains("hidden");
  if (show) {
    if (CALPOP.y === null) {
      const n = new Date();
      CALPOP.y = n.getFullYear();
      CALPOP.m = n.getMonth();
    }
    buildMiniCal();
    pop.classList.remove("hidden");
  } else {
    pop.classList.add("hidden");
  }
}

function buildMiniCal() {
  const el = document.getElementById("calPop");
  const y = CALPOP.y, m = CALPOP.m;
  const now = new Date();
  const isThisMonth = y === now.getFullYear() && m === now.getMonth();
  const today = now.getDate();
  const monthName = new Date(y, m, 1).toLocaleDateString([], { month: "long" });

  const days = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
  let head = days.map((d) => `<span class="cal-h">${d}</span>`).join("");

  const first = new Date(y, m, 1);
  const startDow = (first.getDay() + 6) % 7; // Mon = 0
  const dim = new Date(y, m + 1, 0).getDate();
  const prevDim = new Date(y, m, 0).getDate();

  const cells = [];
  for (let i = startDow - 1; i >= 0; i--) cells.push({ d: prevDim - i, out: true });
  for (let d = 1; d <= dim; d++) cells.push({ d, out: false, today: isThisMonth && d === today });
  let nx = 1;
  while (cells.length % 7 !== 0) cells.push({ d: nx++, out: true });

  const grid = cells
    .map((c) => `<span class="cal-d ${c.out ? "out" : ""} ${c.today ? "today" : ""}">${c.d}</span>`)
    .join("");

  el.innerHTML = `
    <div class="cp-head">
      <button class="cp-nav" data-nav="-1" aria-label="previous month">‹</button>
      <span class="cp-title">${monthName} ${y}</span>
      <button class="cp-nav" data-nav="1" aria-label="next month">›</button>
    </div>
    <div class="cp-grid">${head}${grid}</div>
    <button class="cp-today">today</button>`;

  el.querySelectorAll(".cp-nav").forEach((b) =>
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      CALPOP.m += +b.dataset.nav;
      if (CALPOP.m < 0) { CALPOP.m = 11; CALPOP.y--; }
      if (CALPOP.m > 11) { CALPOP.m = 0; CALPOP.y++; }
      buildMiniCal();
    })
  );
  el.querySelector(".cp-today").addEventListener("click", (e) => {
    e.stopPropagation();
    const n = new Date();
    CALPOP.y = n.getFullYear();
    CALPOP.m = n.getMonth();
    buildMiniCal();
  });
}

function setupCalPop() {
  const clock = document.getElementById("clock");
  clock.addEventListener("click", (e) => { e.stopPropagation(); openCalPop(); });
  document.getElementById("calPop").addEventListener("click", (e) => e.stopPropagation());
  document.addEventListener("click", () => openCalPop(false));
}

/* ---------- life-modes (workspaces) ---------- */
function getModes() { try { return JSON.parse(localStorage.getItem("modes") || "[]"); } catch { return []; } }
function saveModes(m) { localStorage.setItem("modes", JSON.stringify(m)); }

function saveMode(name) {
  name = (name || "").trim();
  if (!name) return toast("name it: >mode save work");
  const root = getComputedStyle(document.documentElement);
  const mode = {
    name,
    accent: localStorage.getItem("accent") || root.getPropertyValue("--accent").trim(),
    dim: localStorage.getItem("dim") || "1",
    blur: localStorage.getItem("blur") || "18",
    view: typeof CURRENT_VIEW !== "undefined" ? CURRENT_VIEW : "home",
    urls: [],
  };
  const commit = () => { const m = getModes().filter((x) => x.name !== name); m.push(mode); saveModes(m); };
  try {
    chrome.tabs.query({ currentWindow: true }, (tabs) => {
      mode.urls = (tabs || []).map((t) => t.url).filter((u) => u && /^https?:/.test(u));
      commit();
      toast(`mode “${name}” saved · ${mode.urls.length} tabs`);
    });
  } catch { commit(); toast(`mode “${name}” saved`); }
}

function applyMode(name) {
  const mode = getModes().find((x) => x.name.toLowerCase() === name.toLowerCase());
  if (!mode) return toast("no mode: " + name);
  if (mode.accent && typeof THEME !== "undefined" && /^#?[0-9a-f]{6}$/i.test(mode.accent)) THEME.applyAccentHex(mode.accent);
  if (mode.dim != null) { document.documentElement.style.setProperty("--dim", mode.dim); localStorage.setItem("dim", mode.dim); }
  if (mode.blur != null) { document.documentElement.style.setProperty("--blur", mode.blur + "px"); localStorage.setItem("blur", mode.blur); }
  if (mode.view && typeof switchView === "function") switchView(mode.view);
  const urls = mode.urls || [];
  toast(`mode “${mode.name}”${urls.length ? " · opening " + urls.length + " tabs" : ""}`);
  try { urls.forEach((u) => chrome.tabs.create({ url: u, active: false })); } catch {}
}

function delMode(name) {
  saveModes(getModes().filter((x) => x.name.toLowerCase() !== (name || "").toLowerCase()));
  toast("mode removed");
}

function runModeCommand(arg) {
  arg = (arg || "").trim();
  if (!arg) { const n = getModes().map((m) => m.name).join(", "); return toast(n ? "modes: " + n : "no modes yet — >mode save work"); }
  if (/^save\s+/i.test(arg)) return saveMode(arg.replace(/^save\s+/i, ""));
  if (/^del\s+/i.test(arg)) return delMode(arg.replace(/^del\s+/i, ""));
  applyMode(arg);
}

/* ---------- daily briefing (once a day) ---------- */
async function buildBriefing() {
  const today = new Date().toDateString();
  if (localStorage.getItem("briefingDate") === today) return;

  const lines = [];

  // weather + short forecast
  try {
    const city = (typeof SETTINGS !== "undefined" && SETTINGS.city) || localStorage.getItem("city");
    if (city) {
      const geo = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`).then((r) => r.json());
      if (geo.results && geo.results[0]) {
        const { latitude, longitude } = geo.results[0];
        const w = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&daily=temperature_2m_max,temperature_2m_min&forecast_days=3&timezone=auto`).then((r) => r.json());
        const cur = Math.round(w.current.temperature_2m);
        const cond = weatherCodeText(w.current.weather_code).toLowerCase();
        let f = "";
        if (w.daily) f = w.daily.temperature_2m_max.slice(0, 3).map((mx, i) => Math.round(w.daily.temperature_2m_min[i]) + "–" + Math.round(mx) + "°").join("   ");
        lines.push({ ico: "☀", t: `${cur}° ${cond} in ${city}`, s: f });
      }
    }
  } catch {}

  // todos
  try {
    const ts = getTodos().filter((t) => !t.done);
    if (ts.length) lines.push({ ico: "☑", t: `${ts.length} task${ts.length > 1 ? "s" : ""} to do`, s: ts.slice(0, 3).map((t) => t.t).join(" · ") });
  } catch {}

  // screen time today
  try {
    if (typeof MusicSource !== "undefined" && MusicSource.api) {
      const st = await MusicSource.api.screenTime();
      if (st && st.totalSec > 60) {
        const top = st.apps && st.apps[0];
        lines.push({ ico: "◔", t: `${fmtHM(st.totalSec)} on screen today`, s: top ? "most: " + appLabel(top.name) : "" });
      }
    }
  } catch {}

  if (!lines.length) return; // nothing worth saying — don't mark the day
  localStorage.setItem("briefingDate", today);

  const h = new Date().getHours();
  const greet = h < 6 ? "still up" : h < 12 ? "good morning" : h < 18 ? "good afternoon" : "good evening";
  document.getElementById("briefHi").textContent = greet + (typeof SETTINGS !== "undefined" && SETTINGS.name ? ", " + SETTINGS.name : "");
  document.getElementById("briefLines").innerHTML = lines.map((l) =>
    `<div class="brief-row"><span class="brief-ico">${l.ico}</span><div class="brief-txt"><div class="brief-t">${escHtml(l.t)}</div>${l.s ? `<div class="brief-s">${escHtml(l.s)}</div>` : ""}</div></div>`).join("");

  const el = document.getElementById("briefing");
  el.classList.remove("hidden");
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add("hidden"), 13000);

  // one warm AI line on top, if an AI provider is configured (>ai) —
  // arrives a moment later; skipped silently when there's no key
  try {
    const ctx =
      `name: ${(typeof SETTINGS !== "undefined" && SETTINGS.name) || "-"} · ${greet}\n` +
      lines.map((l) => l.t + (l.s ? " (" + l.s + ")" : "")).join("\n");
    chrome.runtime.sendMessage({ type: "ai-brief", context: ctx }, (resp) => {
      if (chrome.runtime.lastError || !resp || !resp.ok || !resp.text) return;
      if (el.classList.contains("hidden")) return; // card already gone
      const div = document.createElement("div");
      div.className = "brief-row";
      div.innerHTML = `<span class="brief-ico">✦</span><div class="brief-txt"><div class="brief-t">${escHtml(resp.text)}</div></div>`;
      document.getElementById("briefLines").prepend(div);
      clearTimeout(el._t);
      el._t = setTimeout(() => el.classList.add("hidden"), 13000); // give time to read it
    });
  } catch {}
}

function setupBriefing() {
  document.getElementById("briefClose").addEventListener("click", () => document.getElementById("briefing").classList.add("hidden"));
  setTimeout(buildBriefing, 1300);
}

/* ---------- phone companion ---------- */
const PHONE_BASE = "http://127.0.0.1:5055/phone";
let phonePollTimer = null;

function pushPhoneTheme() {
  try {
    chrome.storage.local.get(["accentColor", "accentInk"], (r) => {
      fetch(PHONE_BASE + "/theme", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accent: r.accentColor || "#ff4d55", ink: r.accentInk || "#1a1a1c" }),
      }).catch(() => {});
    });
  } catch {}
}

async function openPhone() {
  const el = document.getElementById("phone");
  el.classList.remove("hidden");
  pushPhoneTheme();
  try {
    const info = await fetch(PHONE_BASE + "/info").then((r) => r.json());
    document.getElementById("phoneCode").textContent = info.code;
    document.getElementById("phoneUrl").textContent = (info.url || "").replace(/^https?:\/\//, "");
    const qEl = document.getElementById("phoneQr");
    qEl.innerHTML = "";
    if (typeof qrcode !== "undefined") {
      const q = qrcode(0, "M"); q.addData(info.url); q.make();
      qEl.innerHTML = q.createImgTag(5, 8);
    }
  } catch {
    document.getElementById("phoneUrl").textContent = "start the backend (run.bat) first";
    document.getElementById("phoneQr").innerHTML = "";
  }
}
function closePhone() { document.getElementById("phone").classList.add("hidden"); }

function sendToPhone(data) {
  data = (data || "").trim();
  if (!data) return;
  const kind = /^https?:\/\//i.test(data) ? "link" : "text";
  fetch(PHONE_BASE + "/send", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ to: "phone", kind, data }),
  }).then((r) => {
    if (r.ok) { logSend("pc→phone", kind, data); toast("sent to phone →"); document.getElementById("phoneSendInput").value = ""; }
    else toast("could not send");
  }).catch(() => toast("start the backend first"));
}

/* ---- sent history ---- */
function getSendHist() { try { return JSON.parse(localStorage.getItem("sendHist") || "[]"); } catch { return []; } }
function logSend(dir, kind, data) {
  const h = getSendHist();
  h.unshift({ dir, kind, data, at: Date.now() });
  localStorage.setItem("sendHist", JSON.stringify(h.slice(0, 60)));
  if (!document.getElementById("spSent").classList.contains("hidden")) renderSent();
}
function renderSent() {
  const el = document.getElementById("sentList");
  const h = getSendHist();
  if (!h.length) { el.innerHTML = `<div class="song-empty">nothing sent yet</div>`; return; }
  el.innerHTML = h.map((s) => `
    <div class="sent-item">
      <span class="sent-dir ${s.dir === "pc→phone" ? "out" : "in"}">${s.dir === "pc→phone" ? "→📱" : "📱→"}</span>
      <div class="sent-body">
        ${s.kind === "link" ? `<a href="${escHtml(s.data)}" class="sent-data">${escHtml(s.data)}</a>` : `<span class="sent-data">${escHtml(s.data)}</span>`}
      </div>
      <button class="sent-copy" data-d="${escHtml(s.data)}" title="copy">⧉</button>
    </div>`).join("");
  el.querySelectorAll(".sent-copy").forEach((b) =>
    b.addEventListener("click", () => navigator.clipboard.writeText(b.dataset.d).then(() => toast("copied")).catch(() => {})));
}

/* poll for links/text the phone sent, and act on them (runs while the tab is open) */
function startPhonePoll() {
  if (phonePollTimer) return;
  phonePollTimer = setInterval(async () => {
    try {
      const d = await fetch(PHONE_BASE + "/inbox?to=pc", { signal: AbortSignal.timeout(2500) }).then((r) => r.ok ? r.json() : { items: [] });
      (d.items || []).forEach((i) => {
        if (i.kind === "link") {
          try { chrome.tabs.create({ url: i.data, active: false }); } catch { window.open(i.data, "_blank"); }
          toast("link from phone →");
        } else {
          navigator.clipboard.writeText(i.data).then(() => toast("phone text copied")).catch(() => {});
        }
        logSend("phone→pc", i.kind, i.data);
      });
    } catch { /* backend off — quietly skip */ }
  }, 4000);
}

function setupPhone() {
  document.getElementById("phoneClose").addEventListener("click", closePhone);
  const inp = document.getElementById("phoneSendInput");
  document.getElementById("phoneSendBtn").addEventListener("click", () => sendToPhone(inp.value));
  inp.addEventListener("keydown", (e) => { if (e.key === "Enter") sendToPhone(inp.value); });
  document.getElementById("sentClear").addEventListener("click", () => { localStorage.setItem("sendHist", "[]"); renderSent(); toast("history cleared"); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closePhone(); });
  startPhonePoll();
  pushPhoneTheme();
}

/* ---------- settings panel (the gear) ---------- */
/* apply display prefs (size / weight / board width) to the board */
function applyDisplay() {
  const root = document.documentElement;
  root.dataset.size = localStorage.getItem("uiSize") || "m";
  root.dataset.weight = localStorage.getItem("uiWeight") || "normal";
  const cw = localStorage.getItem("colW");
  if (cw) root.style.setProperty("--col-w", cw + "px");
  else root.style.removeProperty("--col-w");
}

/* highlight the active button in a segmented control */
function setSegOn(id, v) {
  document.querySelectorAll("#" + id + " button").forEach((b) => b.classList.toggle("on", b.dataset.v === v));
}

function openSettings(force) {
  const el = document.getElementById("settings");
  const show = force !== undefined ? force : el.classList.contains("hidden");
  el.classList.toggle("hidden", !show);
  if (show) syncSettings();
}

function syncSettings() {
  const g = (id) => document.getElementById(id);
  setSegOn("setSize", localStorage.getItem("uiSize") || "m");
  setSegOn("setWeight", localStorage.getItem("uiWeight") || "normal");
  const cw = parseInt(localStorage.getItem("colW") || 240);
  g("setColW").value = cw; g("colwVal").textContent = cw + "px";
  g("setNewTab").checked = localStorage.getItem("openNewTab") === "1";
  g("setDim").value = localStorage.getItem("dim") ?? 1;
  g("setBlur").value = parseInt(localStorage.getItem("blur") ?? 18);
  const acc = localStorage.getItem("accent") || getComputedStyle(document.documentElement).getPropertyValue("--accent").trim();
  if (/^#[0-9a-f]{6}$/i.test(acc)) g("setAccent").value = acc;
  g("setVol").value = localStorage.getItem("vol") ?? 0;
  g("setPet").checked = !localStorage.getItem("petOff");
  g("setAutodj").checked = !localStorage.getItem("autodjOff");
  g("setPulse").checked = !localStorage.getItem("pulseOff");
  g("setVisited").checked = localStorage.getItem("topHidden") !== "1";
  g("setName").value = (typeof SETTINGS !== "undefined" && SETTINGS.name) || localStorage.getItem("name") || "";
  g("setCity").value = (typeof SETTINGS !== "undefined" && SETTINGS.city) || localStorage.getItem("city") || "";

  g("setRandomWall").checked = localStorage.getItem("randomWall") === "1";
  g("setRandomType").value = localStorage.getItem("randomWallType") || "both";
  g("setRandomTypeRow").style.display = g("setRandomWall").checked ? "" : "none";
  updateRandomWallHint();

  g("setLyrics").checked = localStorage.getItem("lyricsOn") === "1";
  g("setLyricsSize").value = localStorage.getItem("lyricsSize") || 44;
  g("setLyricsAnim").value = localStorage.getItem("lyricsAnim") || "fade";
  g("setLyricsPos").value = localStorage.getItem("lyricsPos") || "center";
  g("setLyricsColor").value = localStorage.getItem("lyricsColor") || "white";
  g("lyricsSettings").style.display = g("setLyrics").checked ? "" : "none";
  g("lyricsFontHint").textContent = localStorage.getItem("lyricsFont")
    ? "font: " + localStorage.getItem("lyricsFont")
    : "upload a .ttf / .otf / .woff to style the lyrics";
  const off = parseFloat(localStorage.getItem("lyricsOffset") || 0);
  g("setLyricsOffset").value = off;
  g("lyricsOffsetVal").textContent = (off > 0 ? "+" : "") + off.toFixed(2) + "s";

  const cf = parseInt(localStorage.getItem("crossfade") || 0);
  g("setCrossfade").value = cf;
  g("crossfadeVal").textContent = cf ? cf + "s" : "off";
}

/* status line for the random-wallpaper folder — local picked folder or server path */
async function updateRandomWallHint() {
  const el = document.getElementById("setRandomHint");
  if (!el) return;
  const esc = (s) => String(s).replace(/</g, "&lt;");

  // 1) a folder the user picked in-browser (File System Access)
  if (localStorage.getItem("wallSource") === "local") {
    try {
      const handle = await idbGet("wallDirHandle");
      if (handle) {
        const n = await THEME.countLocal(handle);
        const granted = (await handle.queryPermission({ mode: "read" })) === "granted";
        el.innerHTML =
          `folder: <b>${esc(handle.name)}</b> — ${n} wallpaper${n !== 1 ? "s" : ""}` +
          (granted ? "" : ' — <i>click “choose folder” to re-allow access</i>');
        return;
      }
    } catch {}
  }

  // 2) a path the local server reads
  const rec = "choose a folder of images / videos — a random one loads on every new tab";
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 1500);
    const res = await fetch("http://127.0.0.1:5055/api/wallpaper/list", { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) throw 0;
    const d = await res.json();
    const input = document.getElementById("setWallFolder");
    if (input && !input.matches(":focus") && !input.dataset.dirty) input.value = d.folder;
    if (localStorage.getItem("wallSource") === "server") {
      el.innerHTML = d.exists
        ? `reading <b>${esc(d.folder)}</b> — ${d.images.length} image${d.images.length !== 1 ? "s" : ""}, ${d.videos.length} video${d.videos.length !== 1 ? "s" : ""}`
        : `folder not found: <b>${esc(d.folder)}</b> — check the path`;
    } else {
      el.innerHTML = rec;
    }
  } catch {
    el.innerHTML = rec;
  }
}

/* the user picks ANY folder — send it to the server, which persists it */
async function saveWallFolder() {
  const input = document.getElementById("setWallFolder");
  const path = input.value.trim();
  if (!path) return;
  try {
    const res = await fetch("http://127.0.0.1:5055/api/wallpaper/folder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
    const d = await res.json().catch(() => ({}));
    if (res.ok && d.ok) {
      delete input.dataset.dirty;
      localStorage.setItem("wallSource", "server");
      localStorage.setItem("randomWall", "1");
      const img = d.images || 0, vid = d.videos || 0; // /folder returns counts
      toast(img + vid ? `folder set — ${img} images, ${vid} videos` : "folder set — but it has no images/videos");
      await THEME.applyRandomWallpaper(true);
    } else {
      toast(d.error === "folder not found" ? "folder not found — check the path" : "could not set folder");
    }
  } catch {
    toast("music server offline — start backend/run.bat");
  }
  updateRandomWallHint();
}

function applyVideoVolume() {
  const v = document.getElementById("bgVideo");
  if (!v) return;
  const vol = parseFloat(localStorage.getItem("vol") ?? 0);
  v.volume = vol;
  v.muted = vol === 0;
}

function setupSettings() {
  const g = (id) => document.getElementById(id);
  applyVideoVolume();
  applyDisplay();

  // display: size / weight / board width / open-in-new-tab
  g("setSize").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    localStorage.setItem("uiSize", b.dataset.v); applyDisplay(); setSegOn("setSize", b.dataset.v);
  });
  g("setWeight").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    localStorage.setItem("uiWeight", b.dataset.v); applyDisplay(); setSegOn("setWeight", b.dataset.v);
  });
  g("setColW").addEventListener("input", (e) => {
    localStorage.setItem("colW", e.target.value);
    document.documentElement.style.setProperty("--col-w", e.target.value + "px");
    g("colwVal").textContent = e.target.value + "px";
  });
  g("setNewTab").addEventListener("change", (e) => {
    if (e.target.checked) localStorage.setItem("openNewTab", "1");
    else localStorage.removeItem("openNewTab");
  });

  g("settingsBtn").addEventListener("click", () => openSettings());
  g("setClose").addEventListener("click", () => openSettings(false));
  g("settings").addEventListener("click", (e) => { if (e.target.id === "settings") openSettings(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") openSettings(false); });

  g("setWall").addEventListener("click", () => THEME.pickWallpaper());
  g("setWallReset").addEventListener("click", () => THEME.resetWallpaper());
  g("setAccentAuto").addEventListener("click", () => { localStorage.removeItem("accent"); THEME.autoAccent(); });
  g("setAccent").addEventListener("input", (e) => THEME.applyAccentHex(e.target.value));
  g("setDim").addEventListener("input", (e) => {
    document.documentElement.style.setProperty("--dim", e.target.value);
    localStorage.setItem("dim", e.target.value);
    const s = document.getElementById("slDim"); if (s) s.value = e.target.value;
  });
  g("setBlur").addEventListener("input", (e) => {
    document.documentElement.style.setProperty("--blur", e.target.value + "px");
    localStorage.setItem("blur", e.target.value);
    const s = document.getElementById("slBlur"); if (s) s.value = e.target.value;
  });
  g("setVol").addEventListener("input", (e) => {
    localStorage.setItem("vol", e.target.value);
    applyVideoVolume();
  });

  g("setPet").addEventListener("change", (e) => {
    const pet = document.getElementById("pet");
    if (e.target.checked) { localStorage.removeItem("petOff"); pet.classList.remove("hidden"); }
    else { localStorage.setItem("petOff", "1"); pet.classList.add("hidden"); }
  });
  g("setAutodj").addEventListener("change", (e) => {
    if (e.target.checked) localStorage.removeItem("autodjOff"); else localStorage.setItem("autodjOff", "1");
  });
  g("setPulse").addEventListener("change", (e) => {
    if (e.target.checked) localStorage.removeItem("pulseOff");
    else { localStorage.setItem("pulseOff", "1"); if (typeof stopPulse === "function") stopPulse(); }
  });
  g("setVisited").addEventListener("change", (e) => {
    localStorage.setItem("topHidden", e.target.checked ? "0" : "1");
    if (typeof renderTopSites === "function") renderTopSites();
  });

  g("setRandomWall").addEventListener("change", async (e) => {
    g("setRandomTypeRow").style.display = e.target.checked ? "" : "none";
    if (e.target.checked) {
      localStorage.setItem("randomWall", "1");
      const hasFolder = !!localStorage.getItem("wallSource");
      const ok = hasFolder && (await THEME.applyRandomWallpaper(true));
      if (ok) toast("random wallpaper on");
      else toast('random wallpaper on — now click “choose folder”');
      updateRandomWallHint();
    } else {
      localStorage.removeItem("randomWall");
      THEME.init(); // back to the saved wallpaper
      toast("random wallpaper off");
    }
  });
  g("setRandomType").addEventListener("change", async (e) => {
    localStorage.setItem("randomWallType", e.target.value);
    if (localStorage.getItem("randomWall") === "1") await THEME.applyRandomWallpaper();
  });
  g("setLyrics").addEventListener("change", (e) => {
    g("lyricsSettings").style.display = e.target.checked ? "" : "none";
    if (e.target.checked) {
      localStorage.setItem("lyricsOn", "1");
      LYRICS.applyStyle();
      if (typeof updateNowPlaying === "function") updateNowPlaying();
      toast("lyrics on");
    } else {
      localStorage.removeItem("lyricsOn");
      LYRICS.hide();
      toast("lyrics off");
    }
  });
  g("setLyricsSize").addEventListener("input", (e) => {
    localStorage.setItem("lyricsSize", e.target.value); LYRICS.applyStyle();
  });
  g("setLyricsAnim").addEventListener("change", (e) => {
    localStorage.setItem("lyricsAnim", e.target.value); LYRICS.applyStyle();
  });
  g("setLyricsPos").addEventListener("change", (e) => {
    localStorage.setItem("lyricsPos", e.target.value); LYRICS.applyStyle();
  });
  g("setLyricsColor").addEventListener("change", (e) => {
    localStorage.setItem("lyricsColor", e.target.value); LYRICS.applyStyle();
  });
  g("setLyricsOffset").addEventListener("input", (e) => {
    localStorage.setItem("lyricsOffset", e.target.value);
    const v = parseFloat(e.target.value);
    g("lyricsOffsetVal").textContent = (v > 0 ? "+" : "") + v.toFixed(2) + "s";
  });
  g("setCrossfade").addEventListener("input", (e) => {
    localStorage.setItem("crossfade", e.target.value);
    g("crossfadeVal").textContent = +e.target.value ? e.target.value + "s" : "off";
  });
  g("setLyricsFont").addEventListener("click", () => {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = ".ttf,.otf,.woff,.woff2,font/*";
    inp.onchange = async () => {
      const f = inp.files[0]; if (!f) return;
      const ok = await LYRICS.setFont(f);
      g("lyricsFontHint").textContent = ok ? "font: " + f.name : "could not load that font";
      toast(ok ? "lyrics font set" : "font failed");
    };
    inp.click();
  });
  g("setLyricsFontReset").addEventListener("click", async () => {
    await LYRICS.clearFont();
    g("lyricsFontHint").textContent = "upload a .ttf / .otf / .woff to style the lyrics";
    toast("default font");
  });

  g("setWallChoose").addEventListener("click", async () => {
    await THEME.chooseWallpaperFolder();
    g("setRandomWall").checked = localStorage.getItem("randomWall") === "1";
    g("setRandomTypeRow").style.display = g("setRandomWall").checked ? "" : "none";
    updateRandomWallHint();
  });
  g("setWallFolder").addEventListener("input", (e) => { e.target.dataset.dirty = "1"; });
  g("setWallFolder").addEventListener("keydown", (e) => { if (e.key === "Enter") saveWallFolder(); });
  g("setWallFolderSave").addEventListener("click", saveWallFolder);

  g("setName").addEventListener("change", (e) => {
    const v = e.target.value.trim();
    localStorage.setItem("name", v);
    if (typeof SETTINGS !== "undefined") SETTINGS.name = v;
    if (typeof setGreeting === "function") setGreeting();
  });
  g("setCity").addEventListener("change", (e) => {
    const v = e.target.value.trim();
    localStorage.setItem("city", v);
    if (typeof SETTINGS !== "undefined") SETTINGS.city = v;
    if (typeof loadWeather === "function") loadWeather();
  });

  const reset = g("setReset");
  reset.addEventListener("click", () => {
    if (reset.dataset.arm) { localStorage.clear(); location.reload(); }
    else {
      reset.dataset.arm = "1"; reset.textContent = "sure? this wipes everything — click again";
      reset.classList.add("armed");
      setTimeout(() => { delete reset.dataset.arm; reset.textContent = "reset all settings"; reset.classList.remove("armed"); }, 3000);
    }
  });
}

/* ---------- shortcuts + boot ---------- */
function setupExtras() {
  setupNotes();
  setupTodos();
  setupMiniPlayer();
  setupPet();
  setupPulse();
  setupCalPop();
  setupSnips();
  setupBriefing();
  setupPhone();
  setupSettings();
  if (typeof LYRICS !== "undefined") LYRICS.init();
  applyDayMood();
  setInterval(applyDayMood, 10 * 60 * 1000);

  // calendar card on the main screen
  renderCalendarCard();

  document.getElementById("btnNotes").addEventListener("click", () => openPanel("notes"));
  document.getElementById("btnTodo").addEventListener("click", () => openPanel("todo"));
  document.getElementById("spClose").addEventListener("click", closePanel);
  document.querySelectorAll(".sp-tab").forEach((t) =>
    t.addEventListener("click", () => switchPanelTab(t.dataset.sp))
  );

  document.addEventListener("keydown", (e) => {
    if (e.altKey && e.key.toLowerCase() === "n") { e.preventDefault(); openPanel("notes"); }
    if (e.altKey && e.key.toLowerCase() === "t") { e.preventDefault(); openPanel("todo"); }
    if (e.key === "Escape") { closePanel(); openCalPop(false); }
  });
}
