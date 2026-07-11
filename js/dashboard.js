/* =========================================================
   dashboard.js — Alt+D dashboard (Caelestia style)
   Panes: Dashboard (weather, profile, calendar, sliders)
          Media (wallpaper + local music player)
          System (battery, storage, memory, network)
   ========================================================= */

/* ---------- open / close ---------- */
function toggleDock(force) {
  const dash = document.getElementById("dock");
  const show = force !== undefined ? force : dash.classList.contains("hidden");
  dash.classList.toggle("hidden", !show);
  if (show) {
    refreshDashboard();
    refreshSystem();
  }
}

function setupDashboard() {
  // restore sliders (dim / blur) even before dashboard is opened
  const dim = localStorage.getItem("dim");
  const blur = localStorage.getItem("blur");
  if (dim !== null) document.documentElement.style.setProperty("--dim", dim);
  if (blur !== null) document.documentElement.style.setProperty("--blur", blur + "px");

  sessionHeartbeat();
  buildCalendar();
  buildDockLinks();
  setupDashTabs();
  setupSliders();
  setupProfile();
  setupMedia();
  setupTabAudio();
  setupSync();

  document.addEventListener("keydown", (e) => {
    if (e.altKey && (e.key.toLowerCase() === "d" || e.key.toLowerCase() === "k")) {
      e.preventDefault();
      toggleDock();
    }
    if (e.key === "Escape") toggleDock(false);
  });
}

/* ---------- pane tabs ---------- */
function setupDashTabs() {
  document.querySelectorAll(".dash-tab").forEach((t) => {
    t.addEventListener("click", () => {
      document.querySelectorAll(".dash-tab").forEach((x) => x.classList.toggle("active", x === t));
      document.querySelectorAll(".dash-pane").forEach((p) =>
        p.classList.toggle("hidden", p.id !== "pane-" + t.dataset.pane)
      );
      if (t.dataset.pane === "system") { refreshSystem(); startSysLoop(); }
      if (t.dataset.pane === "media") refreshTabAudio();
    });
  });
}

/* ---------- audio playing in your other browser tabs ---------- */
function taEsc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function setupTabAudio() {
  const btn = document.getElementById("taRefresh");
  if (btn) btn.addEventListener("click", refreshTabAudio);
  try {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.type === "media-changed") refreshTabAudio();
    });
  } catch {}
  refreshTabAudio();
}

function refreshTabAudio() {
  const wrap = document.getElementById("tabAudio");
  if (!wrap) return;
  try {
    chrome.runtime.sendMessage({ type: "media-list" }, (res) => {
      if (chrome.runtime.lastError) { wrap.classList.add("hidden"); return; }
      renderTabAudio((res && res.tabs) || []);
    });
  } catch { wrap.classList.add("hidden"); }
}

function renderTabAudio(tabs) {
  const wrap = document.getElementById("tabAudio");
  const list = document.getElementById("taList");
  if (!wrap || !list) return;
  if (!tabs.length) { wrap.classList.add("hidden"); list.innerHTML = ""; return; }
  wrap.classList.remove("hidden");

  const soundIco = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14"/></svg>`;
  const mutedIco = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="m17 9 5 6M22 9l-5 6"/></svg>`;
  const playIco = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.6v12.8a1 1 0 0 0 1.5.9l10.2-6.4a1 1 0 0 0 0-1.7L9.5 4.7A1 1 0 0 0 8 5.6z"/></svg>`;

  list.innerHTML = tabs.map((t) => {
    let host = "";
    try { host = new URL(t.url).hostname.replace(/^www\./, ""); } catch {}
    const fav = t.favIconUrl
      ? `<img class="ta-fav" src="${taEsc(t.favIconUrl)}" alt="" onerror="this.classList.add('ta-fav-x');this.removeAttribute('src')"/>`
      : `<span class="ta-fav ta-fav-x">♪</span>`;
    return `
      <div class="ta-item" data-id="${t.id}">
        ${fav}
        <div class="ta-meta" data-act="focus" title="go to this tab">
          <div class="ta-name">${taEsc(t.title)}</div>
          <div class="ta-host">${taEsc(host)}</div>
        </div>
        <div class="ta-ctl">
          <button class="ta-btn" data-act="toggle" title="play / pause">${playIco}</button>
          <button class="ta-btn ${t.muted ? "on" : ""}" data-act="mute" title="${t.muted ? "unmute" : "mute"}">${t.muted ? mutedIco : soundIco}</button>
        </div>
      </div>`;
  }).join("");

  list.querySelectorAll(".ta-item").forEach((it) => {
    const id = +it.dataset.id;
    it.querySelector('[data-act="toggle"]').addEventListener("click", () => {
      try { chrome.runtime.sendMessage({ type: "media-toggle", id }, () => void chrome.runtime.lastError); } catch {}
    });
    it.querySelector('[data-act="mute"]').addEventListener("click", (e) => {
      const on = e.currentTarget.classList.contains("on");
      try {
        chrome.runtime.sendMessage({ type: "media-mute", id, muted: !on }, () => {
          void chrome.runtime.lastError;
          setTimeout(refreshTabAudio, 150);
        });
      } catch {}
    });
    it.querySelector('[data-act="focus"]').addEventListener("click", () => {
      try { chrome.runtime.sendMessage({ type: "media-focus", id }, () => void chrome.runtime.lastError); } catch {}
    });
  });
}

