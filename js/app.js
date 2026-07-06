/* =========================================================
   app.js — clock, weather, search, render groups, tab switch
   ========================================================= */

// ---------- helpers ----------
function iconLetter(name) {
  return name.trim().charAt(0).toUpperCase();
}

/* copy text — clipboard API with a textarea/execCommand fallback
   (the API can be blocked on chrome-extension:// without focus) */
async function copyText(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through to legacy path */ }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.top = "-9999px";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function favicon(url) {
  try {
    return "https://www.google.com/s2/favicons?domain=" +
      encodeURIComponent(new URL(url).hostname) + "&sz=64";
  } catch { return null; }
}

/* ---------- groups: user-saved override config defaults ---------- */
let LIVE_GROUPS = null;
let CURRENT_VIEW = "home";
let EDIT_MODE = false;

/* ---------- tabs: user-saved override the default four ---------- */
let LIVE_TABS = null;
const DEFAULT_TABS = [
  { name: "Home", view: "home" },
  { name: "Projects", view: "projects" },
  { name: "Learning", view: "learning" },
  { name: "Personal", view: "personal" },
];

function getTabs() {
  if (LIVE_TABS) return LIVE_TABS;
  try {
    const s = JSON.parse(localStorage.getItem("userTabs"));
    if (Array.isArray(s) && s.length) { LIVE_TABS = s; return s; }
  } catch {}
  LIVE_TABS = JSON.parse(JSON.stringify(DEFAULT_TABS));
  return LIVE_TABS;
}

function saveTabs() {
  localStorage.setItem("userTabs", JSON.stringify(getTabs()));
}

function renderTabs() {
  const nav = document.getElementById("tabs");
  const tabs = getTabs();
  let html = tabs
    .map((t) => {
      const active = t.view === CURRENT_VIEW;
      if (EDIT_MODE && active) {
        return `<span class="tab-edit">
          <input class="tab-rename" data-view="${t.view}" value="${escHtml(t.name)}" spellcheck="false" />
          <button class="tab-del" data-view="${t.view}" title="delete tab">✕</button>
        </span>`;
      }
      return `<button class="tab ${active ? "active" : ""}" data-view="${t.view}">${escHtml(t.name)}</button>`;
    })
    .join("");
  if (EDIT_MODE) html += `<button class="tab-add" id="tabAdd" title="new tab">+</button>`;
  nav.innerHTML = html;
  wireTabs();
}

function wireTabs() {
  const nav = document.getElementById("tabs");

  nav.querySelectorAll(".tab[data-view]").forEach((b) =>
    b.addEventListener("click", () => {
      switchView(b.dataset.view);
      if (EDIT_MODE) { renderTabs(); renderGroups(); }
    })
  );

  const rn = nav.querySelector(".tab-rename");
  if (rn) {
    rn.addEventListener("change", () => {
      const t = getTabs().find((x) => x.view === rn.dataset.view);
      if (t) { t.name = rn.value.trim() || "tab"; saveTabs(); }
    });
    rn.addEventListener("keydown", (e) => { if (e.key === "Enter") rn.blur(); });
  }

  const del = nav.querySelector(".tab-del");
  if (del) del.addEventListener("click", () => {
    const tabs = getTabs();
    if (tabs.length <= 1) return toast("keep at least one tab");
    if (del.dataset.arm) {
      const view = del.dataset.view;
      LIVE_GROUPS = getGroups().filter((g) => g.view !== view);
      saveGroups();
      const i = tabs.findIndex((x) => x.view === view);
      tabs.splice(i, 1);
      saveTabs();
      CURRENT_VIEW = tabs[Math.max(0, i - 1)].view;
      renderTabs(); renderGroups();
      toast("tab deleted");
    } else {
      del.dataset.arm = "1"; del.textContent = "sure?";
      setTimeout(() => { if (del) { delete del.dataset.arm; del.textContent = "✕"; } }, 2200);
    }
  });

  const add = document.getElementById("tabAdd");
  if (add) add.addEventListener("click", () => {
    const tabs = getTabs();
    const view = "tab-" + Date.now().toString(36);
    tabs.push({ name: "new tab", view });
    saveTabs();
    CURRENT_VIEW = view;
    renderTabs(); renderGroups();
    nav.querySelector(".tab-rename")?.select();
  });
}

function getGroups() {
  if (LIVE_GROUPS) return LIVE_GROUPS;
  try {
    const s = JSON.parse(localStorage.getItem("userGroups"));
    if (Array.isArray(s) && s.length) { LIVE_GROUPS = s; return s; }
  } catch {}
  LIVE_GROUPS = JSON.parse(JSON.stringify(GROUPS));
  return LIVE_GROUPS;
}

