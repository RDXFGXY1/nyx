/* =========================================================
   musicSource.js — glue between the C# backend and the
   dashboard player you already have (js/dashboard.js).
   ---------------------------------------------------------
   Strategy:
     - On load, ping the local server.
     - If online: list server tracks, and playing one just sets
       audio.src to the stream URL (with seek/range for free).
     - If offline: your existing IndexedDB local player is used
       exactly as before. Nothing breaks.

   This keeps the two sources cleanly separated so you can grow
   either one later without tangling them.
   ========================================================= */

const MusicSource = {
  api: null,
  online: false,

  async init(baseUrl) {
    // MusicApi comes from musicApi.js (load it first in your HTML)
    this.api = new MusicApi(baseUrl);
    this.online = await this.api.isOnline();
    return this.online;
  },

  /**
   * Return a unified track list the UI can render. Each item:
   *   { id, title, artist, source: "server", art?: url }
   * Falls back to [] when offline (UI then shows local songs).
   */
  async listServerTracks() {
    if (!this.online) return [];
    try {
      const { tracks } = await this.api.getLibrary();
      return tracks.map((t) => ({
        id: t.id,
        title: t.title,
        artist: t.artist,
        album: t.album,
        duration: t.duration,
        source: "server",
        art: t.hasArt ? this.api.artUrl(t.id) : null,
      }));
    } catch {
      this.online = false;
      return [];
    }
  },

  /** Point an <audio> element at a server track (seek works via range). */
  play(audio, id) {
    audio.src = this.api.streamUrl(id);
    return audio.play();
  },

  artUrl(id) {
    return this.api.artUrl(id);
  },

  async rescan() {
    if (!this.online) return null;
    return this.api.rescan();
  },
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = { MusicSource };
} else {
  // eslint-disable-next-line no-undef
  window.MusicSource = MusicSource;
}
