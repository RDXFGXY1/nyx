/* =========================================================
   stash.js — the "bookmarks" mode (new-tab board).

   Browses your REAL browser bookmarks: folders you already have
   show up as folders, and nothing is ever wiped. Click a folder
   to go in, use the breadcrumb / ↑ to come back, search to look
   across every bookmark at once.
   Open with the bookmark button, Alt+S, or >stash.
   ========================================================= */

const STASH = { folder: BookmarksCore.ROOT, q: "" };

function openStash(force) {
  const el = document.getElementById("stash");
  const show = force !== undefined ? force : el.classList.contains("hidden");
  el.classList.toggle("hidden", !show);
  document.body.classList.toggle("stash-open", show);
  if (show) { renderStash(); document.getElementById("stashName").focus(); }
}

/* You can't create anything directly in the invisible root. */
function stashParent() {
  return STASH.folder === BookmarksCore.ROOT ? BookmarksCore.DEFAULT_PARENT : STASH.folder;
}

/* quick-save from the ">save" command */
async function quickSaveStash(text) {
  text = (text || "").trim();
  if (!text) return toast("save what?");
  let title = text, url = "";
  if (/^https?:\/\//i.test(text)) {
    url = text;
    try { title = new URL(text).hostname.replace(/^www\./, ""); } catch {}
  } else {
    return toast("give me a link to bookmark");
  }
  await BookmarksCore.create({ parentId: stashParent(), title, url });
  if (!document.getElementById("stash").classList.contains("hidden")) renderStash();
  toast("bookmarked · " + title);
}

