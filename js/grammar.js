/* =========================================================
   grammar.js — runs on every page. Grammar layer of the
   typing assistant, two services (js/grammarEngine.js):

   · online grammar fix — when you pause typing, the text is
     checked (LanguageTool, free). A popup lists the fixes:
     click one to apply it, or "apply all". With auto-write
     on (>grammar auto) fixes are applied silently.
   · AI rewrite — Alt+R fixes the current text box with your
     configured AI provider (>ai). Shift+Alt+R = polish mode
     (rewrites for clarity, not just correctness).

   Off by default — turn on with >grammar in the new tab.
   ========================================================= */

(() => {
  if (window.__nyxGrammarLoaded) return;
  window.__nyxGrammarLoaded = true;

  let CFG = { on: false, auto: false, lang: "auto", btn: true };
  let ACCENT = "#8ab4ff";

  try {
    chrome.storage?.local?.get(["grammarCfg", "accentColor"], (r) => {
      if (r.grammarCfg) CFG = { ...CFG, ...r.grammarCfg };
      if (r.accentColor) ACCENT = r.accentColor;
    });
    chrome.storage?.onChanged?.addListener((ch, area) => {
      if (area !== "local") return;
      if (ch.grammarCfg) {
        CFG = { ...CFG, ...(ch.grammarCfg.newValue || {}) };
        if (!CFG.on) hide();
        if (CFG.btn === false) btnHide();
      }
      if (ch.accentColor) ACCENT = ch.accentColor.newValue || ACCENT;
    });
  } catch { return; /* no extension context */ }

  /* ---------- which fields we work on ---------- */

  function editable(el) {
    if (!el || el.id === "searchInput") return null;
    if (el.tagName === "TEXTAREA") return "area";
    if (el.tagName === "INPUT" && ["text", "search"].includes((el.type || "text").toLowerCase())) return "input";
    if (el.isContentEditable) return "ce";
    return null;
  }

  /* For contenteditable we only touch the caret's text node, so
     rich formatting (Gmail etc.) is never destroyed. */
  function ceNode() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    const node = sel.getRangeAt(0).startContainer;
    return node.nodeType === 3 ? node : null;
  }

  function getText(el, kind) {
    if (kind === "ce") { const n = ceNode(); return n ? n.textContent : null; }
    return el.value;
  }

  function getCaret(el, kind) {
    if (kind === "ce") {
      const sel = window.getSelection();
      return sel && sel.rangeCount ? sel.getRangeAt(0).startOffset : 0;
    }
    return el.selectionStart ?? el.value.length;
  }

  function setText(el, kind, text, caret) {
    if (kind === "ce") {
      const n = ceNode();
      if (!n) return;
      n.textContent = text;
      try {
        const sel = window.getSelection();
        const range = document.createRange();
        const p = Math.min(caret, text.length);
        range.setStart(n, p); range.setEnd(n, p);
        sel.removeAllRanges(); sel.addRange(range);
      } catch {}
    } else {
      el.value = text;
      const p = Math.min(caret, text.length);
      try { el.setSelectionRange(p, p); } catch {}
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  /* ---------- popup (matches the typing.js look) ---------- */

  let POP = null, TARGET = null;

  function hide() { if (POP) POP.remove(); POP = null; TARGET = null; }

  function box() {
    hide();
    POP = document.createElement("div");
    POP.id = "nyx-grammar-pop";
    POP.setAttribute("style",
      "all:initial; position:fixed; z-index:2147483646; min-width:190px; max-width:320px;" +
      "background:rgba(18,20,26,0.96); backdrop-filter:blur(10px);" +
      "border:1px solid rgba(255,255,255,0.12); border-radius:10px; padding:4px;" +
      "box-shadow:0 8px 28px rgba(0,0,0,0.45);" +
      "font:13px/1.4 system-ui,-apple-system,sans-serif; color:#e8eaef;");
    document.documentElement.appendChild(POP);
    return POP;
  }

  function row(html, onClick, style) {
    const r = document.createElement("div");
    r.setAttribute("style",
      "all:initial; display:block; padding:6px 10px; border-radius:7px; font:13px system-ui; color:#e8eaef;" +
      (onClick ? "cursor:pointer;" : "cursor:default;") + (style || ""));
    if (onClick) {
      r.addEventListener("mousedown", (e) => { e.preventDefault(); onClick(); });
      r.addEventListener("mouseenter", () => (r.style.background = "rgba(255,255,255,0.10)"));
      r.addEventListener("mouseleave", () => (r.style.background = "transparent"));
    }
    r.append(...html);
    return r;
  }

  function span(text, color, extra) {
    const s = document.createElement("span");
    s.setAttribute("style", "all:initial; font:13px system-ui; color:" + (color || "#e8eaef") + ";" + (extra || ""));
    s.textContent = text;
    return s;
  }

  function place(el) {
    if (!POP) return;
    const r = el.getBoundingClientRect ? el.getBoundingClientRect() : el; // element or rect
    const pw = POP.offsetWidth, ph = POP.offsetHeight;
    let x = Math.min(r.left, innerWidth - pw - 8);
    let y = r.bottom + 6;
    if (y + ph > innerHeight - 8) y = r.top - ph - 6;
    POP.style.left = Math.max(4, x) + "px";
    POP.style.top = Math.max(4, y) + "px";
  }

  function flash(el, text, ms) {
    box();
    POP.appendChild(row([span("✦ ", ACCENT), span(text)], null));
    place(el);
    setTimeout(() => hide(), ms || 1600);
  }

  /* ---------- personal dictionary ---------- */

  function pdictAdd(word) {
    word = (word || "").toLowerCase().trim();
    if (!word) return;
    try {
      chrome.storage.local.get("personalDict", (r) => {
        const list = Array.isArray(r.personalDict) ? r.personalDict : [];
        if (!list.includes(word)) {
          list.push(word);
          chrome.storage.local.set({ personalDict: list });
        }
      });
    } catch {}
  }

  /* ---------- applying LanguageTool fixes ---------- */

  function applyFixes(el, kind, checkedText, matches, only) {
    const cur = getText(el, kind);
    if (cur !== checkedText) return 0; // text moved on — stale fixes
    const caret = getCaret(el, kind);
    let text = checkedText, delta = 0, newCaret = caret, applied = 0;

    const fixedWords = {};
    for (const m of matches) {
      if (only != null && m !== only) continue;
      // never touch the region the caret is inside of
      if (caret > m.offset && caret <= m.offset + m.length) continue;
      text = text.slice(0, m.offset + delta) + m.fix + text.slice(m.offset + delta + m.length);
      const d = m.fix.length - m.length;
      if (m.offset + m.length <= caret) newCaret += d;
      delta += d;
      applied++;
      if (/^[\p{L}\p{M}'’-]+$/u.test(m.bad)) fixedWords[m.bad] = (fixedWords[m.bad] || 0) + 1;
    }
    if (applied) {
      setText(el, kind, text, newCaret);
      try { chrome.runtime.sendMessage({ type: "stat-flush", stats: { fixes: applied, top: fixedWords } }); } catch {}
    }
    return applied;
  }

  function showFixes(el, kind, checkedText, matches) {
    box();
    if (matches.length > 1) {
      POP.appendChild(row(
        [span("✓ ", ACCENT), span(`apply all ${matches.length} fixes`)],
        () => { applyFixes(el, kind, getText(el, kind), matches); hide(); },
        "font-weight:600;"
      ));
    }
    for (const m of matches.slice(0, 6)) {
      const r = row(
        [span(m.bad.length > 18 ? m.bad.slice(0, 17) + "…" : m.bad, "#e07878", "text-decoration:line-through; margin-right:7px;"),
         span(m.fix.length > 22 ? m.fix.slice(0, 21) + "…" : m.fix, "#8fd49a")],
        () => {
          const left = matches.filter((x) => x !== m);
          applyFixes(el, kind, getText(el, kind), matches, m);
          left.length ? showFixesLater(el, kind) : hide();
        },
        "display:flex; align-items:center;"
      );
      // "that word is fine" — add it to the personal dictionary
      if (/^[\p{L}\p{M}'’-]+$/u.test(m.bad)) {
        const plus = span("＋", "#7a8194", "margin-left:auto; padding-left:12px; cursor:pointer;");
        plus.title = "add to my dictionary — stop flagging this word";
        plus.addEventListener("mousedown", (e) => { e.preventDefault(); e.stopPropagation(); pdictAdd(m.bad); r.remove(); });
        plus.addEventListener("mouseenter", () => (plus.style.color = ACCENT));
        plus.addEventListener("mouseleave", () => (plus.style.color = "#7a8194"));
        r.appendChild(plus);
      }
      POP.appendChild(r);
    }
    const hint = row([span("Alt+R rewrite with AI · Esc", "#5d6373", "font:10px system-ui;")], null, "padding:4px 10px 2px;");
    POP.appendChild(hint);
    place(el);
    TARGET = el;
  }

  // after one fix is applied the offsets shift — just re-check
  function showFixesLater(el, kind) { hide(); setTimeout(() => check(el, kind), 250); }

  /* ---------- the pause-triggered check ---------- */

  const lastChecked = new WeakMap();
  let timer = null, seq = 0;

  function check(el, kind) {
    if (!CFG.on) return;
    const text = getText(el, kind);
    if (!text || text.trim().length < 8 || text.length > 4000) return;
    if (lastChecked.get(el) === text) return;
    if (document.getElementById("nyx-typing-pop")) {
      // word-suggestion popup is open — try again once it's gone
      clearTimeout(timer);
      timer = setTimeout(() => check(el, kind), 900);
      return;
    }
    lastChecked.set(el, text);

    const my = ++seq;
    try {
      chrome.runtime.sendMessage({ type: "grammar-check", text, lang: CFG.lang }, (resp) => {
        if (chrome.runtime.lastError || my !== seq || document.activeElement !== el) return;
        if (!resp || !resp.ok || !resp.matches || !resp.matches.length) return;
        if (getText(el, kind) !== text) return; // kept typing
        if (CFG.auto) {
          const n = applyFixes(el, kind, text, resp.matches);
          lastChecked.set(el, getText(el, kind));
          if (n) flash(el, `grammar: fixed ${n} ${n === 1 ? "thing" : "things"}`);
        } else {
          showFixes(el, kind, text, resp.matches);
        }
      });
    } catch {}
  }

  document.addEventListener("input", (e) => {
    const el = e.target;
    const kind = editable(el);
    if (!kind) return;
    if (CFG.btn !== false) {
      if (gateText(el, kind).length >= 4) btnShowSoon(el, kind);
      else if (BTN_FOR === el) btnHide();
    }
    if (!CFG.on) return;
    if (POP && !POP.contains(el)) hide();
    clearTimeout(timer);
    timer = setTimeout(() => check(el, kind), 1300);
  }, true);

  /* ---------- the one-click ✦ rewrite button ---------- */

  let BTN = null, BTN_FOR = null, BTN_KIND = null;

  // whole visible text, only for deciding if the button is worth showing
  function gateText(el, kind) {
    return ((kind === "ce" ? el.innerText : el.value) || "").trim();
  }

  function btnHide() { if (BTN) BTN.remove(); BTN = null; BTN_FOR = null; clearTimeout(btnTimer); }

  /* while the user is typing, keep the button out of the way —
     it only (re)appears after a short pause */
  let btnTimer = null;
  function btnShowSoon(el, kind) {
    if (BTN && BTN_FOR === el) BTN.style.display = "none";
    clearTimeout(btnTimer);
    btnTimer = setTimeout(() => { if (document.activeElement === el) btnShow(el, kind); }, 900);
  }

  function btnPlace() {
    if (!BTN || !BTN_FOR) return;
    const r = BTN_FOR.getBoundingClientRect();
    if (!r.width || r.bottom < 10 || r.top > innerHeight - 10) return btnHide();
    const S = 22, GAP = 6; // button size + distance from the box
    let x, y;
    if (r.right + GAP + S <= innerWidth - 4) {
      x = r.right + GAP; y = r.bottom - S;          // beside the box, never over text
    } else if (r.bottom + GAP + S <= innerHeight - 4) {
      x = r.right - S; y = r.bottom + GAP;          // below the box
    } else if (r.top - GAP - S >= 4) {
      x = r.right - S; y = r.top - GAP - S;         // above the box
    } else {
      return btnHide(); // nowhere that doesn't cover text — Alt+R still works
    }
    BTN.style.left = Math.max(4, Math.min(x, innerWidth - S - 4)) + "px";
    BTN.style.top = Math.max(4, Math.min(y, innerHeight - S - 4)) + "px";
  }

  function btnShow(el, kind) {
    if (BTN_FOR === el) { BTN.style.display = "flex"; return btnPlace(); }
    btnHide();
    BTN_FOR = el; BTN_KIND = kind;
    BTN = document.createElement("div");
    BTN.id = "nyx-ai-btn";
    BTN.title = "Fix this text with AI (Shift-click: polish) — Alt+R";
    BTN.textContent = "✦";
    BTN.setAttribute("style",
      "all:initial; position:fixed; z-index:2147483645; width:22px; height:22px;" +
      "display:flex; align-items:center; justify-content:center; cursor:pointer;" +
      "background:" + ACCENT + "; color:#101218; border-radius:50%;" +
      "font:12px system-ui; box-shadow:0 3px 10px rgba(0,0,0,0.35); opacity:0.45;" +
      "transition:opacity 0.15s;");
    BTN.addEventListener("mouseenter", () => { if (BTN) BTN.style.opacity = "1"; });
    BTN.addEventListener("mouseleave", () => { if (BTN) BTN.style.opacity = "0.45"; });
    BTN.addEventListener("mousedown", (e) => {
      if (e.button === 2) return; // right-click opens the tone menu
      e.preventDefault(); e.stopPropagation();
      if (busy) return;
      BTN.textContent = "…";
      rewrite(BTN_FOR, BTN_KIND, e.shiftKey ? "improve" : "fix");
    });
    BTN.addEventListener("contextmenu", (e) => {
      e.preventDefault(); e.stopPropagation();
      toneMenu();
    });
    document.documentElement.appendChild(BTN);
    btnPlace();
  }

  document.addEventListener("focusin", (e) => {
    const kind = editable(e.target);
    if (kind && CFG.btn !== false && gateText(e.target, kind).length >= 4)
      btnShow(e.target, kind);
  }, true);

  /* ---------- tone menu (right-click the ✦ button) ---------- */

  const TONES = [
    ["fix",     "fix grammar"],
    ["improve", "polish"],
    ["formal",  "formal tone"],
    ["casual",  "casual tone"],
    ["shorter", "make it shorter"],
  ];

  function toneMenu() {
    if (!BTN_FOR || busy) return;
    const el = BTN_FOR, kind = BTN_KIND;
    box();
    for (const [mode, label] of TONES) {
      POP.appendChild(row([span("✦ ", ACCENT), span(label)], () => {
        hide();
        if (BTN) BTN.textContent = "…";
        rewrite(el, kind, mode);
      }));
    }
    place(BTN || el);
  }

  /* ---------- Alt+A — draft a reply to selected text ---------- */

  function replyDraft() {
    const s = window.getSelection();
    const text = s ? s.toString().trim() : "";
    if (!text || text.length < 8 || busy) return false;
    let rect;
    try { rect = s.getRangeAt(0).getBoundingClientRect(); } catch { return false; }
    busy = true;
    flash(rect, "drafting a reply…", 30000);
    try {
      chrome.runtime.sendMessage({ type: "ai-reply", text }, (resp) => {
        busy = false;
        if (chrome.runtime.lastError) return hide();
        if (!resp || !resp.ok) return flash(rect, (resp && resp.error) || "reply failed", 3200);
        showReply(rect, resp.text);
      });
    } catch { busy = false; hide(); }
    return true;
  }

  function showReply(rect, text) {
    box();
    POP.style.maxWidth = "380px";
    POP.appendChild(row([span("✦ ", ACCENT), span("suggested reply", "#aab", "font:600 12px system-ui;")], null));
    POP.appendChild(row([span(text)], null, "white-space:pre-wrap; max-height:240px; overflow:auto;"));
    POP.appendChild(row([span("copy", ACCENT, "font-weight:600;")], () => {
      try { navigator.clipboard.writeText(text); } catch {}
      hide();
    }, "text-align:center;"));
    place(rect);
    TARGET = null;
  }

  /* ---------- Alt+R — AI rewrite the current box ---------- */

  let busy = false;

  function rewrite(el, kind, mode) {
    if (busy) return;
    const text = getText(el, kind);
    if (!text || text.trim().length < 2) return;
    busy = true;
    flash(el, mode === "improve" ? "polishing with AI…" : "fixing with AI…", 30000);

    try {
      chrome.runtime.sendMessage({ type: "ai-rewrite", text, mode }, (resp) => {
        busy = false;
        if (BTN) BTN.textContent = "✦";
        if (chrome.runtime.lastError) return hide();
        if (!resp || !resp.ok) return flash(el, resp && resp.error ? resp.error : "AI rewrite failed", 3200);
        if (getText(el, kind) !== text) return hide(); // text changed meanwhile
        setText(el, kind, resp.text, resp.text.length);
        lastChecked.set(el, resp.text);
        try { chrome.runtime.sendMessage({ type: "stat-flush", stats: { ai: 1 } }); } catch {}
        flash(el, "✓ rewritten");
      });
    } catch { busy = false; if (BTN) BTN.textContent = "✦"; hide(); }
  }

  document.addEventListener("keydown", (e) => {
    if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === "r" || e.key === "R" || e.code === "KeyR")) {
      const el = document.activeElement;
      const kind = editable(el);
      if (!kind) return;
      e.preventDefault();
      e.stopPropagation();
      rewrite(el, kind, e.shiftKey ? "improve" : "fix");
      return;
    }
    if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.code === "KeyA") {
      if (replyDraft()) { e.preventDefault(); e.stopPropagation(); }
      return;
    }
    if (POP && e.key === "Escape") { e.preventDefault(); e.stopPropagation(); hide(); }
  }, true);

  document.addEventListener("focusout", () => setTimeout(() => {
    if (POP && TARGET && document.activeElement !== TARGET) hide();
    if (BTN_FOR && document.activeElement !== BTN_FOR) btnHide();
  }, 120), true);
  document.addEventListener("mousedown", (e) => {
    if (POP && !busy && !POP.contains(e.target) && (!BTN || !BTN.contains(e.target))) hide();
  }, true);
  window.addEventListener("scroll", () => { if (!busy) hide(); btnPlace(); }, true);
  window.addEventListener("resize", () => { hide(); btnPlace(); });
})();
