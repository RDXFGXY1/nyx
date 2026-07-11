/* =========================================================
   lyrics.js — synced lyrics drawn onto the wallpaper.
   Lyrics are fetched at runtime from LRCLIB (free, no key) for
   whatever the player is playing, parsed from LRC (timestamped),
   and the active line is synced to PLAYER.audio.currentTime.
   Style (font, size, animation, position, color) is user-set.
   ========================================================= */
const LYRICS = {
  lines: [],     // [{ t: seconds, text }]
  idx: -1,
  raf: null,
  _key: "",

  async init() {
    await this.loadFont();
    this.applyStyle();
    if (!this.enabled()) this.hide();
  },

  enabled() { return localStorage.getItem("lyricsOn") === "1"; },
  layer() { return document.getElementById("lyricsLayer"); },
  line() { return document.getElementById("lyricsLine"); },

  /* called from updateNowPlaying — only refetches when the track changes */
  async onTrack(song, title) {
    if (!this.enabled()) { this.hide(); this._key = ""; return; }

    const meta = this.parseMeta(song, title);
    const key = (meta.artist + "|" + meta.track).toLowerCase();
    if (!meta.track) { this._key = ""; this.clearLines(); return; }
    if (key === this._key) { if (!this.raf && this.lines.length) this.startSync(); return; }

    this._key = key;
    this.clearLines();
    this.render("…");

    console.log(`[lyrics] searching: "${meta.artist}" — "${meta.track}" (${meta.duration}s)`);
    const lrc = await this.fetchLyrics(meta);
    if (key !== this._key) return; // track changed while fetching
    console.log("[lyrics]", lrc && lrc.synced ? `found synced lyrics (${lrc.synced.split("\n").length} lines)`
      : lrc && lrc.plain ? "only unsynced lyrics found (no timestamps)" : "no lyrics found for this track");

    if (lrc && lrc.synced) {
      this.lines = this.parseLrc(lrc.synced);
      this.idx = -1;
      this.startSync();
    } else {
      this.clearLines();
      this.render(""); // no synced lyrics for this track — keep the wallpaper clean
    }
  },

  parseMeta(song, title) {
    let artist = (song && song.artist) || "";
    let track = (song && song.title) || "";
    const name = title || (song && song.name) || "";
    if (!artist || !track) {
      const parts = name.split(/\s+[—–-]\s+/);
      if (parts.length >= 2) { artist = artist || parts[0]; track = track || parts.slice(1).join(" - "); }
      else track = track || name;
    }
    // strip common junk so the search matches better
    track = track.replace(/\((official|lyrics?|audio|video|hd|4k|visualizer)[^)]*\)/gi, "")
                 .replace(/\[[^\]]*\]/g, "").trim();
    let duration = (song && song.duration) || 0;
    if (!duration && typeof PLAYER !== "undefined" && isFinite(PLAYER.audio.duration)) duration = Math.round(PLAYER.audio.duration);
    return { artist: artist.trim(), track, duration };
  },

  async getJson(url) {
    // never let a slow/hanging request keep the "…" up forever
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    try {
      const r = await fetch(url, { signal: ctrl.signal });
      return r.ok ? await r.json() : null;
    } catch {
      return null; // offline, blocked (needs extension reload), or timed out
    } finally {
      clearTimeout(t);
    }
  },

  async fetchLyrics(meta) {
    if (meta.artist && meta.track) {
      let u = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(meta.artist)}&track_name=${encodeURIComponent(meta.track)}`;
      if (meta.duration) u += `&duration=${meta.duration}`;
      const d = await this.getJson(u);
      if (d && (d.syncedLyrics || d.plainLyrics)) return { synced: d.syncedLyrics, plain: d.plainLyrics };
    }
    const q = (meta.artist ? meta.artist + " " : "") + meta.track;
    const arr = await this.getJson(`https://lrclib.net/api/search?q=${encodeURIComponent(q)}`);
    if (Array.isArray(arr)) {
      const hit = arr.find((x) => x.syncedLyrics) || arr[0];
      if (hit) return { synced: hit.syncedLyrics, plain: hit.plainLyrics };
    }
    return null;
  },

  parseLrc(lrc) {
    const out = [];
    for (const raw of String(lrc).split("\n")) {
      const stamps = [...raw.matchAll(/\[(\d+):(\d+)(?:[.:](\d+))?\]/g)];
      if (!stamps.length) continue;
      const text = raw.replace(/\[[^\]]*\]/g, "").trim();
      for (const s of stamps) {
        const sec = (+s[1]) * 60 + (+s[2]) + (s[3] ? parseFloat("0." + s[3]) : 0);
        out.push({ t: sec, text });
      }
    }
    out.sort((a, b) => a.t - b.t);
    return out;
  },

  startSync() {
    this.stopSync();
    const tick = () => {
      const a = typeof PLAYER !== "undefined" && PLAYER.audio; // PLAYER is a global const, not on window
      if (a && this.lines.length && isFinite(a.currentTime)) {
        const now = a.currentTime + 0.15; // tiny lead so the line lands on the beat
        let lo = 0, hi = this.lines.length - 1, found = -1;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          if (this.lines[mid].t <= now) { found = mid; lo = mid + 1; } else hi = mid - 1;
        }
        if (found !== this.idx) {
          this.idx = found;
          this.render(found >= 0 ? this.lines[found].text : "");
        }
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  },

  stopSync() { if (this.raf) cancelAnimationFrame(this.raf); this.raf = null; },
  clearLines() { this.lines = []; this.idx = -1; this.stopSync(); },
  hide() { this.clearLines(); this.render(""); },

  render(text) {
    const line = this.line();
    if (!line) return;
    if (!this.enabled()) { line.textContent = ""; return; }
    text = text || "";
    if (line.textContent === text) return;
    line.textContent = text;
    // retrigger the entrance animation
    const anim = localStorage.getItem("lyricsAnim") || "fade";
    line.className = "ly-line";
    void line.offsetWidth;
    if (text) line.classList.add("a-" + anim);
  },

  /* ---------- style ---------- */
  applyStyle() {
    const layer = this.layer(), line = this.line();
    if (!layer || !line) return;
    layer.dataset.pos = localStorage.getItem("lyricsPos") || "center";
    layer.dataset.anim = localStorage.getItem("lyricsAnim") || "fade";
    line.style.setProperty("--ly-size", (localStorage.getItem("lyricsSize") || 44) + "px");
    const color = localStorage.getItem("lyricsColor") || "white";
    // softened accent (blended toward white) reads far nicer than a raw, harsh accent
    line.style.setProperty("--ly-color",
      color === "accent" ? "color-mix(in srgb, var(--accent) 68%, white)" : "#ffffff");
    line.style.fontFamily = localStorage.getItem("lyricsFont") ? "NyxLyricFont, sans-serif" : "";
  },

  /* ---------- custom font (uploaded by the user) ---------- */
  async setFont(file) {
    try {
      const buf = await file.arrayBuffer();
      await idbSet("lyricsFontData", buf);
      localStorage.setItem("lyricsFont", file.name);
      await this.loadFont();
      this.applyStyle();
      return true;
    } catch { return false; }
  },
  async clearFont() {
    localStorage.removeItem("lyricsFont");
    try { await idbDel("lyricsFontData"); } catch {}
    this.applyStyle();
  },
  async loadFont() {
    try {
      const buf = await idbGet("lyricsFontData");
      if (!buf) return;
      const face = new FontFace("NyxLyricFont", buf);
      await face.load();
      document.fonts.add(face);
    } catch {}
  },

  /* run in the console: LYRICS.diag("artist", "song title") — reports whether
     LRCLIB has synced lyrics, without printing any of the lyrics text. */
  async diag(artist, title) {
    const meta = { artist: artist || "", track: title || "", duration: 0 };
    const lrc = await this.fetchLyrics(meta);
    const msg = lrc
      ? (lrc.synced ? `SYNCED — ${lrc.synced.split("\n").length} lines`
                    : "unsynced only (no timestamps)")
      : "NOTHING FOUND";
    console.log("[lyrics] diag", meta, "→", msg);
    return msg;
  },
};
