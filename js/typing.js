/* =========================================================
   typing.js — runs on every page. The typing assistant:
   autocomplete + spelling fixes while you type in any text
   box. Suggestions come from the background service worker
   (js/typingEngine.js) — local dictionary or online.

   Keys while the popup is open:
   ↑/↓ pick · Tab accept · Esc dismiss · click accepts too.

   Off by default — turn on with >typing in the new tab.
   ========================================================= */

(() => {
  if (window.__nyxTypingLoaded) return;
  window.__nyxTypingLoaded = true;

  let CFG = { on: false, mode: "local", lang: "en" };
  let ACCENT = "#8ab4ff";
  let warnedNoDict = false;

  try {
    chrome.storage?.local?.get(["typingCfg", "accentColor"], (r) => {
      if (r.typingCfg) CFG = { ...CFG, ...r.typingCfg };
      if (r.accentColor) ACCENT = r.accentColor;
    });
    chrome.storage?.onChanged?.addListener((ch, area) => {
      if (area !== "local") return;
      if (ch.typingCfg) { CFG = { ...CFG, ...(ch.typingCfg.newValue || {}) }; if (!CFG.on) hide(); }
      if (ch.accentColor) ACCENT = ch.accentColor.newValue || ACCENT;
    });
  } catch { return; /* no extension context */ }

  /* ---------- typing stats (batched, flushed to the background) ---------- */

  let STAT = { words: 0, sug: 0, top: {} }, statTimer = null;

  function statBump(patch) {
    STAT.words += patch.words || 0;
    STAT.sug += patch.sug || 0;
    for (const [w, n] of Object.entries(patch.top || {})) STAT.top[w] = (STAT.top[w] || 0) + n;
    clearTimeout(statTimer);
    statTimer = setTimeout(statFlushNow, 4000);
  }

  function statFlushNow() {
    if (!STAT.words && !STAT.sug && !Object.keys(STAT.top).length) return;
    try { chrome.runtime.sendMessage({ type: "stat-flush", stats: STAT }); } catch {}
    STAT = { words: 0, sug: 0, top: {} };
  }
  window.addEventListener("pagehide", statFlushNow);

  // true if the char just before the freshly typed delimiter is a letter
  function endedWord(el, kind) {
    let s, pos;
    if (kind === "ce") {
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return false;
      const r = sel.getRangeAt(0);
      if (r.startContainer.nodeType !== 3) return false;
      s = r.startContainer.textContent; pos = r.startOffset;
    } else {
      pos = el.selectionStart;
      if (pos == null) return false;
      s = el.value;
    }
    return pos >= 2 && /[\p{L}\p{M}]/u.test(s[pos - 2] || "");
  }

  /* ---------- current word under the caret ---------- */

  const WORD_RE = /[\p{L}\p{M}'’-]+$/u;

  function editable(el) {
    if (!el) return null;
    if (el.id === "searchInput") return null; // Nyx search bar has its own suggestions
    if (el.tagName === "TEXTAREA") return "area";
    if (el.tagName === "INPUT") {
      const t = (el.type || "text").toLowerCase();
      return ["text", "search"].includes(t) ? "input" : null;
    }
    if (el.isContentEditable) return "ce";
    return null;
  }

  function wordAt(el, kind) {
    if (kind === "input" || kind === "area") {
      const pos = el.selectionStart;
      if (pos == null || pos !== el.selectionEnd) return null;
      const after = el.value.slice(pos, pos + 1);
      if (after && /[\p{L}\p{M}]/u.test(after)) return null; // mid-word
      const m = WORD_RE.exec(el.value.slice(0, pos));
      return m ? { word: m[0], start: pos - m[0].length, pos } : null;
    }
    // contenteditable
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || !sel.isCollapsed) return null;
    const range = sel.getRangeAt(0);
    const node = range.startContainer;
    if (node.nodeType !== 3) return null;
    const pos = range.startOffset;
    const after = node.textContent.slice(pos, pos + 1);
    if (after && /[\p{L}\p{M}]/u.test(after)) return null;
    const m = WORD_RE.exec(node.textContent.slice(0, pos));
    return m ? { word: m[0], start: pos - m[0].length, pos, node } : null;
  }

  /* ---------- caret pixel position ---------- */

  const MIRROR_PROPS = [
    "boxSizing", "width", "paddingTop", "paddingRight", "paddingBottom", "paddingLeft",
    "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth",
    "fontFamily", "fontSize", "fontWeight", "fontStyle", "letterSpacing",
    "lineHeight", "textTransform", "textIndent", "whiteSpace", "wordWrap", "wordBreak",
  ];

  function caretRect(el, kind, upto) {
    if (kind === "ce") {
      const sel = window.getSelection();
      if (sel && sel.rangeCount) {
        const r = sel.getRangeAt(0).cloneRange();
        r.collapse(true);
        const rects = r.getClientRects();
        if (rects.length) return rects[0];
      }
      return el.getBoundingClientRect();
    }
    // mirror-div measurement for input/textarea
    const cs = getComputedStyle(el);
    const div = document.createElement("div");
    for (const p of MIRROR_PROPS) div.style[p] = cs[p];
    div.style.position = "fixed";
    div.style.top = "-9999px";
    div.style.left = "0";
    div.style.visibility = "hidden";
    if (kind === "input") { div.style.whiteSpace = "pre"; div.style.width = "auto"; }
    else div.style.whiteSpace = "pre-wrap";
    div.textContent = el.value.slice(0, upto);
    const mark = document.createElement("span");
    mark.textContent = "​";
    div.appendChild(mark);
    document.documentElement.appendChild(div);
    const base = el.getBoundingClientRect();
    const top = base.top + mark.offsetTop - el.scrollTop;
    const left = base.left + mark.offsetLeft - el.scrollLeft;
    const h = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.3 || 18;
    div.remove();
    return {
      top: Math.max(base.top, Math.min(top, base.bottom)),
      bottom: Math.max(base.top, Math.min(top + h, base.bottom)),
      left: Math.max(base.left, Math.min(left, base.right)),
    };
  }

  /* ---------- popup ---------- */

  let POP = null, ITEMS = [], SEL = 0, TARGET = null;

  function hide() {
    if (POP) POP.remove();
    POP = null; ITEMS = []; SEL = 0; TARGET = null;
  }

  function show(items, target, note) {
    hide();
    ITEMS = items; SEL = 0; TARGET = target;

    POP = document.createElement("div");
    POP.id = "nyx-typing-pop";
    POP.setAttribute("style",
      "all:initial; position:fixed; z-index:2147483646; min-width:150px; max-width:280px;" +
      "background:rgba(18,20,26,0.96); backdrop-filter:blur(10px);" +
      "border:1px solid rgba(255,255,255,0.12); border-radius:10px; padding:4px;" +
      "box-shadow:0 8px 28px rgba(0,0,0,0.45);" +
      "font:13px/1.4 system-ui,-apple-system,sans-serif; color:#e8eaef;");

    if (note) {
      const n = document.createElement("div");
      n.setAttribute("style", "all:initial; display:block; padding:7px 10px; font:12px system-ui; color:#aab; cursor:default;");
      n.textContent = note;
      POP.appendChild(n);
    }

    items.forEach((it, i) => {
      const row = document.createElement("div");
      row.dataset.i = i;
      row.setAttribute("style", rowStyle(i === SEL));
      const tag = document.createElement("span");
      tag.setAttribute("style", "all:initial; font:11px system-ui; margin-right:8px; color:" + (it.kind === "fix" ? ACCENT : "#7a8194") + ";");
      tag.textContent = it.kind === "fix" ? "fix" : "→";
      const w = document.createElement("span");
      w.setAttribute("style", "all:initial; font:13px system-ui; color:#e8eaef;");
      w.textContent = it.word;
      row.appendChild(tag); row.appendChild(w);
      row.addEventListener("mousedown", (e) => { e.preventDefault(); accept(i); });
      row.addEventListener("mouseenter", () => { SEL = i; paint(); });
      POP.appendChild(row);
    });

    if (items.length) {
      const hint = document.createElement("div");
      hint.setAttribute("style", "all:initial; display:block; padding:4px 10px 2px; font:10px system-ui; color:#5d6373; cursor:default;");
      hint.textContent = "Tab accept · ↑↓ pick · Esc";
      POP.appendChild(hint);
    }

    document.documentElement.appendChild(POP);

    const r = caretRect(target.el, target.kind, target.pos);
    const pw = POP.offsetWidth, ph = POP.offsetHeight;
    let x = Math.min(r.left, innerWidth - pw - 8);
    let y = r.bottom + 6;
    if (y + ph > innerHeight - 8) y = r.top - ph - 6;
    POP.style.left = Math.max(4, x) + "px";
    POP.style.top = Math.max(4, y) + "px";
  }

  function rowStyle(sel) {
    return "all:initial; display:flex; align-items:center; padding:6px 10px; border-radius:7px; cursor:pointer;" +
      (sel ? "background:rgba(255,255,255,0.10);" : "");
  }

  function paint() {
    if (!POP) return;
    POP.querySelectorAll("[data-i]").forEach((row) => {
      row.setAttribute("style", rowStyle(+row.dataset.i === SEL));
    });
  }

  function accept(i) {
    const it = ITEMS[i ?? SEL];
    if (!it || !TARGET) return hide();
    const { el, kind } = TARGET;
    const cur = wordAt(el, kind);
    if (!cur) return hide();
    statBump({ sug: 1, top: it.kind === "fix" ? { [cur.word]: 1 } : {} });
    const text = it.word + " ";

    if (kind === "input" || kind === "area") {
      el.value = el.value.slice(0, cur.start) + text + el.value.slice(cur.pos);
      const np = cur.start + text.length;
      try { el.setSelectionRange(np, np); } catch {}
      el.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      const node = cur.node;
      node.textContent = node.textContent.slice(0, cur.start) + text + node.textContent.slice(cur.pos);
      const np = cur.start + text.length;
      try {
        const sel = window.getSelection();
        const range = document.createRange();
        range.setStart(node, np); range.setEnd(node, np);
        sel.removeAllRanges(); sel.addRange(range);
      } catch {}
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }
    hide();
  }

  /* ---------- ask the background for suggestions ---------- */

  let timer = null, seq = 0;

  function request(el, kind) {
    const cur = wordAt(el, kind);
    if (!cur || cur.word.length < 2) return hide();
    const my = ++seq;
    try {
      chrome.runtime.sendMessage(
        { type: "typing-suggest", word: cur.word, mode: CFG.mode, lang: CFG.lang },
        (resp) => {
          if (chrome.runtime.lastError || my !== seq || document.activeElement !== el) return;
          if (!resp) return hide();
          if (resp.needDict) {
            if (warnedNoDict) return hide();
            warnedNoDict = true;
            return show([], { el, kind, pos: cur.pos },
              `no "${CFG.lang}" dictionary yet — run  >typing dl  in Nyx`);
          }
          const items = (resp.items || []).filter((it) => it.word !== cur.word);
          if (!items.length) return hide();
          show(items, { el, kind, pos: cur.pos });
        }
      );
    } catch { hide(); }
  }

  document.addEventListener("input", (e) => {
    const el = e.target;
    const kind = editable(el);
    if (!kind) return;

    // count finished words (stats run even with suggestions off)
    if (e.data && e.data.length === 1 && /[^\p{L}\p{M}'’-]/u.test(e.data) && endedWord(el, kind))
      statBump({ words: 1 });

    if (!CFG.on) return;
    if (POP && POP.contains(el)) return;
    clearTimeout(timer);
    timer = setTimeout(() => request(el, kind), CFG.mode === "online" ? 220 : 120);
  }, true);

  document.addEventListener("keydown", (e) => {
    if (!POP || !ITEMS.length) {
      if (POP && e.key === "Escape") hide();
      return;
    }
    if (e.key === "ArrowDown") { e.preventDefault(); e.stopPropagation(); SEL = (SEL + 1) % ITEMS.length; paint(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); e.stopPropagation(); SEL = (SEL - 1 + ITEMS.length) % ITEMS.length; paint(); }
    else if (e.key === "Tab") { e.preventDefault(); e.stopPropagation(); accept(SEL); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); hide(); }
    else if (e.key === " " || e.key === "Enter") hide();
  }, true);

  document.addEventListener("focusout", () => setTimeout(() => {
    if (POP && TARGET && document.activeElement !== TARGET.el) hide();
  }, 100), true);
  window.addEventListener("scroll", hide, true);
  window.addEventListener("resize", hide);
})();