/* ---------- dashboard pane ---------- */
function refreshDashboard() {
  // date card
  const now = new Date();
  document.getElementById("dashDay").textContent = String(now.getDate()).padStart(2, "0");
  document.getElementById("dashMon").textContent = String(now.getMonth() + 1).padStart(2, "0");
  document.getElementById("dashWd").textContent =
    now.toLocaleDateString([], { weekday: "short" }) + ", " + now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  // weather mirror from topbar
  document.getElementById("dashTemp").textContent = document.getElementById("temp").textContent;
  document.getElementById("dashCond").textContent = document.getElementById("cond").textContent.toLowerCase() || "···";

  // session uptime
  const start = +localStorage.getItem("sessionStart") || Date.now();
  const mins = Math.floor((Date.now() - start) / 60000);
  const h = Math.floor(mins / 60), m = mins % 60;
  document.getElementById("profUp").textContent =
    "up " + (h ? h + " hour" + (h > 1 ? "s" : "") + ", " : "") + m + " minute" + (m !== 1 ? "s" : "");
}

/* browser "session" — heartbeat so a browser restart resets it */
function sessionHeartbeat() {
  const last = +localStorage.getItem("lastSeen") || 0;
  if (Date.now() - last > 5 * 60 * 1000) localStorage.setItem("sessionStart", Date.now());
  localStorage.setItem("lastSeen", Date.now());
  setInterval(() => localStorage.setItem("lastSeen", Date.now()), 30000);
}

/* ---------- profile card ---------- */
function setupProfile() {
  // browser + os from user agent
  const ua = navigator.userAgent;
  let browser = "Chromium";
  if (navigator.brave) browser = "Brave";
  else if (ua.includes("Edg/")) browser = "Edge";
  else if (ua.includes("Chrome/")) browser = "Chrome";
  let os = "Unknown";
  if (ua.includes("Windows")) os = "Windows";
  else if (ua.includes("Mac")) os = "macOS";
  else if (ua.includes("Android")) os = "Android";
  else if (ua.includes("Linux")) os = "Linux";
  document.getElementById("profBrowser").textContent = browser;
  document.getElementById("profOs").textContent = os;

  // avatar: saved in IndexedDB, click to change
  const av = document.getElementById("avatar");
  idbGet("avatar").then((d) => { if (d) av.src = d; }).catch(() => {});
  av.addEventListener("click", () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = async () => {
      const f = input.files[0];
      if (!f) return;
      try {
        const dataUrl = await readFile(f);
        const small = await shrinkImage(dataUrl, 128, 0.9);
        await idbSet("avatar", small);
        av.src = small;
        toast("avatar set");
      } catch (e) { toast("avatar failed"); }
    };
    input.click();
  });
}

/* ---------- calendar ---------- */
function buildCalendar() {
  const el = document.getElementById("calendar");
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const today = now.getDate();

  const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  let html = days.map((d) => `<span class="cal-h">${d}</span>`).join("");

  const first = new Date(y, m, 1);
  let startDow = (first.getDay() + 6) % 7; // Mon = 0
  const dim = new Date(y, m + 1, 0).getDate();
  const prevDim = new Date(y, m, 0).getDate();

  let cells = [];
  for (let i = startDow - 1; i >= 0; i--) cells.push({ d: prevDim - i, out: true });
  for (let d = 1; d <= dim; d++) cells.push({ d, out: false, today: d === today });
  let next = 1;
  while (cells.length % 7 !== 0) cells.push({ d: next++, out: true });

  html += cells
    .map((c) => `<span class="cal-d ${c.out ? "out" : ""} ${c.today ? "today" : ""}">${c.d}</span>`)
    .join("");
  el.innerHTML = html;
}

/* ---------- sliders: dim / blur / video volume ---------- */
function fillSlider(el) {
  const min = +el.min || 0, max = +el.max || 1;
  const p = ((+el.value - min) / (max - min)) * 100;
  el.style.setProperty("--p", p + "%");
}

function setupSliders() {
  const dim = document.getElementById("slDim");
  if (!dim) return; // theme sliders moved to the settings panel
  const blur = document.getElementById("slBlur");
  const vol = document.getElementById("slVol");

  dim.value = localStorage.getItem("dim") ?? 1;
  blur.value = parseInt(localStorage.getItem("blur") ?? 18);
  [dim, blur, vol].forEach(fillSlider);

  dim.addEventListener("input", () => {
    document.documentElement.style.setProperty("--dim", dim.value);
    localStorage.setItem("dim", dim.value);
    fillSlider(dim);
  });
  blur.addEventListener("input", () => {
    document.documentElement.style.setProperty("--blur", blur.value + "px");
    localStorage.setItem("blur", blur.value);
    fillSlider(blur);
  });
  vol.addEventListener("input", () => {
    const v = document.getElementById("bgVideo");
    v.volume = +vol.value;
    v.muted = +vol.value === 0;
    fillSlider(vol);
  });
}

