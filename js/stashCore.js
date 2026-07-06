/* =========================================================
   stashCore.js — shared stash data layer.
   Source of truth is chrome.storage.local so ALL surfaces
   share it live: the new-tab board, the save popup, and the
   in-page hover card (content script). Falls back to
   localStorage when run outside the extension (dev preview).

   Usage: StashCore.init(() => { ...ready... });
   After init, loadItems()/loadTags() are synchronous (cache).
   ========================================================= */

const StashCore = {
  DEFAULT_TAGS: ["movie", "watch", "read", "music", "buy", "code", "idea"],

  _items: [],
  _tags: [],
  _ready: false,
  _onChange: null,

  hasChrome() {
    return typeof chrome !== "undefined" && chrome.storage && chrome.storage.local;
  },
  onExtPage() {
    return typeof location !== "undefined" && location.protocol === "chrome-extension:";
  },

  newId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  },

  onChange(fn) { this._onChange = fn; },
  _emit() { if (this._onChange) this._onChange(); },

  loadItems() { return this._items; },
  loadTags() { return this._tags.length ? this._tags : this.DEFAULT_TAGS; },

  init(cb) {
    if (!this.hasChrome()) {                 // dev / preview fallback
      this._loadLocal();
      this._ready = true;
      try {
        window.addEventListener("storage", (e) => {
          if (e.key === "stashItems" || e.key === "stashTags") { this._loadLocal(); this._emit(); }
        });
      } catch {}
      cb && cb();
      return;
    }

    chrome.storage.local.get(["stashItems", "stashTags", "stashMigrated"], (r) => {
      this._items = Array.isArray(r.stashItems) ? r.stashItems : [];
      this._tags = Array.isArray(r.stashTags) && r.stashTags.length ? r.stashTags : [...this.DEFAULT_TAGS];

      // one-time import of the old localStorage stash (extension pages only)
      if (this.onExtPage() && !r.stashMigrated) {
        const old = this._readOldLocal();
        if (old.length) {
          const seen = new Set(this._items.map((i) => i.id));
          old.forEach((o) => { if (!seen.has(o.id)) this._items.push(o); });
        }
        chrome.storage.local.set({ stashMigrated: true });
      }

      this._normalize();
      chrome.storage.local.set({ stashItems: this._items, stashTags: this._tags });
      this._ready = true;

      chrome.storage.onChanged.addListener((ch, area) => {
        if (area !== "local") return;
        if (ch.stashItems) this._items = ch.stashItems.newValue || [];
        if (ch.stashTags) this._tags = ch.stashTags.newValue || [...this.DEFAULT_TAGS];
        if (ch.stashItems || ch.stashTags) this._emit();
      });

      cb && cb();
    });
  },

  saveItems(items) {
    this._items = items;
    if (this.hasChrome()) chrome.storage.local.set({ stashItems: items });
    else localStorage.setItem("stashItems", JSON.stringify(items));
  },
  saveTags(tags) {
    this._tags = tags;
    if (this.hasChrome()) chrome.storage.local.set({ stashTags: tags });
    else localStorage.setItem("stashTags", JSON.stringify(tags));
  },

  // read-modify-write so a not-yet-loaded cache can never clobber storage
  _mutate(key, fn) {
    if (this.hasChrome()) {
      chrome.storage.local.get(key, (r) => {
        const cur = Array.isArray(r[key]) ? r[key] : (key === "stashTags" ? [...this.DEFAULT_TAGS] : []);
        const next = fn(cur);
        if (key === "stashItems") this._items = next; else this._tags = next;
        chrome.storage.local.set({ [key]: next });
      });
    } else {
      const cur = key === "stashItems" ? this._items : this._tags;
      const next = fn(cur.slice());
      if (key === "stashItems") this._items = next; else this._tags = next;
      localStorage.setItem(key, JSON.stringify(next));
    }
  },

  addItem(item) { this._mutate("stashItems", (items) => [item, ...items]); return this._items; },

  addTag(tag) {
    tag = (tag || "").trim().toLowerCase();
    if (!tag) return null;
    this._mutate("stashTags", (tags) => tags.includes(tag) ? tags : [...tags, tag]);
    return tag;
  },
  removeTag(tag) { this._mutate("stashTags", (tags) => tags.filter((t) => t !== tag)); },

  // ---- internal ----
  _normalize() {
    this._items.forEach((i) => {
      if (i.tag !== undefined) { i.tags = i.tag ? [i.tag] : (Array.isArray(i.tags) ? i.tags : []); delete i.tag; }
      if (!Array.isArray(i.tags)) i.tags = [];
      if (!i.id) i.id = this.newId();
    });
  },
  _readOldLocal() {
    let arr = [];
    try { arr = JSON.parse(localStorage.getItem("stash")) || []; } catch {}
    if (!Array.isArray(arr)) arr = [];
    arr.forEach((i) => { if (!i.id) i.id = this.newId(); });
    return arr;
  },
  _loadLocal() {
    try { this._items = JSON.parse(localStorage.getItem("stashItems")) || this._readOldLocal(); } catch { this._items = []; }
    if (!Array.isArray(this._items)) this._items = [];
    let t = null; try { t = JSON.parse(localStorage.getItem("stashTags")); } catch {}
    this._tags = Array.isArray(t) && t.length ? t : [...this.DEFAULT_TAGS];
    this._normalize();
  },
};

if (typeof module !== "undefined" && module.exports) module.exports = { StashCore };
