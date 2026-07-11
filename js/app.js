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
  html += EDIT_MODE
    ? `<button class="tab-add" id="tabAdd" title="new tab">+</button>`
    : `<button class="tab-add" id="tabAddLite" data-tip="new tab" aria-label="new tab">+</button>`;
  nav.innerHTML = html;
  wireTabs();
}

function wireTabs() {
  const nav = document.getElementById("tabs");

  nav.querySelectorAll(".tab[data-view]").forEach((b) => {
    b.addEventListener("click", () => switchView(b.dataset.view));
    b.addEventListener("contextmenu", (e) => { e.preventDefault(); tabCtx(b.dataset.view, e.clientX, e.clientY); });
  });

  const addNewTab = () => {
    const tabs = getTabs();
    const view = "tab-" + Date.now().toString(36);
    tabs.push({ name: "new tab", view });
    saveTabs();
    CURRENT_VIEW = view;
    renderTabs(); renderGroups();
    renameTab(view);
  };
  document.getElementById("tabAddLite")?.addEventListener("click", addNewTab);
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

/* =========================================================
   Inline board editing — context menus, add buttons, drag.
   Works without the pencil edit-mode.
   ========================================================= */
const CICON = {
  open: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>`,
  incognito: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11h16M7 11l1.5-5h7L17 11M9 16a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM19 16a2 2 0 1 1-4 0 2 2 0 0 1 4 0zM9 15c1-1 5-1 6 0"/></svg>`,
  edit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>`,
  link: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7 0l2-2a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7 0l-2 2a5 5 0 0 0 7 7l1-1"/></svg>`,
  folder: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>`,
};

let _ctxOnDoc = null;
function closeCtxMenu() {
  if (_ctxOnDoc) { document.removeEventListener("mousedown", _ctxOnDoc, true); _ctxOnDoc = null; }
  const m = document.getElementById("ctxMenu");
  if (m) m.remove();
}
function showContextMenu(x, y, items) {
  closeCtxMenu();
  const m = document.createElement("div");
  m.id = "ctxMenu";
  m.className = "ctx-menu";
  m.innerHTML = items.map((it, i) => it.sep
    ? `<div class="ctx-sep"></div>`
    : `<button class="ctx-item ${it.danger ? "danger" : ""}" data-i="${i}">${it.icon || ""}<span>${escHtml(it.label)}</span></button>`
  ).join("");
  document.body.appendChild(m);
  const r = m.getBoundingClientRect();
  m.style.left = Math.min(x, window.innerWidth - r.width - 8) + "px";
  m.style.top = Math.min(y, window.innerHeight - r.height - 8) + "px";
  m.querySelectorAll(".ctx-item").forEach((b) =>
    b.addEventListener("click", () => { const it = items[+b.dataset.i]; closeCtxMenu(); it.onClick && it.onClick(); }));
  requestAnimationFrame(() => m.classList.add("open"));
  // close only when the click/scroll is OUTSIDE the menu (so items still fire)
  _ctxOnDoc = (e) => { if (!e.target.closest("#ctxMenu")) closeCtxMenu(); };
  setTimeout(() => document.addEventListener("mousedown", _ctxOnDoc, true), 0);
}

function linkCtx(a, e) {
  const url = a.href;
  const r = a.getBoundingClientRect();
  showContextMenu(e ? e.clientX : r.left, e ? e.clientY : r.bottom, [
    { label: "Open", icon: CICON.open, onClick: () => { window.location.href = url; } },
    { label: "Open in new tab", icon: CICON.open, onClick: () => { try { chrome.tabs.create({ url }); } catch { window.open(url, "_blank"); } } },
    { label: "Open in incognito", icon: CICON.incognito, onClick: () => { try { chrome.windows.create({ url, incognito: true }); } catch { window.open(url, "_blank"); } } },
    { sep: true },
    { label: "Edit", icon: CICON.edit, onClick: () => editLink(a) },
    { label: "Delete", icon: CICON.trash, danger: true, onClick: () => deleteLink(a) },
  ]);
}

function linkArr(gi, fi) { const g = getGroups()[gi]; return fi >= 0 ? g.links[fi].links : g.links; }

function editLink(a) {
  const gi = +a.dataset.g, fi = +a.dataset.f, li = +a.dataset.l;
  const link = linkArr(gi, fi)[li];
  const form = document.createElement("div");
  form.className = "link-edit";
  form.innerHTML = `<input class="le-name" value="${escHtml(link.name)}" placeholder="name"><input class="le-url" value="${escHtml(link.url)}" placeholder="url"><button class="le-save">✓</button>`;
  a.replaceWith(form);
  const nm = form.querySelector(".le-name"); nm.focus(); nm.select();
  const save = () => {
    link.name = nm.value.trim() || link.name;
    let u = form.querySelector(".le-url").value.trim();
    if (u && !/^https?:\/\//i.test(u)) u = "https://" + u;
    if (u) link.url = u;
    saveGroups(); renderGroups();
  };
  form.querySelector(".le-save").addEventListener("click", save);
  form.querySelectorAll("input").forEach((i) => i.addEventListener("keydown", (e) => { if (e.key === "Enter") save(); if (e.key === "Escape") renderGroups(); }));
}

function deleteLink(a) {
  const gi = +a.dataset.g, fi = +a.dataset.f, li = +a.dataset.l;
  linkArr(gi, fi).splice(li, 1);
  saveGroups(); renderGroups(); toast("link removed");
}

function groupCtx(gi, x, y) {
  showContextMenu(x, y, [
    { label: "Rename", icon: CICON.edit, onClick: () => renameGroup(gi) },
    { label: "Add link", icon: CICON.link, onClick: () => addLinkInline(gi) },
    { label: "Add folder", icon: CICON.folder, onClick: () => addFolder(gi) },
    { label: "Open all links", icon: CICON.open, onClick: () => openAllLinks(gi) },
    { sep: true },
    { label: "Delete board", icon: CICON.trash, danger: true, onClick: () => deleteGroup(gi) },
  ]);
}

function renameGroup(gi) {
  const card = document.querySelector(`.group[data-g="${gi}"]`);
  if (!card) return;
  const titleEl = card.querySelector(".group-title");
  const inp = document.createElement("input");
  inp.className = "group-rename-inline";
  inp.value = getGroups()[gi].title;
  titleEl.replaceWith(inp);
  inp.focus(); inp.select();
  const save = () => { getGroups()[gi].title = inp.value.trim() || "untitled"; saveGroups(); renderGroups(); };
  inp.addEventListener("blur", save);
  inp.addEventListener("keydown", (e) => { if (e.key === "Enter") inp.blur(); if (e.key === "Escape") renderGroups(); });
}

function openAllLinks(gi) {
  const urls = [];
  getGroups()[gi].links.forEach((it) => it.folder ? (it.links || []).forEach((l) => urls.push(l.url)) : urls.push(it.url));
  urls.forEach((u) => { try { chrome.tabs.create({ url: u, active: false }); } catch { window.open(u, "_blank"); } });
  toast("opened " + urls.length + " link" + (urls.length === 1 ? "" : "s"));
}

function deleteGroup(gi) {
  getGroups().splice(gi, 1);
  saveGroups(); renderGroups(); toast("board deleted");
}

function addLinkInline(gi) {
  const links = document.querySelector(`.group[data-g="${gi}"] .links`);
  if (!links) return;
  const form = document.createElement("div");
  form.className = "link-edit";
  form.innerHTML = `<input class="le-name" placeholder="name"><input class="le-url" placeholder="url"><button class="le-save">＋</button>`;
  links.appendChild(form);
  form.querySelector(".le-name").focus();
  const save = () => {
    const name = form.querySelector(".le-name").value.trim();
    let url = form.querySelector(".le-url").value.trim();
    if (!name || !url) return toast("need a name and a url");
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    getGroups()[gi].links.push({ name, url });
    saveGroups(); renderGroups();
  };
  form.querySelector(".le-save").addEventListener("click", save);
  form.querySelectorAll("input").forEach((i) => i.addEventListener("keydown", (e) => { if (e.key === "Enter") save(); if (e.key === "Escape") renderGroups(); }));
}

function addFolder(gi) {
  getGroups()[gi].links.push({ folder: true, name: "new folder", links: [], open: true });
  saveGroups(); renderGroups();
}

function addBoard(col) {
  getGroups().push({ title: "new board", col, view: CURRENT_VIEW, links: [] });
  saveGroups(); renderGroups();
  renameGroup(getGroups().length - 1);
}

/* ----- tab (view) context menu, inline rename, delete ----- */
function tabCtx(view, x, y) {
  showContextMenu(x, y, [
    { label: "Rename", icon: CICON.edit, onClick: () => renameTab(view) },
    { sep: true },
    { label: "Delete tab", icon: CICON.trash, danger: true, onClick: () => deleteTab(view) },
  ]);
}
function renameTab(view) {
  switchView(view);
  const btn = document.querySelector(`.tab[data-view="${view}"]`);
  if (!btn) return;
  const inp = document.createElement("input");
  inp.className = "tab-rename-inline";
  inp.value = getTabs().find((t) => t.view === view)?.name || "";
  btn.replaceWith(inp);
  inp.focus(); inp.select();
  const save = () => {
    const t = getTabs().find((x) => x.view === view);
    if (t) { t.name = inp.value.trim() || "tab"; saveTabs(); }
    renderTabs();
  };
  inp.addEventListener("blur", save);
  inp.addEventListener("keydown", (e) => { if (e.key === "Enter") inp.blur(); if (e.key === "Escape") renderTabs(); });
}
function deleteTab(view) {
  const tabs = getTabs();
  if (tabs.length <= 1) return toast("keep at least one tab");
  LIVE_GROUPS = getGroups().filter((g) => g.view !== view);
  saveGroups();
  const i = tabs.findIndex((t) => t.view === view);
  tabs.splice(i, 1);
  saveTabs();
  CURRENT_VIEW = tabs[Math.max(0, i - 1)].view;
  renderTabs(); renderGroups();
  toast("tab deleted");
}

/* ----- folder context menu, inline rename, delete ----- */
function folderCtx(gi, fi, x, y) {
  showContextMenu(x, y, [
    { label: "Rename", icon: CICON.edit, onClick: () => renameFolder(gi, fi) },
    { label: "Add link", icon: CICON.link, onClick: () => addLinkToFolder(gi, fi) },
    { sep: true },
    { label: "Delete folder", icon: CICON.trash, danger: true, onClick: () => deleteFolder(gi, fi) },
  ]);
}
function renameFolder(gi, fi) {
  const head = document.querySelector(`.folder-head[data-g="${gi}"][data-f="${fi}"]`);
  if (!head) return;
  const nameEl = head.querySelector(".folder-name");
  const inp = document.createElement("input");
  inp.className = "folder-rename-inline";
  inp.value = getGroups()[gi].links[fi].name;
  nameEl.replaceWith(inp);
  inp.focus(); inp.select();
  inp.addEventListener("click", (e) => e.stopPropagation());
  const save = () => { getGroups()[gi].links[fi].name = inp.value.trim() || "folder"; saveGroups(); renderGroups(); };
  inp.addEventListener("blur", save);
  inp.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") inp.blur(); if (e.key === "Escape") renderGroups(); });
}
function deleteFolder(gi, fi) {
  getGroups()[gi].links.splice(fi, 1);
  saveGroups(); renderGroups(); toast("folder removed");
}
function addLinkToFolder(gi, fi) {
  getGroups()[gi].links[fi].open = true;
  const head = document.querySelector(`.folder-head[data-g="${gi}"][data-f="${fi}"]`);
  const folder = head?.closest(".folder");
  if (!folder) return;
  folder.classList.add("open");
  const inner = folder.querySelector(".fb-inner");
  const form = document.createElement("div");
  form.className = "link-edit";
  form.innerHTML = `<input class="le-name" placeholder="name"><input class="le-url" placeholder="url"><button class="le-save">＋</button>`;
  inner.appendChild(form);
  form.querySelector(".le-name").focus();
  const save = () => {
    const name = form.querySelector(".le-name").value.trim();
    let url = form.querySelector(".le-url").value.trim();
    if (!name || !url) return toast("need a name and a url");
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;
    getGroups()[gi].links[fi].links.push({ name, url });
    saveGroups(); renderGroups();
  };
  form.querySelector(".le-save").addEventListener("click", save);
  form.querySelectorAll("input").forEach((i) => i.addEventListener("keydown", (e) => { if (e.key === "Enter") save(); if (e.key === "Escape") renderGroups(); }));
}

/* drag to reorder boards — with a placeholder gap showing the drop spot */
let DRAG_GI = null, DRAG_CARD = null, DRAG_PH = null;
function onBoardDragStart(e, gi, card) {
  DRAG_GI = gi; DRAG_CARD = card;
  e.dataTransfer.effectAllowed = "move";
  try { e.dataTransfer.setData("text/plain", "board"); } catch {}
  // neutralize the hover accent BEFORE the browser snapshots the drag image
  card.style.borderColor = "var(--border)";
  card.style.boxShadow = "none";
  card.style.transform = "none";
  DRAG_PH = document.createElement("div");
  DRAG_PH.className = "board-ph";
  setTimeout(() => card.classList.add("dragging"), 0);
}
function boardDragOver(col, y) {
  if (DRAG_GI === null || !DRAG_PH) return;
  const cards = [...col.querySelectorAll(".group[data-g]:not(.dragging)")];
  let after = null;
  for (const c of cards) { const b = c.getBoundingClientRect(); if (y < b.top + b.height / 2) { after = c; break; } }
  const colAdd = col.querySelector(".col-add");
  if (after) col.insertBefore(DRAG_PH, after);
  else if (colAdd) col.insertBefore(DRAG_PH, colAdd);
  else col.appendChild(DRAG_PH);
}
function onBoardDrop() {
  if (DRAG_GI === null || !DRAG_PH || !DRAG_CARD) return cleanupDrag();
  DRAG_PH.replaceWith(DRAG_CARD);
  // rebuild the group order + column from the DOM
  const order = [];
  document.querySelectorAll("#grid .col").forEach((col, i) => {
    col.querySelectorAll(".group[data-g]").forEach((card) => {
      const grp = getGroups()[+card.dataset.g];
      if (grp) { grp.col = i + 1; order.push(grp); }
    });
  });
  LIVE_GROUPS = order;
  cleanupDrag();
  saveGroups(); renderGroups();
}
function cleanupDrag() {
  if (DRAG_CARD) {
    DRAG_CARD.classList.remove("dragging");
    DRAG_CARD.style.borderColor = "";
    DRAG_CARD.style.boxShadow = "";
    DRAG_CARD.style.transform = "";
  }
  if (DRAG_PH) DRAG_PH.remove();
  DRAG_GI = null; DRAG_CARD = null; DRAG_PH = null;
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
      <a class="link" href="${escHtml(l.url)}" data-g="${gi}" data-f="${fi}" data-l="${li}" draggable="false"${EDIT_MODE ? ' data-noclick="1"' : ""}>
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
      : `<div class="group-head" draggable="true" data-g="${gi}">
           <span class="group-title">${escHtml(g.title)}</span>
           <span class="group-count">${count}</span>
           <button class="grp-menu" data-g="${gi}" data-tip="options" aria-label="board options"><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg></button>
         </div>`;

    const foot = EDIT_MODE
      ? addRowHtml(gi, -1) + `<button class="folder-add" data-g="${gi}">+ new folder</button>`
      : "";

    if (!EDIT_MODE) el.dataset.g = gi;
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
  } else {
    // a hover "+" add-board zone at the bottom of every column
    [1, 2, 3, 4].forEach((n) => {
      const add = document.createElement("button");
      add.className = "col-add";
      add.dataset.col = n;
      add.dataset.view = CURRENT_VIEW;
      add.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg><span>add board</span>`;
      cols[n].appendChild(add);
    });
  }

  wireGrid(grid);
  switchView(CURRENT_VIEW);

  // re-attach the calendar card (renderGroups wiped the columns)
  if (typeof renderCalendarCard === "function") renderCalendarCard();

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

    // folders inside cards: header click folds / unfolds, right-click → menu
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
      h.addEventListener("contextmenu", (e) => { e.preventDefault(); e.stopPropagation(); folderCtx(+h.dataset.g, +h.dataset.f, e.clientX, e.clientY); });
    });

    // right-click a link → context menu
    grid.querySelectorAll("a.link").forEach((a) =>
      a.addEventListener("contextmenu", (e) => { e.preventDefault(); linkCtx(a, e); }));

    // ⋯ board menu
    grid.querySelectorAll(".grp-menu").forEach((b) =>
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        const r = b.getBoundingClientRect();
        groupCtx(+b.dataset.g, r.right, r.bottom + 4);
      }));

    // right-click a board header → same menu
    grid.querySelectorAll(".group-head[data-g]").forEach((h) =>
      h.addEventListener("contextmenu", (e) => { e.preventDefault(); groupCtx(+h.dataset.g, e.clientX, e.clientY); }));

    // "+ add board" at the bottom of a column
    grid.querySelectorAll(".col-add").forEach((b) =>
      b.addEventListener("click", () => addBoard(+b.dataset.col)));

    // drag a board header to reorder (placeholder shows the drop spot)
    grid.querySelectorAll(".group-head[data-g][draggable]").forEach((h) => {
      const card = h.closest(".group");
      h.addEventListener("dragstart", (e) => onBoardDragStart(e, +h.dataset.g, card));
      h.addEventListener("dragend", cleanupDrag);
    });
    grid.querySelectorAll(".col").forEach((col) => {
      col.addEventListener("dragover", (e) => { if (DRAG_GI !== null) { e.preventDefault(); boardDragOver(col, e.clientY); } });
      col.addEventListener("drop", (e) => { if (DRAG_GI !== null) { e.preventDefault(); onBoardDrop(); } });
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
      goTo(q.startsWith("http") ? q : "https://" + q);
    } else {
      goTo("https://search.brave.com/search?q=" + encodeURIComponent(q));
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
let WX = null; // latest weather snapshot for the popup

async function loadWeather() {
  if (!SETTINGS.city) return;
  const tempEl = document.getElementById("temp");
  const condEl = document.getElementById("cond");
  try {
    const geo = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(SETTINGS.city)}&count=1`
    ).then((r) => r.json());
    if (!geo.results || !geo.results.length) throw new Error("no city");
    const { latitude, longitude, name } = geo.results[0];

    const w = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}` +
      `&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code`
    ).then((r) => r.json());

    const c = w.current;
    WX = {
      city: name || SETTINGS.city,
      temp: Math.round(c.temperature_2m),
      feels: Math.round(c.apparent_temperature),
      humidity: Math.round(c.relative_humidity_2m),
      wind: Math.round(c.wind_speed_10m),
      code: c.weather_code,
      at: new Date(),
    };
    tempEl.textContent = `${WX.temp}°`;
    condEl.textContent = weatherCodeText(WX.code);
    if (!document.getElementById("wxPop").classList.contains("hidden")) buildWxPop();
  } catch {
    WX = null;
    tempEl.textContent = "--°";
    condEl.textContent = "offline";
    if (!document.getElementById("wxPop").classList.contains("hidden")) buildWxPop();
  }
}