/* ---------- pinned links ---------- */
function buildDockLinks() {
  const linksEl = document.getElementById("dockLinks");
  const pinned = (typeof DOCK !== "undefined" ? DOCK : []).slice(0, 8);
  linksEl.innerHTML = pinned
    .map((l) => `
      <a class="dock-link" href="${l.url}" title="${l.name}">
        <span class="dock-icon">${l.name.charAt(0).toUpperCase()}</span>
        <span class="dock-name">${l.name}</span>
      </a>`)
    .join("");
}

/* =========================================================
   MEDIA pane — wallpaper buttons + local music player
   ========================================================= */
const PLAYER = { songs: [], server: [], idx: -1, stream: null, queue: [], audio: new Audio() };

/* ----- queue: songs wait in line, play one after another ----- */
function enqueue(item) {
  PLAYER.queue.push(item);
  renderQueue();
  toast("queued · " + item.name);
  if (typeof updateMini === "function") updateMini();
}

function playQueuedItem(item) {
  PLAYER.stream = { name: item.name, remote: true };
  PLAYER.idx = -1;
  PLAYER.audio.src = item.src;
  PLAYER.audio.play().catch(() => {});
  renderSongs();
  updateNowPlaying();
}

function playFromQueue() {
  const item = PLAYER.queue.shift();
  renderQueue();
  if (item) playQueuedItem(item);
}

function renderQueue() {
  const wrap = document.getElementById("queueWrap");
  const list = document.getElementById("queueList");
  if (!wrap || !list) return;
  wrap.classList.toggle("hidden", !PLAYER.queue.length);
  wrap.classList.toggle("collapsed", localStorage.getItem("queueCollapsed") === "1");
  document.getElementById("queueCount").textContent = PLAYER.queue.length;
  list.innerHTML = PLAYER.queue
    .map((q, i) => `
      <div class="qrow" data-i="${i}">
        <span class="q-n">${i + 1}</span>
        <span class="q-name">${escHtml(q.name)}</span>
        <button class="q-del" data-i="${i}" title="remove">✕</button>
      </div>`)
    .join("");
  list.querySelectorAll(".q-del").forEach((b) =>
    b.addEventListener("click", () => { PLAYER.queue.splice(+b.dataset.i, 1); renderQueue(); })
  );
}

/* build a queue item {name, src} from a library song or online result */
function songToQueueItem(s) {
  const src = s.serverId ? MusicSource.api.streamUrl(s.serverId) : URL.createObjectURL(s.blob);
  return { name: s.name, src };
}

/* ----- remote playback (backend-resolved online tracks) ----- */
function playStream(s) {
  PLAYER.stream = s;
  PLAYER.idx = -1;
  PLAYER.audio.src = s.url;
  PLAYER.audio.play()
    .then(() => toast("streaming · " + s.name))
    .catch(() => { toast("stream failed"); PLAYER.stream = null; });
  renderSongs();
  updateNowPlaying();
}

/* ----- online search: backend resolves + proxies the audio ----- */
function escHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function fmtDur(s) {
  if (!s) return "";
  s = Math.round(s);
  return Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
}

async function searchOnline(q) {
  const el = document.getElementById("ytResults");
  if (!el) return;
  if (typeof MusicSource === "undefined" || !MusicSource.online) {
    el.innerHTML = `<div class="song-empty">music server offline — start backend/run.bat</div>`;
    return;
  }
  el.innerHTML = `<div class="song-empty">searching…</div>`;
  try {
    const { results } = await MusicSource.api.remoteSearch(q);
    if (!results.length) {
      el.innerHTML = `<div class="song-empty">nothing found</div>`;
      return;
    }
    el.innerHTML = results
      .map((r, i) => `
        <div class="stream" data-i="${i}">
          <span class="stream-dot"></span>
          <span class="stream-name">${escHtml(r.title)}</span>
          <span class="yt-dur">${fmtDur(r.duration)}</span>
          ${r.inLibrary
            ? `<span class="in-lib" title="in your library">✓</span>`
            : `<button class="song-dl" data-i="${i}" title="download to library">⤓</button>`}
          <button class="song-q" data-i="${i}" title="add to queue">＋</button>
        </div>`)
      .join("");
    el.querySelectorAll(".stream").forEach((row) =>
      row.addEventListener("click", () => playRemote(results[+row.dataset.i]))
    );
    el.querySelectorAll(".song-q").forEach((b) =>
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        const r = results[+b.dataset.i];
        enqueue({ name: r.title, src: MusicSource.api.remoteStreamUrl(r.id) });
      })
    );
    el.querySelectorAll(".song-dl").forEach((b) =>
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        downloadRemote(results[+b.dataset.i], b);
      })
    );
  } catch {
    el.innerHTML = `<div class="song-empty">search failed — server running?</div>`;
  }
}

