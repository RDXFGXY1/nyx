/* =========================================================
   theme.js — wallpaper (image OR video) + accent colors
   Wallpapers are stored in IndexedDB (big storage, videos ok).
   Accent goes into CSS vars: --accent --accent-soft --accent-ink
   ========================================================= */

const THEME = {
  DEFAULT_BG: "assets/bg.jpg",

  async init() {
    // migrate old localStorage image wallpaper -> IndexedDB
    const legacy = localStorage.getItem("wallpaper");
    if (legacy) {
      try {
        await idbSet("wallpaper", { type: "image", data: legacy });
        localStorage.removeItem("wallpaper");
      } catch {}
    }

    // random wallpaper from the server's folder (settings toggle)
    if (localStorage.getItem("randomWall") === "1" && (await this.applyRandomWallpaper())) {
      const savedAccent = localStorage.getItem("accent");
      if (savedAccent) this.applyAccentHex(savedAccent);
      return; // accent otherwise comes from the random wallpaper itself
    }

    try {
      const saved = await idbGet("wallpaper");
      // CSS no longer hardcodes the default, so apply saved OR default here
      this.applyWallpaper(saved || { type: "image", data: this.DEFAULT_BG });
    } catch (e) {
      console.error("[wallpaper] load failed:", e);
      this.applyWallpaper({ type: "image", data: this.DEFAULT_BG });
    }

    const savedAccent = localStorage.getItem("accent");
    if (savedAccent) this.applyAccentHex(savedAccent);
    else this.autoAccent();
  },

  /* ---------- random wallpaper: a folder you PICK (File System Access),
       or a path the local server reads ---------- */
  WALL_API: "http://127.0.0.1:5055/api/wallpaper",
  WALL_IMG_EXT: [".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".avif"],
  WALL_VID_EXT: [".mp4", ".webm", ".ogg", ".ogv"],

  wallKind(name) {
    const dot = name.lastIndexOf(".");
    const ext = dot >= 0 ? name.slice(dot).toLowerCase() : "";
    if (this.WALL_IMG_EXT.includes(ext)) return "image";
    if (this.WALL_VID_EXT.includes(ext)) return "video";
    return null;
  },

  // ----- pick a folder with the native OS picker — no path typing -----
  async chooseWallpaperFolder() {
    if (!window.showDirectoryPicker) {
      toast("this browser can't open a folder picker — use the path box");
      return false;
    }
    let handle;
    try {
      handle = await window.showDirectoryPicker({ id: "nyx-walls", mode: "read" });
    } catch { return false; } // user cancelled the dialog
    await idbSet("wallDirHandle", handle);
    localStorage.setItem("wallSource", "local");
    localStorage.setItem("randomWall", "1");
    const n = await this.countLocal(handle);
    if (!n) { toast("that folder has no images or videos"); return true; }
    toast(`folder set — ${n} wallpaper${n !== 1 ? "s" : ""} found`);
    await this.applyRandomWallpaper(true);
    return true;
  },

  async countLocal(handle) {
    let n = 0;
    try {
      for await (const e of handle.values())
        if (e.kind === "file" && this.wallKind(e.name)) n++;
    } catch {}
    return n;
  },

  async ensurePerm(handle, interactive) {
    const opts = { mode: "read" };
    try {
      if ((await handle.queryPermission(opts)) === "granted") return true;
      if (interactive && (await handle.requestPermission(opts)) === "granted") return true;
    } catch {}
    return false;
  },

  // ----- apply a random wallpaper from whichever source is configured -----
  async applyRandomWallpaper(interactive = false) {
    const source = localStorage.getItem("wallSource") || "server";
    return source === "local"
      ? this.applyRandomLocal(interactive)
      : this.applyRandomServer();
  },

  async applyRandomLocal(interactive) {
    try {
      const handle = await idbGet("wallDirHandle");
      if (!handle) return false;
      if (!(await this.ensurePerm(handle, interactive))) {
        // fresh tab has no click to grant with — show the last one so it isn't blank
        return this.applyCachedLocal();
      }
      const want = localStorage.getItem("randomWallType") || "both";
      const files = [];
      for await (const e of handle.values()) {
        if (e.kind !== "file") continue;
        const k = this.wallKind(e.name);
        if (k && (want === "both" || want === k)) files.push({ e, k });
      }
      if (!files.length) return false;

      const pick = files[Math.floor(Math.random() * files.length)];
      const file = await pick.e.getFile();
      const url = URL.createObjectURL(file);
      if (pick.k === "video") {
        this._showVideo(url, false);
      } else {
        this._showImage(url);
        try {
          const dataUrl = await readFile(file);
          await idbSet("wallLastData", dataUrl); // cache for no-permission tabs
          if (!localStorage.getItem("accent")) this.applyAccentRgb(await extractAccent(dataUrl));
        } catch {}
      }
      return true;
    } catch (e) {
      console.error("[wallpaper] local random failed:", e);
      return false;
    }
  },

  async applyCachedLocal() {
    try {
      const last = await idbGet("wallLastData");
      if (typeof last === "string") { this._showImage(last); return true; }
    } catch {}
    return false;
  },

  async applyRandomServer() {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 1500);
      const res = await fetch(this.WALL_API + "/list", { signal: ctrl.signal });
      clearTimeout(t);
      if (!res.ok) return false;
      const { exists, images, videos } = await res.json();
      if (!exists) return false;

      const want = localStorage.getItem("randomWallType") || "both";
      let pool = [];
      if (want !== "video") pool = pool.concat(images.map((n) => ({ n, v: false })));
      if (want !== "image") pool = pool.concat(videos.map((n) => ({ n, v: true })));
      if (!pool.length) return false;

      const pick = pool[Math.floor(Math.random() * pool.length)];
      const url = this.WALL_API + "/file?name=" + encodeURIComponent(pick.n);
      if (pick.v) {
        this._showVideo(url, true);
      } else {
        this._showImage(url);
        if (!localStorage.getItem("accent")) {
          try { this.applyAccentRgb(await extractAccent(url, true)); } catch {}
        }
      }
      return true;
    } catch {
      return false; // server offline — caller falls back to the saved wallpaper
    }
  },

  _showImage(url) {
    const vid = document.getElementById("bgVideo");
    vid.pause(); vid.removeAttribute("src"); vid.classList.add("hidden");
    document.getElementById("bg").style.backgroundImage = `url("${url}")`;
    this._current = { type: "image", data: url, remote: true };
  },

  _showVideo(url, cors) {
    const vid = document.getElementById("bgVideo");
    if (cors) vid.crossOrigin = "anonymous"; else vid.removeAttribute("crossorigin");
    vid.src = url;
    vid.classList.remove("hidden");
    vid.addEventListener("loadeddata", () => {
      if (!localStorage.getItem("accent")) this.accentFromVideo();
    }, { once: true });
    vid.play().catch(() => {});
    this._current = { type: "video", data: null, remote: true };
  },

  // ---------- apply ----------
  applyWallpaper(w) {
    const bg = document.getElementById("bg");
    const vid = document.getElementById("bgVideo");

    if (w.type === "video") {
      const url = URL.createObjectURL(w.data); // data = Blob
      vid.src = url;
      vid.classList.remove("hidden");
      vid.addEventListener("loadeddata", () => {
        if (!localStorage.getItem("accent")) this.accentFromVideo();
      }, { once: true });
      vid.play().catch(() => {});
    } else {
      vid.pause();
      vid.removeAttribute("src");
      vid.classList.add("hidden");
      bg.style.backgroundImage = `url("${w.data}")`; // data = dataURL string
    }
    this._current = w;
  },

  // ---------- pick ----------
  pickWallpaper() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*,video/mp4,video/webm,video/ogg";
    input.onchange = async () => {
      const file = input.files[0];
      if (!file) return;
      try {
        if (file.type.startsWith("video/")) {
          await this._setVideo(file);
        } else {
          await this._setImage(file);
        }
      } catch (e) {
        console.error("[wallpaper] failed:", e);
        toast("wallpaper failed: " + (e.message || e));
      }
    };
    input.click();
  },

  async _setVideo(file) {
    if (file.size > 150 * 1024 * 1024) {
      toast("video too big — keep it under 150MB");
      return;
    }
    const w = { type: "video", data: file };
    await idbSet("wallpaper", w);
    this.applyWallpaper(w);
    localStorage.removeItem("accent");
    toast("video wallpaper set");
    // accent from first frame when ready
    const vid = document.getElementById("bgVideo");
    vid.addEventListener("loadeddata", () => this.accentFromVideo(), { once: true });
  },

  async _setImage(file) {
    const dataUrl = await readFile(file);
    const small = await shrinkImage(dataUrl, 1920, 0.85);
    const w = { type: "image", data: small };
    await idbSet("wallpaper", w);
    this.applyWallpaper(w);
    localStorage.removeItem("accent");
    await this.autoAccent();
    toast("wallpaper set");
  },

  async resetWallpaper() {
    try { await idbDel("wallpaper"); } catch {}
    localStorage.removeItem("wallpaper");
    localStorage.removeItem("accent");
    const vid = document.getElementById("bgVideo");
    vid.pause();
    vid.removeAttribute("src");
    vid.classList.add("hidden");
    document.getElementById("bg").style.backgroundImage = "";
    this._current = null;
    this.autoAccent();
    toast("wallpaper reset");
  },

  // ---------- accent ----------
  async autoAccent() {
    if (this._current && this._current.type === "video") {
      this.accentFromVideo();
      return;
    }
    const src = this._current ? this._current.data : this.DEFAULT_BG;
    try {
      const rgb = await extractAccent(src);
      this.applyAccentRgb(rgb);
    } catch {
      this.applyAccentRgb([233, 233, 238]); // neutral fallback
    }
  },

  accentFromVideo() {
    try {
      const vid = document.getElementById("bgVideo");
      if (!vid.videoWidth) return;
      const s = 64;
      const c = document.createElement("canvas");
      c.width = s; c.height = s;
      c.getContext("2d").drawImage(vid, 0, 0, s, s);
      const rgb = pickAccentFromCanvas(c);
      this.applyAccentRgb(rgb);
    } catch (e) {
      console.error("[accent] video sample failed:", e);
      this.applyAccentRgb([233, 233, 238]);
    }
  },

  applyAccentHex(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) { toast("bad hex — use like #ff4d55"); return false; }
    const n = parseInt(m[1], 16);
    this.applyAccentRgb([(n >> 16) & 255, (n >> 8) & 255, n & 255]);
    localStorage.setItem("accent", "#" + m[1]);
    return true;
  },

  applyAccentRgb([r, g, b]) {
    const hex = "#" + [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const ink = lum > 150 ? "#141416" : "#f4f4f6";
    const root = document.documentElement.style;
    root.setProperty("--accent", hex);
    root.setProperty("--accent-soft", `rgba(${r}, ${g}, ${b}, 0.14)`);
    root.setProperty("--accent-ink", ink);

    // cache a dark tint of the wallpaper as the next-tab placeholder (kills the flash)
    try {
      localStorage.setItem("bgColor", `rgb(${Math.round(r * 0.16)},${Math.round(g * 0.16)},${Math.round(b * 0.16)})`);
    } catch {}

    // publish to shared storage so the in-page popups (content scripts) match
    try {
      if (window.chrome?.storage?.local)
        chrome.storage.local.set({ accentColor: hex, accentInk: ink, accentSoftRgb: `${r},${g},${b}` });
    } catch {}
  },
};

