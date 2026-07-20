/* =========================================================
   bookmarksCore.js — the saved tab's data layer.

   Reads your REAL browser bookmarks (chrome.bookmarks) instead
   of a private store, so nothing is ever lost and folders you
   already have show up as-is. Everything is promise-based.

   Node shape: { id, parentId, title, url?, children? }
   A node with no `url` is a folder.
   ========================================================= */

const BookmarksCore = {
  ROOT: "0",           // the invisible root; its children are the top folders
  DEFAULT_PARENT: "1", // "Bookmarks bar" — you cannot create items in the root

  hasApi() {
    return typeof chrome !== "undefined" && !!(chrome.bookmarks && chrome.bookmarks.getChildren);
  },

  isFolder(node) {
    return !!node && !node.url;
  },

  children(id) {
    return new Promise((res) => {
      try { chrome.bookmarks.getChildren(String(id), (n) => res(n || [])); }
      catch { res([]); }
    });
  },

  node(id) {
    return new Promise((res) => {
      try { chrome.bookmarks.get(String(id), (n) => res((n && n[0]) || null)); }
      catch { res(null); }
    });
  },

  search(query) {
    return new Promise((res) => {
      try { chrome.bookmarks.search(query, (n) => res(n || [])); }
      catch { res([]); }
    });
  },

  create(obj) {
    return new Promise((res) => {
      try { chrome.bookmarks.create(obj, (n) => res(n || null)); }
      catch { res(null); }
    });
  },

  remove(id) {
    return new Promise((res) => {
      try { chrome.bookmarks.remove(String(id), () => res(true)); }
      catch { res(false); }
    });
  },

  removeTree(id) {
    return new Promise((res) => {
      try { chrome.bookmarks.removeTree(String(id), () => res(true)); }
      catch { res(false); }
    });
  },

  /** Breadcrumb trail for a folder, root-first (root itself excluded). */
  async path(id) {
    const out = [];
    let cur = String(id);
    let guard = 0;
    while (cur && cur !== this.ROOT && guard++ < 50) {
      const n = await this.node(cur);
      if (!n) break;
      out.unshift({ id: n.id, title: n.title || "(untitled)" });
      cur = n.parentId;
    }
    return out;
  },

  /** How many bookmarks (not folders) live under this subtree. */
  async countUnder(id) {
    let total = 0;
    const walk = async (fid) => {
      const kids = await this.children(fid);
      for (const k of kids) {
        if (this.isFolder(k)) await walk(k.id);
        else total++;
      }
    };
    await walk(String(id));
    return total;
  },

  /** Re-render hook: fires whenever bookmarks change anywhere in the browser. */
  onChange(fn) {
    if (!this.hasApi()) return;
    ["onCreated", "onRemoved", "onChanged", "onMoved"].forEach((ev) => {
      try { chrome.bookmarks[ev].addListener(fn); } catch {}
    });
  },
};