function playRemote(r) {
  playStream({ name: r.title, url: MusicSource.api.remoteStreamUrl(r.id), remote: true });
}

async function downloadRemote(r, btn) {
  if (typeof MusicSource === "undefined" || !MusicSource.online) {
    toast("music server offline");
    return;
  }
  if (btn) { btn.textContent = "…"; btn.disabled = true; }
  toast("downloading " + r.title);
  try {
    const started = await MusicSource.api.remoteDownload(r.id);
    if (!started) throw new Error("start failed");

    // poll progress
    let done = false;
    while (!done) {
      await new Promise((res) => setTimeout(res, 700));
      const { state, percent, error } = await MusicSource.api.remoteDownloadStatus(r.id);
      if (state === "downloading") {
        if (btn) btn.textContent = `${Math.round(percent)}%`;
      } else if (state === "done") {
        done = true;
        if (btn) btn.textContent = "✓";
        toast("downloaded ✓ — added to library");
        if (typeof loadServerTracks === "function") loadServerTracks();
      } else {
        done = true;
        if (btn) btn.textContent = "⤓";
        toast(error ? "download failed: " + error.slice(0, 80) : "download failed");
      }
    }
  } catch {
    toast("download failed");
    if (btn) btn.textContent = "⤓";
  } finally {
    if (btn) btn.disabled = false;
  }
}

/* used by the >queue command: search and queue the top hit */
async function queueOnlineFirst(q) {
  if (typeof MusicSource === "undefined" || !MusicSource.online)
    return toast("music server offline — start backend/run.bat");
  try {
    const { results } = await MusicSource.api.remoteSearch(q);
    if (!results.length) return toast("nothing found");
    const r = results[0];
    enqueue({ name: r.title, src: MusicSource.api.remoteStreamUrl(r.id) });
  } catch {
    toast("search failed");
  }
}

/* used by the >play command: search and play the top hit */
async function playOnlineFirst(q) {
  if (typeof MusicSource === "undefined" || !MusicSource.online)
    return toast("music server offline — start backend/run.bat");
  toast("searching · " + q);
  try {
    const { results } = await MusicSource.api.remoteSearch(q);
    if (!results.length) return toast("nothing found");
    playRemote(results[0]);
  } catch {
    toast("search failed");
  }
}

/* combined playlist: server tracks first, then local files */
function playlist() {
  return PLAYER.server.concat(PLAYER.songs);
}

/* ping the NullTab music server; if it's up, pull its library in */
async function loadServerTracks() {
  if (typeof MusicSource === "undefined") return;
  try {
    const online = await MusicSource.init();
    if (!online) return;
    const tracks = await MusicSource.listServerTracks();
    PLAYER.server = tracks.map((t) => ({
      name: t.artist && t.artist !== "Unknown Artist" ? `${t.artist} — ${t.title}` : t.title,
      serverId: t.id,
      art: t.art,
      duration: t.duration,
    }));
    const sub = document.querySelector(".cm-sub");
    if (sub) sub.textContent = `music server · ${PLAYER.server.length} tracks`;
    renderSongs();
  } catch { /* server offline — local player carries on */ }
}