/* ---------- helpers ---------- */

function readFile(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(new Error("could not read file"));
    r.readAsDataURL(file);
  });
}

function shrinkImage(dataUrl, maxW, quality) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const scale = Math.min(1, maxW / img.width);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const c = document.createElement("canvas");
        c.width = w; c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        let out = c.toDataURL("image/jpeg", quality);
        if (out.length > 3_500_000) out = c.toDataURL("image/jpeg", 0.6);
        resolve(out);
      } catch (e) { reject(e); }
    };
    img.onerror = () => reject(new Error("not a readable image"));
    img.src = dataUrl;
  });
}

function extractAccent(src, crossOrigin) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = "anonymous"; // server sends CORS headers
    img.onload = () => {
      try {
        const s = 64;
        const c = document.createElement("canvas");
        c.width = s; c.height = s;
        c.getContext("2d").drawImage(img, 0, 0, s, s);
        resolve(pickAccentFromCanvas(c));
      } catch (e) { reject(e); }
    };
    img.onerror = reject;
    img.src = src;
  });
}

function pickAccentFromCanvas(c) {
  const data = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
  let best = null, bestScore = -1;
  let rs = 0, gs = 0, bs = 0, n = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    rs += r; gs += g; bs += b; n++;
    const sat = Math.max(r, g, b) - Math.min(r, g, b);
    const lum = (r + g + b) / 3;
    const score = sat * 2 + lum * 0.5;
    if (lum > 40 && score > bestScore) { bestScore = score; best = [r, g, b]; }
  }
  if (!best) best = [rs / n, gs / n, bs / n];
  return best.map(Math.round);
}

/* ---------- IndexedDB (big storage for videos) ---------- */

function idbOpen() {
  return new Promise((res, rej) => {
    const r = indexedDB.open("startpage", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("kv");
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function idbSet(key, val) {
  const db = await idbOpen();
  return new Promise((res, rej) => {
    const tx = db.transaction("kv", "readwrite");
    tx.objectStore("kv").put(val, key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}
async function idbGet(key) {
  const db = await idbOpen();
  return new Promise((res, rej) => {
    const q = db.transaction("kv").objectStore("kv").get(key);
    q.onsuccess = () => res(q.result);
    q.onerror = () => rej(q.error);
  });
}
async function idbDel(key) {
  const db = await idbOpen();
  return new Promise((res, rej) => {
    const tx = db.transaction("kv", "readwrite");
    tx.objectStore("kv").delete(key);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

/* ---------- toast ---------- */
function toast(msg) {
  let t = document.getElementById("toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "toast";
    t.className = "toast";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2600);
}
