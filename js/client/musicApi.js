/* =========================================================
   musicApi.js — client for the NullTab Music Server (C#)
   ---------------------------------------------------------
   Drop this in your extension's /js folder. It wraps every
   backend endpoint so the rest of your code never builds URLs
   by hand. If the server is offline, methods reject cleanly
   and you can fall back to the IndexedDB local player.

   Usage:
     const api = new MusicApi();               // default 127.0.0.1:5055
     if (await api.isOnline()) {
       const { tracks } = await api.getLibrary();
       audio.src = api.streamUrl(tracks[0].id);
       audio.play();
     }
   ========================================================= */

class MusicApi {
  /**
   * @param {string} baseUrl  where the C# server listens
   */
  constructor(baseUrl = "http://127.0.0.1:5055") {
    this.base = baseUrl.replace(/\/+$/, "");
  }

  // ---- raw url builders (safe to use directly in <audio>/<img>) ----

  streamUrl(id) {
    return `${this.base}/api/stream/${encodeURIComponent(id)}`;
  }

  artUrl(id) {
    return `${this.base}/api/art/${encodeURIComponent(id)}`;
  }

  /** Audio for an online track, proxied (and made seekable) by the backend. */
  remoteStreamUrl(id) {
    return `${this.base}/api/remote/stream/${encodeURIComponent(id)}`;
  }

  // ---- online search (backend resolves via yt-dlp) ----

  /**
   * Search online tracks through the backend.
   * @returns {Promise<{results: Array<{id,title,uploader,duration}>}>}
   */
  async remoteSearch(q, signal) {
    return this.#json(`/api/remote/search?q=${encodeURIComponent(q)}`, { signal });
  }

  // ---- json endpoints ----

  /**
   * Full library.
   * @returns {Promise<{tracks: Array, count: number, scannedAt: string, library: string}>}
   */
  async getLibrary(signal) {
    return this.#json("/api/library", { signal });
  }

  /**
   * One track's metadata.
   * @param {string} id
   */
  async getTrack(id, signal) {
    return this.#json(`/api/tracks/${encodeURIComponent(id)}`, { signal });
  }

  /** Force the server to re-scan ~/Music. */
  async rescan(signal) {
    return this.#json("/api/rescan", { method: "POST", signal });
  }

  /** Health probe — returns the parsed body or throws. */
  async health(signal) {
    return this.#json("/api/health", { signal });
  }

  /** Real machine stats (cpu, ram, disk, net) from the backend. */
  async system(signal) {
    return this.#json("/api/system", { signal });
  }

  /** Today's per-app foreground time. */
  async screenTime(signal) {
    return this.#json("/api/screentime", { signal });
  }

  /** Machine control: lock / sleep / shutdown / abort / mute / vol. */
  async power(action, params) {
    const q = params ? "?" + new URLSearchParams(params) : "";
    const res = await fetch(`${this.base}/api/power/${action}${q}`, { method: "POST" });
    if (!res.ok) throw new Error(`power ${action} -> HTTP ${res.status}`);
    return res.json().catch(() => ({}));
  }

  /**
   * Cheap boolean check with a short timeout — good for deciding
   * whether to show the "server" source or fall back to local files.
   * @param {number} timeoutMs
   */
  async isOnline(timeoutMs = 1500) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      await this.health(ctrl.signal);
      return true;
    } catch {
      return false;
    } finally {
      clearTimeout(t);
    }
  }

  // ---- internal ----

  async #json(path, init = {}) {
    const res = await fetch(this.base + path, init);
    if (!res.ok) {
      throw new Error(`MusicApi ${path} -> HTTP ${res.status}`);
    }
    return res.json();
  }
}

// Export for both module and plain-script setups.
if (typeof module !== "undefined" && module.exports) {
  module.exports = { MusicApi };
} else {
  // eslint-disable-next-line no-undef
  window.MusicApi = MusicApi;
}