// emoji + friendly label for a WMO weather code
function weatherCodeEmoji(code) {
  if (code === 0) return "☀️";
  if (code === 1 || code === 2) return "🌤️";
  if (code === 3) return "☁️";
  if (code === 45 || code === 48) return "🌫️";
  if (code >= 51 && code <= 57) return "🌦️";
  if (code >= 61 && code <= 67) return "🌧️";
  if (code >= 71 && code <= 77) return "❄️";
  if (code >= 80 && code <= 82) return "🌦️";
  if (code >= 85 && code <= 86) return "🌨️";
  if (code >= 95) return "⛈️";
  return "🌡️";
}
function weatherCodeNice(code) {
  const map = {
    0: "Clear sky", 1: "Mostly clear", 2: "Partly cloudy", 3: "Overcast",
    45: "Fog", 48: "Rime fog", 51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle",
    61: "Light rain", 63: "Rain", 65: "Heavy rain", 71: "Light snow", 73: "Snow",
    75: "Heavy snow", 77: "Snow grains", 80: "Light showers", 81: "Showers", 82: "Heavy showers",
    85: "Snow showers", 86: "Snow showers", 95: "Thunderstorm", 96: "Thunderstorm", 99: "Thunderstorm",
  };
  return map[code] || "···";
}

function openWxPop(force) {
  const pop = document.getElementById("wxPop");
  const show = force !== undefined ? force : pop.classList.contains("hidden");
  if (show) {
    buildWxPop();
    pop.classList.remove("hidden");
    if (!WX) loadWeather();
  } else {
    pop.classList.add("hidden");
  }
}