function setupMedia() {
  document.getElementById("mWall")?.addEventListener("click", () => THEME.pickWallpaper());
  document.getElementById("mWallReset")?.addEventListener("click", () => THEME.resetWallpaper());
  document.getElementById("mAddSongs").addEventListener("click", addSongs);
  document.getElementById("mClearSongs").addEventListener("click", async () => {
    PLAYER.audio.pause();
    PLAYER.songs = []; PLAYER.idx = -1;
    await idbDel("songs");
    renderSongs(); updateNowPlaying();
    toast("local songs cleared");
  });
  document.getElementById("mPrev").addEventListener("click", () => playIndex(PLAYER.idx - 1));
  document.getElementById("mNext").addEventListener("click", () => playIndex(PLAYER.idx + 1));
  document.getElementById("mPlay").addEventListener("click", () => {
    if (PLAYER.idx < 0 && !PLAYER.stream && playlist().length) return playIndex(0);
    if (PLAYER.audio.paused) PLAYER.audio.play(); else PLAYER.audio.pause();
  });

  // dashboard media card mirrors the player
  document.getElementById("cmPrev").addEventListener("click", () => playIndex(PLAYER.idx - 1));
  document.getElementById("cmNext").addEventListener("click", () => playIndex(PLAYER.idx + 1));
  document.getElementById("cmPlay").addEventListener("click", () => {
    if (PLAYER.idx < 0 && !PLAYER.stream && playlist().length) return playIndex(0);
    if (PLAYER.audio.paused) PLAYER.audio.play(); else PLAYER.audio.pause();
  });

  PLAYER.audio.addEventListener("ended", () => {
    if (PLAYER.queue.length) return playFromQueue();
    if (!PLAYER.stream) playIndex(PLAYER.idx + 1);
  });

  document.getElementById("queueClear").addEventListener("click", (e) => {
    e.stopPropagation();
    PLAYER.queue = []; renderQueue(); toast("queue cleared");
  });

  // collapse / expand the up-next queue (arrow on the left)
  const qToggle = () => {
    const collapsed = localStorage.getItem("queueCollapsed") === "1";
    localStorage.setItem("queueCollapsed", collapsed ? "0" : "1");
    document.getElementById("queueWrap").classList.toggle("collapsed", !collapsed);
  };
  const qt = document.getElementById("queueToggle");
  qt.addEventListener("click", qToggle);
  qt.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); qToggle(); } });
  PLAYER.audio.addEventListener("play", updateNowPlaying);
  PLAYER.audio.addEventListener("pause", updateNowPlaying);

  // progress + seek
  const seek = document.getElementById("mSeek");
  const curEl = document.getElementById("mCur");
  const durEl = document.getElementById("mDur");
  const setProg = () => {
    const d = PLAYER.audio.duration;
    curEl.textContent = fmtDur(PLAYER.audio.currentTime) || "0:00";
    if (isFinite(d) && d > 0) {
      durEl.textContent = fmtDur(d) || "0:00";
      const p = (PLAYER.audio.currentTime / d) * 100;
      seek.value = p * 10;
      seek.style.setProperty("--p", p + "%");
    } else {
      durEl.textContent = "–:––";
      seek.value = 0;
      seek.style.setProperty("--p", "0%");
    }
  };
  PLAYER.audio.addEventListener("timeupdate", setProg);
  PLAYER.audio.addEventListener("loadedmetadata", setProg);
  PLAYER.audio.addEventListener("emptied", setProg);
  seek.addEventListener("input", () => {
    const d = PLAYER.audio.duration;
    if (isFinite(d) && d > 0) PLAYER.audio.currentTime = (seek.value / 1000) * d;
  });

  // library / online source switcher
  document.querySelectorAll(".msw").forEach((b) =>
    b.addEventListener("click", () => {
      document.querySelectorAll(".msw").forEach((x) => x.classList.toggle("active", x === b));
      document.getElementById("srcLibrary").classList.toggle("hidden", b.dataset.src !== "library");
      document.getElementById("srcOnline").classList.toggle("hidden", b.dataset.src !== "online");
      document.getElementById("libActs").classList.toggle("hidden", b.dataset.src !== "library");
      if (b.dataset.src === "online") document.getElementById("ytQuery").focus();
    })
  );

  // online search
  const ytQ = document.getElementById("ytQuery");
  document.getElementById("ytSearchBtn").addEventListener("click", () => {
    const q = ytQ.value.trim();
    if (q) searchOnline(q);
  });
  ytQ.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const q = ytQ.value.trim();
      if (q) searchOnline(q);
    }
  });

  idbGet("songs").then((s) => { if (s) { PLAYER.songs = s; renderSongs(); } }).catch(() => {});
  loadServerTracks();
  setupAutoDj();
}

/* Auto-DJ — music follows what you do (background.js sends the context) */
function handleAutoDj(ctx) {
  if (localStorage.getItem("autodjOff")) return;
  if (ctx === "code") {
    if (PLAYER.audio.paused) {
      if (PLAYER.idx >= 0 || PLAYER.stream) PLAYER.audio.play().catch(() => {});
      else if (playlist().length) playIndex(0);
    }
    PLAYER.autodjPaused = false;
  } else if (ctx === "video") {
    if (!PLAYER.audio.paused) { PLAYER.audio.pause(); PLAYER.autodjPaused = true; }
  }
}

function setupAutoDj() {
  try {
    chrome.runtime.onMessage.addListener((msg) => {
      if (msg && msg.type === "autodj") handleAutoDj(msg.context);
    });
  } catch {}
}

function toggleAutoDj() {
  if (localStorage.getItem("autodjOff")) { localStorage.removeItem("autodjOff"); toast("auto-dj on — music follows you"); }
  else { localStorage.setItem("autodjOff", "1"); toast("auto-dj off"); }
}

function addSongs() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "audio/*";
  input.multiple = true;
  input.onchange = async () => {
    const files = [...input.files];
    if (!files.length) return;
    for (const f of files) {
      if (f.size > 60 * 1024 * 1024) { toast(f.name + " too big (60MB max)"); continue; }
      PLAYER.songs.push({ name: f.name.replace(/\.[^.]+$/, ""), blob: f });
    }
    try { await idbSet("songs", PLAYER.songs); toast("songs added"); }
    catch (e) { toast("could not save songs"); }
    renderSongs();
  };
  input.click();
}

