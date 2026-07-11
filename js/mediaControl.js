/* =========================================================
   mediaControl.js — content script on every page.
   Lets the Nyx new-tab dashboard play / pause the audio or
   video playing in this tab. The dashboard asks the background
   worker, which relays a "nyx-media" message here.
   ========================================================= */
(() => {
  function mediaEls() {
    return [...document.querySelectorAll("audio, video")].filter(
      (m) => m.readyState > 0 || m.currentSrc || m.src
    );
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg || msg.type !== "nyx-media") return;
    const els = mediaEls();

    if (msg.action === "toggle") {
      const playing = els.filter((m) => !m.paused && !m.ended);
      if (playing.length) {
        playing.forEach((m) => m.pause());
        sendResponse({ ok: true, playing: false });
      } else {
        // resume the longest media element (usually the main track / video)
        const main = els.slice().sort((a, b) => (b.duration || 0) - (a.duration || 0))[0];
        if (main) main.play().catch(() => {});
        sendResponse({ ok: true, playing: !!main });
      }
      return true;
    }

    if (msg.action === "pause") {
      els.forEach((m) => m.pause());
      sendResponse({ ok: true, playing: false });
      return true;
    }

    if (msg.action === "state") {
      sendResponse({ ok: true, playing: els.some((m) => !m.paused && !m.ended), count: els.length });
      return true;
    }
  });
})();