function buildWxPop() {
  const el = document.getElementById("wxPop");
  if (!WX) {
    el.innerHTML = `
      <div class="wx-head">
        <span class="wx-city">${SETTINGS.city || "weather"}</span>
        <button class="wx-x" aria-label="close">×</button>
      </div>
      <div class="wx-empty">weather offline — set a city in settings</div>
      <button class="wx-refresh"><span>↺</span> Refresh</button>`;
  } else {
    const time = WX.at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    el.innerHTML = `
      <div class="wx-head">
        <span class="wx-city">${WX.city}</span>
        <button class="wx-x" aria-label="close">×</button>
      </div>
      <div class="wx-main">
        <span class="wx-emoji">${weatherCodeEmoji(WX.code)}</span>
        <div class="wx-now">
          <span class="wx-big">${WX.temp}°C</span>
          <span class="wx-desc">${weatherCodeNice(WX.code)}</span>
        </div>
      </div>
      <div class="wx-rows">
        <div class="wx-row">Feels like ${WX.feels}°C</div>
        <div class="wx-row">Wind ${WX.wind} km/h</div>
        <div class="wx-row">Humidity ${WX.humidity}%</div>
      </div>
      <div class="wx-updated">Updated ${time}</div>
      <button class="wx-refresh"><span>↺</span> Refresh</button>`;
  }

  el.querySelector(".wx-x").addEventListener("click", (e) => { e.stopPropagation(); openWxPop(false); });
  el.querySelector(".wx-refresh").addEventListener("click", (e) => {
    e.stopPropagation();
    const b = e.currentTarget; b.classList.add("spin");
    loadWeather().finally(() => setTimeout(() => b.classList.remove("spin"), 500));
  });
}

