/* =========================================================
   stash.js — "saved things" mode (new-tab board).
   Categories are picked from a dropdown; items can hold more
   than one. An "untagged" bucket, a filter dropdown, and live
   sync when the popup / in-page card saves from elsewhere.
   Open with the bookmark button, Alt+S, or >stash.
   ========================================================= */

const STASH = { filter: "all", q: "", sel: new Set(), manage: false };

function openStash(force) {
  const el = document.getElementById("stash");
  const show = force !== undefined ? force : el.classList.contains("hidden");
  el.classList.toggle("hidden", !show);
  document.body.classList.toggle("stash-open", show);
  if (show) { renderStash(); document.getElementById("stashName").focus(); }
}

/* quick-save from the ">save" command (no category) */
function quickSaveStash(text) {
  text = (text || "").trim();
  if (!text) return toast("save what?");
  let name = text, url = "";
  if (/^https?:\/\//i.test(text)) {
    url = text;
    try { name = new URL(text).hostname.replace(/^www\./, ""); } catch {}
  }
  StashCore.addItem({ id: StashCore.newId(), name, url, tags: [], done: false, added: Date.now() });
  if (!document.getElementById("stash").classList.contains("hidden")) renderStash();
  toast("saved · " + name);
}

function addStashItem() {
  const nameEl = document.getElementById("stashName");
  const urlEl = document.getElementById("stashUrl");
  const name = nameEl.value.trim();
  let url = urlEl.value.trim();
  if (!name && !url) return toast("give it a name");
  if (url && !/^https?:\/\//i.test(url)) url = "https://" + url;
  StashCore.addItem({
    id: StashCore.newId(),
    name: name || url,
    url,
    tags: [...STASH.sel],
    done: false,
    added: Date.now(),
  });
  nameEl.value = ""; urlEl.value = ""; // keep selected categories for fast repeat
  renderStash();
  nameEl.focus();
}

/* the add-category dropdown + selected chips (and manage mode) */
function renderCatControls() {
  const cats = StashCore.loadTags();

  const dd = document.getElementById("stashCatSel");
  const unpicked = cats.filter((c) => !STASH.sel.has(c));
  dd.innerHTML =
    `<option value="">＋ add category…</option>` +
    unpicked.map((c) => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join("") +
    `<option value="__new">✚ new category…</option>`;

  const sel = document.getElementById("stashSel");
  if (STASH.manage) {
    // manage mode: every category with an ✕ to delete from the master list
    sel.innerHTML = cats.length
      ? cats.map((c) => `<span class="selchip manage">${escHtml(c)}<button class="selx" data-del="${escHtml(c)}">✕</button></span>`).join("")
      : `<span class="pick-empty">no categories — add one</span>`;
    sel.querySelectorAll(".selx").forEach((b) =>
      b.addEventListener("click", () => {
        StashCore.removeTag(b.dataset.del);
        STASH.sel.delete(b.dataset.del);
        renderCatControls();
      })
    );
  } else {
    // normal: the categories chosen for the next item
    sel.innerHTML = [...STASH.sel]
      .map((c) => `<span class="selchip">${escHtml(c)}<button class="selx" data-rm="${escHtml(c)}">✕</button></span>`)
      .join("");
    sel.querySelectorAll(".selx").forEach((b) =>
      b.addEventListener("click", () => { STASH.sel.delete(b.dataset.rm); renderCatControls(); })
    );
  }
}

function usedTags(items) {
  const s = new Set();
  items.forEach((i) => (i.tags || []).forEach((t) => s.add(t)));
  return [...s];
}

function renderStash() {
  const items = StashCore.loadItems();
  document.getElementById("stashCount").textContent = items.length;

  renderCatControls();

  // filter dropdown: all · each used category · untagged
  const hasUntagged = items.some((i) => !i.tags || !i.tags.length);
  const opts = ["all", ...usedTags(items).sort()];
  if (hasUntagged) opts.push("untagged");
  const fdd = document.getElementById("stashFilter");
  fdd.innerHTML = opts
    .map((c) => `<option value="${escHtml(c)}" ${STASH.filter === c ? "selected" : ""}>${c === "all" ? "all categories" : escHtml(c)}</option>`)
    .join("");

  // filter the list
  let list = items;
  if (STASH.filter === "untagged") list = list.filter((i) => !i.tags || !i.tags.length);
  else if (STASH.filter !== "all") list = list.filter((i) => (i.tags || []).includes(STASH.filter));
  if (STASH.q) list = list.filter((i) => i.name.toLowerCase().includes(STASH.q));

  const grid = document.getElementById("stashGrid");
  if (!list.length) {
    grid.innerHTML = `<div class="stash-empty">nothing here — save something above ↑, or right-click text/links on any page</div>`;
    return;
  }

  grid.innerHTML = list
    .map((i) => {
      const fav = i.url ? favicon(i.url) : null;
      const ico = fav
        ? `<img src="${fav}" alt="" loading="lazy">`
        : `<span>${escHtml((i.name[0] || "?").toUpperCase())}</span>`;
      const tags = (i.tags && i.tags.length)
        ? i.tags.map((t) => `<span class="sc-tag">${escHtml(t)}</span>`).join("")
        : `<span class="sc-tag untagged">untagged</span>`;
      return `
      <div class="stash-card ${i.done ? "done" : ""}" data-id="${i.id}">
        <div class="sc-ico">${ico}</div>
        <div class="sc-body">
          <div class="sc-name">${escHtml(i.name)}</div>
          <div class="sc-tags">${tags}</div>
        </div>
        <div class="sc-actions">
          ${i.url ? `<a class="sc-open" href="${escHtml(i.url)}" title="open">↗</a>` : ""}
          <button class="sc-done" data-id="${i.id}" title="mark done">✓</button>
          <button class="sc-del" data-id="${i.id}" title="remove">✕</button>
        </div>
      </div>`;
    })
    .join("");

  grid.querySelectorAll(".sc-done").forEach((b) =>
    b.addEventListener("click", () => {
      const arr = StashCore.loadItems();
      const it = arr.find((x) => x.id === b.dataset.id);
      if (it) { it.done = !it.done; StashCore.saveItems(arr); renderStash(); }
    })
  );
  grid.querySelectorAll(".sc-del").forEach((b) =>
    b.addEventListener("click", () => {
      StashCore.saveItems(StashCore.loadItems().filter((x) => x.id !== b.dataset.id));
      renderStash();
    })
  );
}

function setupStash() {
  document.getElementById("stashOpenBtn").addEventListener("click", () => openStash());
  document.getElementById("stashClose").addEventListener("click", () => openStash(false));
  document.getElementById("stashAdd").addEventListener("click", addStashItem);
  ["stashName", "stashUrl"].forEach((id) =>
    document.getElementById(id).addEventListener("keydown", (e) => { if (e.key === "Enter") addStashItem(); })
  );

  const dd = document.getElementById("stashCatSel");
  const newCat = document.getElementById("stashNewCat");
  dd.addEventListener("change", () => {
    const v = dd.value;
    if (v === "__new") {
      newCat.style.display = "";
      newCat.focus();
    } else if (v) {
      STASH.sel.add(v);
      renderCatControls();
    }
    dd.value = "";
  });
  const commitNewCat = () => {
    const t = StashCore.addTag(newCat.value);
    if (t) STASH.sel.add(t);
    newCat.value = ""; newCat.style.display = "none";
    renderCatControls();
  };
  newCat.addEventListener("keydown", (e) => { if (e.key === "Enter") commitNewCat(); });
  newCat.addEventListener("blur", () => { if (newCat.value.trim()) commitNewCat(); else newCat.style.display = "none"; });

  document.getElementById("stashEditTags").addEventListener("click", () => {
    STASH.manage = !STASH.manage;
    document.getElementById("stashEditTags").classList.toggle("on", STASH.manage);
    renderCatControls();
  });

  document.getElementById("stashFilter").addEventListener("change", (e) => {
    STASH.filter = e.target.value;
    renderStash();
  });

  const q = document.getElementById("stashSearch");
  q.addEventListener("input", () => { STASH.q = q.value.trim().toLowerCase(); renderStash(); });

  // shared store; re-render live whenever any surface changes it
  StashCore.init(() => { if (!document.getElementById("stash").classList.contains("hidden")) renderStash(); });
  StashCore.onChange(() => { if (!document.getElementById("stash").classList.contains("hidden")) renderStash(); });

  document.addEventListener("keydown", (e) => {
    if (e.altKey && e.key.toLowerCase() === "s") { e.preventDefault(); openStash(); }
    if (e.key === "Escape") openStash(false);
  });
}
