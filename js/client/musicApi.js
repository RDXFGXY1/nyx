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

  /** Start a background download of an online track into the library. */
  async remoteDownload(id, title) {
    const q = title ? `?title=${encodeURIComponent(title)}` : "";
    const res = await fetch(`${this.base}/api/remote/download/${encodeURIComponent(id)}${q}`, {
      method: "POST",
    });
    return res.ok;
  }

  /** Poll a download's status: { state: downloading|done|error|idle, percent }. */
  async remoteDownloadStatus(id) {
    return this.#json(`/api/remote/download/${encodeURIComponent(id)}/status`);
  }

  /** Every active + recent download: { jobs: [{id,title,state,percent,error}] }. */
  async remoteDownloads() {
    return this.#json("/api/remote/downloads");
  }

  /** Drop finished/failed jobs from the download list. */
  async remoteDownloadsClear() {
    const res = await fetch(`${this.base}/api/remote/downloads/clear`, { method: "POST" });
    return res.ok;
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

  // ---- sync bus (browser player <-> desktop HUD) ----

  /** Publish this client's now-playing state to the shared bus. */
  async syncState(state) {
    return fetch(`${this.base}/api/sync/state`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state),
    });
  }

  /** Read the shared now-playing state: { state, ageMs } or { none: true }. */
  async syncGetState(signal) {
    return this.#json("/api/sync/state", { signal });
  }

  /** Post a transport command for the current owner to run. */
  async syncCmd(action, value, from) {
    return fetch(`${this.base}/api/sync/cmd`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, value: value || 0, from }),
    });
  }

  /** Poll for commands newer than `after`: { commands, latest }. */
  async syncPollCmds(after) {
    return this.#json(`/api/sync/cmd?after=${after || 0}`);
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