function setupWxPop() {
  const w = document.getElementById("weather");
  w.style.cursor = "pointer";
  w.addEventListener("click", (e) => { e.stopPropagation(); openWxPop(); });
  document.getElementById("wxPop").addEventListener("click", (e) => e.stopPropagation());
  document.addEventListener("click", () => openWxPop(false));
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
setupMusicLinkGuard();
setupTopSites();
setupWxPop();
styleTooltips();

/* turn native title="" tooltips on the main buttons into the styled data-tip ones */
function styleTooltips() {
  document.querySelectorAll(
    ".topbar [title], .side-btns [title], .media-acts [title], .media-foot [title]"
  ).forEach((el) => {
    const t = el.getAttribute("title");
    if (t) { el.setAttribute("data-tip", t); el.removeAttribute("title"); }
  });
}

/* ---------- most-visited row (7, expandable to 12) ---------- */
let TOP_SITES = [];
let TOP_EXPANDED = localStorage.getItem("topExpanded") === "1";

function setupTopSites() {
  try {
    if (!chrome.topSites) return;
    chrome.topSites.get((sites) => { TOP_SITES = sites || []; renderTopSites(); });
    // close the options menu on any outside click
    document.addEventListener("click", (e) => {
      const m = document.querySelector(".top-menu:not(.hidden)");
      if (m && !e.target.closest(".top-opts")) m.classList.add("hidden");
    });
  } catch {}
}

function topName(s) {
  let host = "";
  try { host = new URL(s.url).hostname.replace(/^www\./, ""); } catch {}
  const base = host.split(".")[0] || s.title || "site";
  const name = (s.title && s.title.length <= 18) ? s.title : base;
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function toggleTopVisible() {
  localStorage.setItem("topHidden", localStorage.getItem("topHidden") === "1" ? "0" : "1");
  renderTopSites();
}

function renderTopSites() {
  const el = document.getElementById("topSites");
  if (!el) return;
  if (!TOP_SITES.length || localStorage.getItem("topHidden") === "1") { el.classList.add("hidden"); return; }

  const max = TOP_EXPANDED ? 12 : 7;
  el.innerHTML = TOP_SITES.slice(0, max).map((s) => {
    const name = topName(s);
    return `
    <a class="top-tile" data-tip="${escHtml(name)}" data-letter="${escHtml((name[0] || "?").toUpperCase())}" href="${escHtml(s.url)}">
      <img src="${favicon(s.url)}" loading="lazy" alt="">
    </a>`;
  }).join("");

  // broken favicon → clean letter fallback (no empty/red tile)
  el.querySelectorAll("img").forEach((img) =>
    img.addEventListener("error", () => {
      const a = img.closest(".top-tile");
      const span = document.createElement("span");
      span.className = "tt-letter";
      span.textContent = (a && a.dataset.letter) || "?";
      img.replaceWith(span);
    })
  );

  // ⋯ options button
  const opts = document.createElement("div");
  opts.className = "top-opts";
  opts.innerHTML = `
    <button class="top-dots" data-tip="options" aria-label="options">⋯</button>
    <div class="top-menu hidden">
      <button data-act="expand">${TOP_EXPANDED ? "show 7" : "show 12"}</button>
      <button data-act="hide">hide row</button>
    </div>`;
  el.appendChild(opts);

  const menu = opts.querySelector(".top-menu");
  opts.querySelector(".top-dots").addEventListener("click", (e) => { e.stopPropagation(); menu.classList.toggle("hidden"); });
  opts.querySelector('[data-act="expand"]').addEventListener("click", () => {
    TOP_EXPANDED = !TOP_EXPANDED;
    localStorage.setItem("topExpanded", TOP_EXPANDED ? "1" : "0");
    renderTopSites();
  });
  opts.querySelector('[data-act="hide"]').addEventListener("click", () => {
    localStorage.setItem("topHidden", "1");
    renderTopSites();
    toast("most-visited hidden — >visited to show it again");
  });

  el.classList.remove("hidden");
}

/* navigate: open a new tab while music plays (so the sound keeps going),
   otherwise same tab as normal */
function musicPlaying() {
  return typeof PLAYER !== "undefined" && PLAYER.audio && !PLAYER.audio.paused &&
    (PLAYER.idx >= 0 || PLAYER.stream);
}
function goTo(url) {
  if (musicPlaying()) {
    try { chrome.tabs.create({ url }); return; } catch { window.open(url, "_blank"); return; }
  }
  window.location.href = url;
}

/* clicking a link/dock/top-site tile while music plays opens it in a new tab */
function setupMusicLinkGuard() {
  document.addEventListener("click", (e) => {
    if (!musicPlaying()) return;
    const a = e.target.closest("a.link, a.dock-link, a.top-tile");
    if (!a || !a.href || a.target === "_blank" || a.dataset.noclick) return;
    e.preventDefault();
    try { chrome.tabs.create({ url: a.href }); }
    catch { window.open(a.href, "_blank"); }
  }, true);
}