function playIndex(i) {
  const list = playlist();
  if (!list.length) return;
  PLAYER.stream = null;
  PLAYER.idx = (i + list.length) % list.length;
  const song = list[PLAYER.idx];
  PLAYER.audio.src = song.serverId
    ? MusicSource.api.streamUrl(song.serverId)
    : URL.createObjectURL(song.blob);
  PLAYER.audio.play().catch(() => {});
  renderSongs();
  updateNowPlaying();
}

function renderSongs() {
  const el = document.getElementById("songList");
  const list = playlist();
  if (!list.length) {
    el.innerHTML = `<div class="song-empty">no songs — add some, or start the music server</div>`;
    return;
  }
  el.innerHTML = list
    .map((s, i) => `
      <div class="song ${i === PLAYER.idx ? "playing" : ""}" data-i="${i}">
        <span class="song-n">${s.serverId ? "♪" : i + 1}</span>
        <span class="song-name">${escHtml(s.name)}</span>
        <span class="song-dur">${fmtDur(s.duration)}</span>
        <button class="song-q" data-i="${i}" title="add to queue">＋</button>
      </div>`)
    .join("");
  el.querySelectorAll(".song").forEach((s) =>
    s.addEventListener("click", () => playIndex(+s.dataset.i))
  );
  el.querySelectorAll(".song-q").forEach((b) =>
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      enqueue(songToQueueItem(list[+b.dataset.i]));
    })
  );
}

function updateNowPlaying() {
  const list = playlist();
  const song = PLAYER.idx >= 0 ? list[PLAYER.idx] : null;
  const playing = (!!song || !!PLAYER.stream) && !PLAYER.audio.paused;
  const title = PLAYER.stream
    ? (PLAYER.stream.remote ? PLAYER.stream.name : "live · " + PLAYER.stream.name)
    : song ? song.name : "nothing playing";
  document.getElementById("mTitle").textContent = title;
  document.getElementById("mSrc").textContent = PLAYER.stream
    ? "streaming online"
    : song ? (song.serverId ? "music server" : "local file") : "pick a song below";
  document.getElementById("mPlay").classList.toggle("playing", playing);
  document.getElementById("mBars").classList.toggle("on", playing);
  document.getElementById("mArtBox").classList.toggle("on", playing);
  publishMediaSession(song, title, playing);
  if (typeof LYRICS !== "undefined") LYRICS.onTrack(song, title);
  // dashboard card
  document.getElementById("cmTitle").textContent = title;
  document.getElementById("cmPlay").classList.toggle("playing", playing);
  const artEl = document.getElementById("cmArt");
  artEl.classList.toggle("spin", playing);
  if (song && song.art) {
    artEl.style.backgroundImage = `url("${song.art}")`;
    artEl.style.backgroundSize = "cover";
    artEl.style.backgroundPosition = "center";
  } else {
    artEl.style.backgroundImage = "";
  }
}

/* Publish to the OS media controls (Windows SMTC) so the Nyx Vinyl HUD and the
   system media flyout see whatever Nyx is playing, and can control it. */
let MS_WIRED = false;
function publishMediaSession(song, title, playing) {
  if (!("mediaSession" in navigator)) return;
  try {
    if (!MS_WIRED) {
      const tap = (id) => () => document.getElementById(id)?.click();
      navigator.mediaSession.setActionHandler("play", tap("mPlay"));
      navigator.mediaSession.setActionHandler("pause", tap("mPlay"));
      navigator.mediaSession.setActionHandler("previoustrack", tap("mPrev"));
      navigator.mediaSession.setActionHandler("nexttrack", tap("mNext"));
      MS_WIRED = true;
    }

    const active = !!song || !!PLAYER.stream;
    if (active) syncPublishState(song, title, playing);
    navigator.mediaSession.playbackState = playing ? "playing" : active ? "paused" : "none";

    if (active) {
      const artwork = [];
      if (song && song.art) artwork.push({ src: song.art, sizes: "512x512", type: "image/png" });
      navigator.mediaSession.metadata = new MediaMetadata({
        title: title || "Nyx",
        artist: (song && song.artist) || (PLAYER.stream && PLAYER.stream.remote ? "online" : "Nyx"),
        album: (song && song.album) || "Nyx",
        artwork,
      });

      const d = PLAYER.audio.duration, p = PLAYER.audio.currentTime;
      if (isFinite(d) && d > 0 && isFinite(p)) {
        try { navigator.mediaSession.setPositionState({ duration: d, position: Math.min(p, d), playbackRate: 1 }); } catch {}
      }
    }
  } catch { /* MediaSession unsupported detail — ignore */ }
}

/* =========================================================
   Sync bus — keep the browser player and the desktop Vinyl HUD
   in step through the Nyx server. The browser publishes its
   now-playing state, and runs transport commands the HUD posts.
   ========================================================= */
let SYNC_LASTCMD = 0;

function syncOk() {
  return typeof MusicSource !== "undefined" && MusicSource.api && MusicSource.online;
}