function saveGroups() {
  localStorage.setItem("userGroups", JSON.stringify(getGroups()));
}

function toggleEditMode(force) {
  EDIT_MODE = force !== undefined ? force : !EDIT_MODE;
  document.body.classList.toggle("editing", EDIT_MODE);
  renderTabs();
  renderGroups();
  toast(EDIT_MODE ? "edit mode — tabs, groups, links" : "saved");
}

// ---------- render groups ----------
function renderGroups() {
  const grid = document.getElementById("grid");
  grid.innerHTML = "";

  // 4 side columns + open center: 1=left, 2=left-mid, 3=right-mid, 4=right
  const cols = {};
  [1, 2, 3, 4].forEach((n) => {
    const c = document.createElement("div");
    c.className = "col col-" + n;
    grid.appendChild(c);
    cols[n] = c;
  });

  const FOLDER_ICO = `<svg class="folder-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>`;
  const CHEV = `<svg class="group-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>`;

  // fi = index of the folder inside the group (-1 = link sits directly in the card)
  const linkRow = (l, gi, fi, li) => {
    const fav = favicon(l.url);
    const del = EDIT_MODE
      ? `<button class="link-del" data-g="${gi}" data-f="${fi}" data-l="${li}" title="remove link">✕</button>` : "";
    const copy = EDIT_MODE ? "" :
      `<button class="link-copy" data-url="${escHtml(l.url)}" title="copy link" aria-label="copy link">
         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>
       </button>`;
    return `
      <a class="link" href="${escHtml(l.url)}"${EDIT_MODE ? ' data-noclick="1"' : ""}>
        <span class="dot" data-letter="${escHtml(iconLetter(l.name))}">${fav ? `<img class="fav" src="${fav}" loading="lazy" alt="">` : ""}</span>
        <span class="link-name">${escHtml(l.name)}</span>${copy}${del}
      </a>`;
  };

  const addRowHtml = (gi, fi) => `
    <div class="link-add">
      <input class="la-name" placeholder="name" spellcheck="false" />
      <input class="la-url" placeholder="url" spellcheck="false" />
      <button class="la-btn" data-g="${gi}" data-f="${fi}" title="add link">+</button>
    </div>`;

  getGroups().forEach((g, gi) => {
    const el = document.createElement("section");
    el.className = "group";
    el.dataset.view = g.view;

    const items = g.links
      .map((item, ii) => {
        if (item.folder) {
          const inner = (item.links || []).map((l, li) => linkRow(l, gi, ii, li)).join("");
          const fhead = EDIT_MODE
            ? `<div class="folder-head">
                 ${FOLDER_ICO}
                 <input class="folder-rename" data-g="${gi}" data-f="${ii}" value="${escHtml(item.name)}" spellcheck="false" />
                 <button class="folder-del" data-g="${gi}" data-f="${ii}" title="delete folder">✕</button>
               </div>`
            : `<div class="folder-head" data-g="${gi}" data-f="${ii}" role="button" tabindex="0" title="open / close folder">
                 ${FOLDER_ICO}
                 <span class="folder-name">${escHtml(item.name)}</span>
                 <span class="group-count">${(item.links || []).length}</span>
                 ${CHEV}
               </div>`;
          return `<div class="folder${item.open || EDIT_MODE ? " open" : ""}">${fhead}
            <div class="folder-body"><div class="fb-inner">${inner}${EDIT_MODE ? addRowHtml(gi, ii) : ""}</div></div>
          </div>`;
        }
        return linkRow(item, gi, -1, ii);
      })
      .join("");

    const count = g.links.reduce((n, it) => n + (it.folder ? (it.links || []).length : 1), 0);

    const head = EDIT_MODE
      ? `<div class="group-head">
           <input class="group-rename" data-g="${gi}" value="${escHtml(g.title)}" spellcheck="false" />
           <button class="group-del" data-g="${gi}" title="delete group">✕</button>
         </div>`
      : `<div class="group-head">
           <span class="group-title">${escHtml(g.title)}</span>
           <span class="group-count">${count}</span>
         </div>`;

    const foot = EDIT_MODE
      ? addRowHtml(gi, -1) + `<button class="folder-add" data-g="${gi}">+ new folder</button>`
      : "";

    el.innerHTML = head + `<div class="links">${items}</div>` + foot;
    (cols[g.col] || cols[2]).appendChild(el);
  });

  // edit mode: a ghost "new group" card at the bottom of every column
  if (EDIT_MODE) {
    [1, 2, 3, 4].forEach((n) => {
      const ghost = document.createElement("div");
      ghost.className = "group ghost";
      ghost.dataset.view = CURRENT_VIEW;
      ghost.innerHTML = `
        <input class="ghost-name" placeholder="new group…" spellcheck="false" />
        <button class="ghost-btn" data-col="${n}" title="create group">+</button>`;
      cols[n].appendChild(ghost);
    });
  }

  wireGrid(grid);
  switchView(CURRENT_VIEW);

  // re-attach the screen-time card (renderGroups wiped the columns)
  if (typeof renderScreenCard === "function") renderScreenCard();

  // favicon failed (offline / no icon) → drop img, letter shows through
  grid.querySelectorAll("img.fav").forEach((img) =>
    img.addEventListener("error", () => img.remove())
  );
}