/* the add row: a link makes a bookmark, an empty link makes a folder */
async function addStashItem() {
  const nameEl = document.getElementById("stashName");
  const urlEl = document.getElementById("stashUrl");
  const title = nameEl.value.trim();
  let url = urlEl.value.trim();

  if (!title && !url) return toast("give it a title");
  if (url && !/^https?:\/\//i.test(url)) url = "https://" + url;

  const made = url
    ? await BookmarksCore.create({ parentId: stashParent(), title: title || url, url })
    : await BookmarksCore.create({ parentId: stashParent(), title });

  if (!made) return toast("couldn't add that");
  nameEl.value = ""; urlEl.value = "";
  toast(url ? "bookmarked" : "folder created");
  renderStash();
  nameEl.focus();
}

function renderCrumbs(trail) {
  const bar = document.getElementById("bmCrumbs");
  const parts = [{ id: BookmarksCore.ROOT, title: "all bookmarks" }, ...trail];
  bar.innerHTML = parts
    .map((p, i) => {
      const last = i === parts.length - 1;
      return `<button class="crumb ${last ? "on" : ""}" data-go="${escHtml(p.id)}">${escHtml(p.title)}</button>` +
             (last ? "" : `<span class="crumb-sep">›</span>`);
    })
    .join("");
  bar.querySelectorAll(".crumb").forEach((b) =>
    b.addEventListener("click", () => { STASH.folder = b.dataset.go; STASH.q = ""; document.getElementById("stashSearch").value = ""; renderStash(); })
  );
  document.getElementById("bmUp").style.visibility = trail.length ? "visible" : "hidden";
}

async function renderStash() {
  const grid = document.getElementById("stashGrid");
  const countEl = document.getElementById("stashCount");

  if (!BookmarksCore.hasApi()) {
    grid.innerHTML = `<div class="stash-empty">bookmarks aren't available here — reload the extension so it can pick up the new permission</div>`;
    return;
  }

  const searching = !!STASH.q;
  const nodes = searching
    ? await BookmarksCore.search(STASH.q)
    : await BookmarksCore.children(STASH.folder);

  renderCrumbs(searching ? [] : await BookmarksCore.path(STASH.folder));
  document.querySelector(".bm-bar").classList.toggle("searching", searching);

  const folders = nodes.filter((n) => BookmarksCore.isFolder(n));
  const links = nodes.filter((n) => !BookmarksCore.isFolder(n));
  countEl.textContent = links.length;

  if (!nodes.length) {
    grid.innerHTML = `<div class="stash-empty">${
      searching ? "nothing matches that" : "this folder is empty — add a link above ↑"
    }</div>`;
    return;
  }

  // folders first, then links — folders carry a child count
  const counts = await Promise.all(folders.map((f) => BookmarksCore.countUnder(f.id)));

  grid.innerHTML =
    folders
      .map((f, i) => `
      <div class="stash-card folder" data-folder="${escHtml(f.id)}">
        <div class="sc-ico folder-ico">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
        </div>
        <div class="sc-body">
          <div class="sc-name">${escHtml(f.title || "(untitled)")}</div>
          <div class="sc-sub">${counts[i]} bookmark${counts[i] === 1 ? "" : "s"}</div>
        </div>
        <div class="sc-actions">
          <button class="sc-del" data-deltree="${escHtml(f.id)}" title="delete folder">✕</button>
        </div>
      </div>`)
      .join("") +
    links
      .map((b) => {
        const fav = b.url ? favicon(b.url) : null;
        let host = "";
        try { host = new URL(b.url).hostname.replace(/^www\./, ""); } catch {}
        const ico = fav
          ? `<img src="${fav}" alt="" loading="lazy">`
          : `<span>${escHtml((b.title[0] || "?").toUpperCase())}</span>`;
        return `
      <a class="stash-card link" href="${escHtml(b.url)}" data-id="${escHtml(b.id)}">
        <div class="sc-ico">${ico}</div>
        <div class="sc-body">
          <div class="sc-name">${escHtml(b.title || host || b.url)}</div>
          <div class="sc-sub">${escHtml(host)}</div>
        </div>
        <div class="sc-actions">
          <button class="sc-del" data-del="${escHtml(b.id)}" title="remove">✕</button>
        </div>
      </a>`;
      })
      .join("");

  // open a folder
  grid.querySelectorAll(".stash-card.folder").forEach((c) =>
    c.addEventListener("click", (e) => {
      if (e.target.closest(".sc-del")) return;
      STASH.folder = c.dataset.folder;
      STASH.q = ""; document.getElementById("stashSearch").value = "";
      renderStash();
    })
  );

  // delete a bookmark
  grid.querySelectorAll("[data-del]").forEach((b) =>
    b.addEventListener("click", async (e) => {
      e.preventDefault(); e.stopPropagation();
      await BookmarksCore.remove(b.dataset.del);
      toast("removed");
      renderStash();
    })
  );

  // delete a folder (and everything in it) — always confirm
  grid.querySelectorAll("[data-deltree]").forEach((b) =>
    b.addEventListener("click", async (e) => {
      e.preventDefault(); e.stopPropagation();
      const card = b.closest(".stash-card");
      const name = card ? card.querySelector(".sc-name").textContent : "this folder";
      if (!confirm(`Delete “${name}” and everything inside it?`)) return;
      await BookmarksCore.removeTree(b.dataset.deltree);
      toast("folder deleted");
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

  document.getElementById("bmUp").addEventListener("click", async () => {
    const n = await BookmarksCore.node(STASH.folder);
    STASH.folder = (n && n.parentId) || BookmarksCore.ROOT;
    renderStash();
  });

  const q = document.getElementById("stashSearch");
  let t = null;
  q.addEventListener("input", () => {
    clearTimeout(t);
    t = setTimeout(() => { STASH.q = q.value.trim(); renderStash(); }, 120);
  });

  // live re-render when bookmarks change anywhere (another tab, the bookmark bar…)
  BookmarksCore.onChange(() => {
    if (!document.getElementById("stash").classList.contains("hidden")) renderStash();
  });

  document.addEventListener("keydown", (e) => {
    if (e.altKey && e.key.toLowerCase() === "s") { e.preventDefault(); openStash(); }
    if (e.key === "Escape") openStash(false);
  });
}