function syncPublishState(song, title, playing) {
  if (!syncOk()) return;
  const a = PLAYER.audio;
  MusicSource.api.syncState({
    owner: "browser",
    id: song && song.serverId ? song.serverId : "",
    title: title || "Nyx",
    artist: (song && song.artist) || (PLAYER.stream && PLAYER.stream.remote ? "online" : ""),
    album: (song && song.album) || "",
    duration: Math.round(isFinite(a.duration) ? a.duration : 0),
    position: isFinite(a.currentTime) ? a.currentTime : 0,
    playing: !!playing,
    hasArt: !!(song && song.art),
    artUrl: song && song.serverId ? MusicSource.api.artUrl(song.serverId) : "",
  }).catch(() => {});
}

async function syncPollCommands() {
  if (!syncOk()) return;
  try {
    const { commands, latest } = await MusicSource.api.syncPollCmds(SYNC_LASTCMD);
    if (typeof latest === "number") SYNC_LASTCMD = Math.max(SYNC_LASTCMD, latest);
    for (const c of commands || []) {
      if (c.from === "browser") continue; // don't run our own commands
      applySyncCommand(c);
    }
  } catch {}
}

function applySyncCommand(c) {
  const a = PLAYER.audio;
  const click = (id) => document.getElementById(id)?.click();
  switch (c.action) {
    case "toggle": click("mPlay"); break;
    case "play": if (a.paused) click("mPlay"); break;
    case "pause": if (!a.paused) click("mPlay"); break;
    case "next": click("mNext"); break;
    case "prev": click("mPrev"); break;
    case "seek":
      if (isFinite(a.duration) && a.duration > 0) {
        a.currentTime = Math.max(0, Math.min(c.value, a.duration));
        updateNowPlaying();
      }
      break;
  }
}

function setupSync() {
  // prime the cursor so old commands aren't replayed on load
  if (typeof MusicSource !== "undefined" && MusicSource.api) {
    MusicSource.api.syncPollCmds(0)
      .then((r) => { if (r && typeof r.latest === "number") SYNC_LASTCMD = r.latest; })
      .catch(() => {});
  }
  setInterval(syncPollCommands, 1000);
  // keep position fresh while playing
  setInterval(() => {
    if (!PLAYER.audio.paused && (PLAYER.idx >= 0 || PLAYER.stream)) {
      const list = playlist();
      const song = PLAYER.idx >= 0 ? list[PLAYER.idx] : null;
      const title = PLAYER.stream ? PLAYER.stream.name : song ? song.name : "";
      syncPublishState(song, title, true);
    }
  }, 1500);
}

/* =========================================================
   SYSTEM pane — battery, storage, memory, network
   ========================================================= */
/* friendly names for common process names */
function appLabel(p) {
  const map = {
    brave: "Brave", chrome: "Chrome", msedge: "Edge", firefox: "Firefox",
    code: "VS Code", devenv: "Visual Studio", explorer: "Explorer",
    discord: "Discord", spotify: "Spotify", steam: "Steam",
    windowsterminal: "Terminal", powershell: "PowerShell", cmd: "CMD",
    idle: "Idle",
  };
  return map[p] || p.charAt(0).toUpperCase() + p.slice(1);
}

function fmtHM(sec) {
  sec = Math.round(sec);
  const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
  return h ? h + "h " + m + "m" : m + "m";
}

let sysTimer = null;
function startSysLoop() {
  clearInterval(sysTimer);
  sysTimer = setInterval(() => {
    const dashHidden = document.getElementById("dock").classList.contains("hidden");
    const paneHidden = document.getElementById("pane-system").classList.contains("hidden");
    if (dashHidden || paneHidden) { clearInterval(sysTimer); sysTimer = null; return; }
    refreshSystem();
  }, 2000);
}