/* grid interactions */
function wireGrid(grid) {
  if (!EDIT_MODE) {
    // copy-link buttons
    grid.querySelectorAll(".link-copy").forEach((b) =>
      b.addEventListener("click", async (e) => {
        e.preventDefault(); e.stopPropagation();
        const ok = await copyText(b.dataset.url);
        if (ok) { b.classList.add("done"); toast("link copied"); setTimeout(() => b.classList.remove("done"), 900); }
        else toast("copy failed");
      })
    );

    // folders inside cards: header click folds / unfolds
    grid.querySelectorAll(".folder-head[data-f]").forEach((h) => {
      const toggle = () => {
        const item = getGroups()[+h.dataset.g].links[+h.dataset.f];
        item.open = !item.open;
        saveGroups();
        h.closest(".folder").classList.toggle("open", item.open);
      };
      h.addEventListener("click", toggle);
      h.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
      });
    });
    return;
  }

  grid.querySelectorAll("a.link[data-noclick]").forEach((a) =>
    a.addEventListener("click", (e) => e.preventDefault())
  );

  grid.querySelectorAll(".link-del").forEach((b) =>
    b.addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      const g = getGroups()[+b.dataset.g];
      const f = +b.dataset.f;
      (f >= 0 ? g.links[f].links : g.links).splice(+b.dataset.l, 1);
      saveGroups(); renderGroups();
    })
  );

  grid.querySelectorAll(".folder-rename").forEach((inp) =>
    inp.addEventListener("change", () => {
      getGroups()[+inp.dataset.g].links[+inp.dataset.f].name = inp.value.trim() || "folder";
      saveGroups();
    })
  );

  // delete folder (and its links): first click arms, second confirms
  grid.querySelectorAll(".folder-del").forEach((b) =>
    b.addEventListener("click", () => {
      if (b.dataset.arm) {
        getGroups()[+b.dataset.g].links.splice(+b.dataset.f, 1);
        saveGroups(); renderGroups(); toast("folder deleted");
      } else {
        b.dataset.arm = "1"; b.textContent = "sure?";
        setTimeout(() => { delete b.dataset.arm; b.textContent = "✕"; }, 2200);
      }
    })
  );

  grid.querySelectorAll(".folder-add").forEach((b) =>
    b.addEventListener("click", () => {
      getGroups()[+b.dataset.g].links.push({ folder: true, name: "new folder", links: [], open: true });
      saveGroups(); renderGroups();
    })
  );

  // delete group: first click arms, second confirms
  grid.querySelectorAll(".group-del").forEach((b) =>
    b.addEventListener("click", () => {
      if (b.dataset.arm) {
        getGroups().splice(+b.dataset.g, 1);
        saveGroups(); renderGroups(); toast("group deleted");
      } else {
        b.dataset.arm = "1"; b.textContent = "sure?";
        setTimeout(() => { delete b.dataset.arm; b.textContent = "✕"; }, 2200);
      }
    })
  );

  grid.querySelectorAll(".group-rename").forEach((inp) =>
    inp.addEventListener("change", () => {
      getGroups()[+inp.dataset.g].title = inp.value.trim() || "untitled";
      saveGroups();
    })
  );

  grid.querySelectorAll(".la-btn").forEach((b) =>
    b.addEventListener("click", () => {
      const box = b.parentElement;
      const name = box.querySelector(".la-name").value.trim();
      let url = box.querySelector(".la-url").value.trim();
      if (!name || !url) return toast("need a name and a url");
      if (!/^https?:\/\//i.test(url)) url = "https://" + url;
      const g = getGroups()[+b.dataset.g];
      const f = +b.dataset.f;
      (f >= 0 ? g.links[f].links : g.links).push({ name, url });
      saveGroups(); renderGroups();
    })
  );

  grid.querySelectorAll(".ghost-btn").forEach((b) =>
    b.addEventListener("click", () => {
      const name = b.parentElement.querySelector(".ghost-name").value.trim() || "new group";
      getGroups().push({ title: name, col: +b.dataset.col, view: CURRENT_VIEW, links: [] });
      saveGroups(); renderGroups();
    })
  );

  // enter submits the nearest add button
  grid.querySelectorAll(".link-add input, .ghost-name").forEach((inp) =>
    inp.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      const btn = inp.parentElement.querySelector(".la-btn, .ghost-btn");
      if (btn) btn.click();
    })
  );
}

