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

function extractAccent(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
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
