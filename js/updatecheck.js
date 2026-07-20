/* =========================================================
   updatecheck.js — backend-free update notifier.

   Periodically fetches a small version.json from your GitHub
   repo (raw URL). If its "version" is newer than the installed
   extension version, a dismissible "update available" banner
   appears. No server required.

   SET THIS to the RAW url of the version.json in your repo:
     https://raw.githubusercontent.com/<user>/<repo>/<branch>/version.json
   (must match a host in manifest.json "host_permissions").
   ========================================================= */

const UPDATE_URL = "https://raw.githubusercontent.com/RDXFGXY1/nyx/main/version.json";
const UPDATE_INTERVAL_MS = 6 * 60 * 60 * 1000; // fetch at most every 6 hours

/** compare dotted versions: 1 if a>b, -1 if a<b, 0 if equal */
function verCmp(a, b) {
  const pa = String(a).split("."), pb = String(b).split(".");
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (parseInt(pa[i]) || 0) - (parseInt(pb[i]) || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

function installedVersion() {
  try { return chrome.runtime.getManifest().version; } catch { return "0.0.0"; }
}

function setupUpdateCheck() {
  // 1) show instantly from the last cached result (no wait)
  maybeShowUpdate(localStorage.getItem("updLatest"));

  // 2) refresh from GitHub, throttled
  const last = parseInt(localStorage.getItem("updLastCheck") || "0");
  if (Date.now() - last < UPDATE_INTERVAL_MS) return;
  if (!UPDATE_URL || UPDATE_URL.includes("<user>")) return; // not configured
  localStorage.setItem("updLastCheck", String(Date.now()));

  fetch(UPDATE_URL, { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      if (!d || !d.version) return;
      localStorage.setItem("updLatest", d.version);
      localStorage.setItem("updUrl", d.url || "");
      localStorage.setItem("updNotes", d.notes || "");
      localStorage.setItem("updItems", JSON.stringify(Array.isArray(d.items) ? d.items : []));
      maybeShowUpdate(d.version);
    })
    .catch(() => {});
}

function maybeShowUpdate(remote) {
  if (!remote) return;
  if (verCmp(remote, installedVersion()) <= 0) return;                 // not newer
  if (document.getElementById("updBanner") || document.getElementById("updPill")) return;
  // once minimized, keep a small persistent pill instead of the full banner —
  // it never nags, but it also never disappears until they actually update
  if (localStorage.getItem("updMinimized") === remote) showUpdatePill(remote);
  else showUpdateBanner(remote);
}

function showUpdateBanner(remote) {
  const esc = typeof escHtml === "function" ? escHtml : (s) => String(s);
  const url = localStorage.getItem("updUrl") || "";
  const notes = localStorage.getItem("updNotes") || "";

  const el = document.createElement("div");
  el.id = "updBanner";
  el.className = "upd-banner";
  el.innerHTML = `
    <span class="upd-dot"></span>
    <div class="upd-body">
      <div class="upd-line">Update available · <b>v${esc(remote)}</b></div>
      ${notes ? `<div class="upd-notes">${esc(notes)}</div>` : ""}
    </div>
    ${url ? `<a class="upd-get" href="${esc(url)}" target="_blank" rel="noopener">get it →</a>` : ""}
    <button class="upd-x" title="dismiss" aria-label="dismiss">✕</button>`;
  document.body.appendChild(el); // entrance is a pure-CSS animation (no rAF dependency)

  // ✕ minimizes to a small persistent pill instead of dismissing forever
  el.querySelector(".upd-x").addEventListener("click", () => {
    localStorage.setItem("updMinimized", remote);
    el.classList.add("out");
    setTimeout(() => { el.remove(); showUpdatePill(remote); }, 220);
  });
}

/* small always-there corner pill — a gentle reminder that never disappears
   until the user actually updates. Clicking it re-opens the full banner. */
function showUpdatePill(remote) {
  if (document.getElementById("updPill") || document.getElementById("updBanner")) return;
  const esc = typeof escHtml === "function" ? escHtml : (s) => String(s);

  const p = document.createElement("div");
  p.id = "updPill";
  p.className = "upd-pill";
  p.title = "Update available · v" + remote + " — click for details";
  p.innerHTML = `
    <span class="upd-dot"></span>
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M6 11l6-6 6 6"/></svg>
    <span>v${esc(remote)}</span>`;
  p.addEventListener("click", () => showUpdateNotes(remote));
  document.body.appendChild(p);
}

/* "what's new in this update" popup — opened from the banner or the pill */
function showUpdateNotes(remote) {
  if (document.getElementById("updModal")) return;
  const esc = typeof escHtml === "function" ? escHtml : (s) => String(s);
  const url = localStorage.getItem("updUrl") || "";

  // prefer a bulleted `items` list; fall back to splitting the notes string
  let items = [];
  try { items = JSON.parse(localStorage.getItem("updItems") || "[]"); } catch {}
  if (!items.length) {
    const n = localStorage.getItem("updNotes") || "";
    items = n.split(/\n|•|;|·/).map((s) => s.trim()).filter(Boolean);
  }

  const body = items.length
    ? `<ul class="upd-notes-list">${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`
    : `<div class="upd-notes-p">A new version is available.</div>`;

  const ov = document.createElement("div");
  ov.id = "updModal";
  ov.className = "upd-modal";
  ov.innerHTML = `
    <div class="upd-modal-card" role="dialog" aria-label="What's new">
      <div class="wn-head">
        <div><div class="wn-kicker">update available</div><div class="wn-title">What's new</div></div>
        <div class="wn-ver">v${esc(remote)}</div>
      </div>
      ${body}
      <div class="upd-modal-actions">
        <button class="upd-btn2 ghost" id="updLater">Later</button>
        ${url ? `<a class="upd-btn2 primary" href="${esc(url)}" target="_blank" rel="noopener">Get it →</a>` : ""}
      </div>
    </div>`;
  document.body.appendChild(ov);

  const close = () => { ov.remove(); document.removeEventListener("keydown", onKey); };
  function onKey(e) { if (e.key === "Escape") close(); }
  ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
  ov.querySelector("#updLater").addEventListener("click", close);
  document.addEventListener("keydown", onKey);
}