// ---------- tab switching ----------
function switchView(view) {
  CURRENT_VIEW = view;
  document.querySelectorAll(".tab").forEach((t) =>
    t.classList.toggle("active", t.dataset.view === view)
  );
  document.querySelectorAll(".group").forEach((g) =>
    g.classList.toggle("hidden", g.dataset.view !== view)
  );
}

function setupTabs() {
  const tabs = getTabs();
  if (!tabs.some((t) => t.view === CURRENT_VIEW)) CURRENT_VIEW = tabs[0].view;
  renderTabs();
  switchView(CURRENT_VIEW);
}

// ---------- clock ----------
function tickClock() {
  const now = new Date();
  const t = document.getElementById("time");
  const d = document.getElementById("date");
  t.textContent = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  d.textContent = now.toLocaleDateString([], { weekday: "short", day: "numeric", month: "short" }).toUpperCase();
}

// ---------- greeting ----------
function setGreeting() {
  const h = new Date().getHours();
  let g = "welcome back";
  if (h < 6) g = "still up";
  else if (h < 12) g = "good morning";
  else if (h < 18) g = "good afternoon";
  else g = "good evening";
  document.getElementById("greeting").textContent = `${g}, ${SETTINGS.name || ""}`.trim();
}

// ---------- search ----------
function setupSearch() {
  const input = document.getElementById("searchInput");

  // no <form> — Enter handled by hand, page can never self-navigate
  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const q = input.value.trim();
    if (!q) return;

    // ">" = command mode
    if (handleCommandSubmit(q)) return;

    // launcher: Enter opens the highlighted link suggestion
    if (typeof launcherSubmit === "function" && launcherSubmit()) return;

    // looks like a url?
    const isUrl = /^(https?:\/\/)/i.test(q) ||
      /^[\w-]+(\.[\w-]+)+([\/?#].*)?$/i.test(q);

    if (isUrl) {
      window.location.href = q.startsWith("http") ? q : "https://" + q;
    } else {
      window.location.href =
        "https://search.brave.com/search?q=" + encodeURIComponent(q);
    }
  });

  // press "/" anywhere to focus search
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement !== input) {
      e.preventDefault();
      input.focus();
    }
  });
}

// ---------- weather (open-meteo, no api key) ----------
async function loadWeather() {
  if (!SETTINGS.city) return;
  const tempEl = document.getElementById("temp");
  const condEl = document.getElementById("cond");
  try {
    const geo = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(SETTINGS.city)}&count=1`
    ).then((r) => r.json());
    if (!geo.results || !geo.results.length) throw new Error("no city");
    const { latitude, longitude } = geo.results[0];

    const w = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code`
    ).then((r) => r.json());

    const temp = Math.round(w.current.temperature_2m);
    tempEl.textContent = `${temp}°`;
    condEl.textContent = weatherCodeText(w.current.weather_code);
  } catch {
    tempEl.textContent = "--°";
    condEl.textContent = "offline";
  }
}

function weatherCodeText(code) {
  const map = {
    0: "clear", 1: "mostly clear", 2: "cloudy", 3: "overcast",
    45: "fog", 48: "fog", 51: "drizzle", 53: "drizzle", 55: "drizzle",
    61: "rain", 63: "rain", 65: "heavy rain", 71: "snow", 73: "snow",
    75: "snow", 80: "showers", 81: "showers", 82: "showers",
    95: "storm", 96: "storm", 99: "storm",
  };
  return (map[code] || "···").toUpperCase();
}

// ---------- boot ----------
// saved settings override config defaults
SETTINGS.name = localStorage.getItem("name") || SETTINGS.name;
SETTINGS.city = localStorage.getItem("city") || SETTINGS.city;

renderGroups();
setupTabs();
document.getElementById("editBtn").addEventListener("click", () => toggleEditMode());
setupSearch();
setGreeting();
tickClock();
setInterval(tickClock, 1000 * 20);
loadWeather();
THEME.init();
setupCommands();
setupDashboard();
setupExtras();
setupStash();
setupVault();
