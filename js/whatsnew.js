/* =========================================================
   whatsnew.js — one-time "What's new" popup after an update.
   Shows the current version's highlights the first time a new
   tab opens on a version the user hasn't seen. Dismiss stores
   the version so it never nags again until the next release.

   To update for a new release: bump `version` + edit `items`
   (and keep manifest.json / version/<x.y.z>.md in sync).
   ========================================================= */

const WHATS_NEW = {
  version: "1.4.0",
  items: [
    { icon: "🔖", title: "Real bookmarks", desc: "The saved tab now browses your actual browser bookmarks — folders and all, nothing ever wiped." },
    { icon: "🌐", title: "Translation", desc: "Select text on any page to translate it inline, or open the full translator with Alt+G." },
    { icon: "🔎", title: "Smarter search", desc: "The search bar now suggests from your history and bookmarks, just like the address bar." },
    { icon: "🎛️", title: "Display settings", desc: "New in settings: size (S/M/L), bold text, board width, and open-links-in-new-tab." },
    { icon: "🔐", title: "Vault dashboard", desc: "A security-score ring, weak/reused breakdown, 2FA coverage, and recently used / saved." },
  ],
};

function currentVersion() {
  try { return chrome.runtime.getManifest().version; } catch { return WHATS_NEW.version; }
}

function setupWhatsNew() {
  const version = currentVersion();
  // only show for the version these notes describe, and only once
  if (localStorage.getItem("seenVersion") === version) return;
  if (WHATS_NEW.version !== version) { localStorage.setItem("seenVersion", version); return; }
  showWhatsNew(version);
}

function showWhatsNew(version) {
  localStorage.setItem("seenVersion", version); // one-shot: don't re-show on reload

  const esc = typeof escHtml === "function" ? escHtml : (s) => String(s);
  const ov = document.createElement("div");
  ov.className = "wn-overlay";
  ov.innerHTML = `
    <div class="wn-card" role="dialog" aria-label="What's new">
      <div class="wn-head">
        <div>
          <div class="wn-kicker">just updated</div>
          <div class="wn-title">What's new</div>
        </div>
        <div class="wn-ver">v${esc(version)}</div>
      </div>
      <div class="wn-list">
        ${WHATS_NEW.items.map((i) => `
          <div class="wn-item">
            <div class="wn-ico">${i.icon}</div>
            <div class="wn-text">
              <div class="wn-it-title">${esc(i.title)}</div>
              <div class="wn-it-desc">${esc(i.desc)}</div>
            </div>
          </div>`).join("")}
      </div>
      <button class="wn-btn" id="wnClose">Got it</button>
    </div>`;
  document.body.appendChild(ov);
  requestAnimationFrame(() => ov.classList.add("show"));

  const close = () => {
    ov.classList.remove("show");
    setTimeout(() => ov.remove(), 250);
    document.removeEventListener("keydown", onKey);
  };
  function onKey(e) { if (e.key === "Escape") close(); }

  ov.querySelector("#wnClose").addEventListener("click", close);
  ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
  document.addEventListener("keydown", onKey);
}