async function refreshSystem() {
  const set = (id, t) => { const el = document.getElementById(id); if (el) el.textContent = t; };
  const bar = (id, pct, danger) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.width = Math.max(0, Math.min(100, pct)) + "%";
    el.classList.toggle("danger", !!danger);
  };

  // battery
  try {
    const b = await navigator.getBattery();
    const pct = Math.round(b.level * 100);
    set("sysBat", pct + "%" + (b.charging ? " ⚡" : ""));
    bar("barBat", pct, pct <= 20 && !b.charging);
    set("hintBat", b.charging
      ? (isFinite(b.chargingTime) && b.chargingTime > 0 ? fmtHM(b.chargingTime) + " to full" : "charging")
      : (isFinite(b.dischargingTime) && b.dischargingTime > 0 ? "about " + fmtHM(b.dischargingTime) + " left" : "on battery"));
  } catch {
    set("sysBat", "n/a"); set("hintBat", "not supported"); bar("barBat", 0);
  }

  // storage (browser quota for this profile)
  try {
    const e = await navigator.storage.estimate();
    const pct = e.quota ? (e.usage / e.quota) * 100 : 0;
    set("sysStore", (e.usage / 1e6).toFixed(1) + " MB");
    set("hintStore", "of " + (e.quota / 1e9).toFixed(1) + " GB browser quota");
    bar("barStore", Math.max(pct, 1.5));
  } catch {
    set("sysStore", "n/a"); set("hintStore", "not supported"); bar("barStore", 0);
  }

  // real machine stats from the backend (cpu / ram / disk / net)
  let sys = null;
  if (typeof MusicSource !== "undefined" && MusicSource.api) {
    try {
      sys = await MusicSource.api.system();
      MusicSource.online = true;
    } catch { /* server offline — browser fallbacks below */ }
  }

  if (sys) {
    set("sysCpu", sys.cpu.toFixed(0) + "%");
    bar("barCpu", sys.cpu, sys.cpu > 90);
    set("hintCpu", sys.processes + " processes");

    const memPct = sys.mem.totalMb ? (sys.mem.usedMb / sys.mem.totalMb) * 100 : 0;
    set("sysMem", (sys.mem.usedMb / 1024).toFixed(1) + " GB");
    set("hintMem", "of " + (sys.mem.totalMb / 1024).toFixed(0) + " GB ram");
    bar("barMem", memPct, memPct > 90);

    set("sysNet", sys.net.downMbps.toFixed(1) + " Mbps");
    set("hintNet", "↓ " + sys.net.downMbps.toFixed(1) + " · ↑ " + sys.net.upMbps.toFixed(1) + " Mbps");
    bar("barNet", Math.min(100, sys.net.downMbps * 2));

    const diskPct = sys.disk.totalGb ? ((sys.disk.totalGb - sys.disk.freeGb) / sys.disk.totalGb) * 100 : 0;
    set("sysDisk", sys.disk.freeGb.toFixed(0) + " GB free");
    set("hintDisk", "of " + sys.disk.totalGb.toFixed(0) + " GB (" + (sys.disk.root || "C:") + ")");
    bar("barDisk", diskPct, sys.disk.freeGb < 20);

    // screen time today
    try {
      const st = await MusicSource.api.screenTime();
      set("stTotal", fmtHM(st.totalSec));
      const listEl = document.getElementById("stList");
      if (!st.apps.length) {
        listEl.innerHTML = `<div class="sys-hint">nothing tracked yet</div>`;
      } else {
        const top = st.apps[0].sec || 1;
        listEl.innerHTML = st.apps.slice(0, 5).map((a) => `
          <div class="st-row">
            <span class="st-name">${escHtml(appLabel(a.name))}</span>
            <span class="st-bar"><i style="width:${Math.max(4, (a.sec / top) * 100)}%"></i></span>
            <span class="st-time">${fmtHM(a.sec)}</span>
          </div>`).join("");
      }
    } catch { /* endpoint missing — old server build */ }
  } else {
    // browser-only fallbacks
    set("sysCpu", "n/a"); set("hintCpu", "start backend for real stats"); bar("barCpu", 0);
    set("sysDisk", "n/a"); set("hintDisk", "start backend for real stats"); bar("barDisk", 0);

    if (performance.memory) {
      const used = performance.memory.usedJSHeapSize;
      const lim = performance.memory.jsHeapSizeLimit;
      set("sysMem", (used / 1e6).toFixed(0) + " MB");
      set("hintMem", "js heap · of " + (lim / 1e9).toFixed(1) + " GB limit");
      bar("barMem", (used / lim) * 100);
    } else {
      set("sysMem", "n/a"); set("hintMem", "chromium only"); bar("barMem", 0);
    }

    const conn = navigator.connection || {};
    if (navigator.onLine) {
      set("sysNet", conn.effectiveType ? conn.effectiveType.toUpperCase() : "online");
      const bits = [];
      if (conn.downlink) bits.push("~" + conn.downlink + " Mbps");
      if (conn.rtt) bits.push(conn.rtt + " ms ping");
      set("hintNet", bits.join(" · ") || "connected");
      bar("barNet", Math.min(100, (conn.downlink || 10) * 10));
    } else {
      set("sysNet", "offline"); set("hintNet", "no connection");
      bar("barNet", 100, true);
    }
  }

  // spec chips
  const chips = [];
  if (navigator.hardwareConcurrency) chips.push(navigator.hardwareConcurrency + " cores");
  if (navigator.deviceMemory) chips.push("≥" + navigator.deviceMemory + " GB ram");
  chips.push(screen.width + "×" + screen.height + (window.devicePixelRatio > 1 ? " @" + window.devicePixelRatio + "x" : ""));
  if (sys) chips.push("pc up " + fmtHM(sys.uptimeSec));
  const start = +localStorage.getItem("sessionStart") || Date.now();
  chips.push("session " + fmtHM((Date.now() - start) / 1000));
  document.getElementById("sysChips").innerHTML =
    chips.map((c) => `<span class="chip">${c}</span>`).join("");
}
