/* =========================================================
   whatsnew.js — one-time "What's new" popup after an update.
   Shows the current version's highlights the first time a new
   tab opens on a version the user hasn't seen. Dismiss stores
   the version so it never nags again until the next release.

   To update for a new release: bump `version` + edit `items`
   (and keep manifest.json / version/<x.y.z>.md in sync).
   ========================================================= */

const WHATS_NEW = {
  version: "1.5.0",
  items: [
    { icon: "⌨️", title: "Typing assistant", desc: "Autocomplete and spelling fixes in any text box, on any site. Turn it on with >typing — local dictionary (offline) or online." },
    { icon: "✓", title: "Grammar fixes", desc: "Free grammar checking as you type via >grammar — a popup of fixes, or auto-write mode that applies them for you." },
    { icon: "✦", title: "AI rewrite", desc: "Press Alt+R to fix or polish any text with your own AI key (Groq, Gemini, Claude, Ollama and more). Right-click the button for tone presets." },
    { icon: "↩️", title: "Reply & summarize", desc: "Alt+A drafts a reply to a selected message; Alt+W summarizes the whole page. Plus a personal dictionary and typing stats." },
    { icon: "⬇️", title: "One-line installer", desc: "Install or update Nyx from the terminal on Windows, Linux and macOS — no backend, and your settings are never touched." },
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
